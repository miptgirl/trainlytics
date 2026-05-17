# Phase 14 — Implementation Plan

## Status

| Group | Status | Notes |
|---|---|---|
| Group 1 — DB Migration & History Models | ✅ Complete | Migration 0013, models, _write_template_history helper |
| Group 2 — Template Versioning Logic | ✅ Complete | _write_template_history async; wired into create/update/plan endpoints |
| Group 3 — Backend: Comparison Endpoint & Schemas | ✅ Complete | Schemas in plan.py; GET /plan/sessions/{id}/comparison in plan_summary.py |
| Group 4 — Frontend: Comparison Panel & Card Update | ⬜ Not started | |
| Group 5 — Tests & Cleanup | ⬜ Not started | |

---

**Dependencies:**
- Group 2 depends on Group 1.
- Group 3 depends on Group 2 (needs the history tables populated).
- Group 4 depends on Group 3 (API contract must be final).
- Group 5 depends on Groups 2, 3, and 4.

---

## Group 1 — DB Migration & History Models

Files: `backend/alembic/versions/` (new migration), `backend/app/models/template.py`, `backend/app/models/plan.py`

### 1.1 Alembic migration

Schema changes:
- `strength_templates`: add `current_version INTEGER NOT NULL DEFAULT 1`.
- `planned_sessions`: add `template_version INTEGER NULL`.
- New table `strength_template_history`:
  ```sql
  CREATE TABLE strength_template_history (
      id          SERIAL PRIMARY KEY,
      template_id INTEGER REFERENCES strength_templates(id) ON DELETE CASCADE,
      version     INTEGER NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (template_id, version)
  );
  ```
- New table `strength_template_history_exercises`:
  ```sql
  CREATE TABLE strength_template_history_exercises (
      id           SERIAL PRIMARY KEY,
      history_id   INTEGER NOT NULL REFERENCES strength_template_history(id) ON DELETE CASCADE,
      exercise_id  INTEGER REFERENCES exercises(id) ON DELETE SET NULL,
      exercise_order INTEGER NOT NULL DEFAULT 0
  );
  ```
- New table `strength_template_history_sets`:
  ```sql
  CREATE TABLE strength_template_history_sets (
      id                   SERIAL PRIMARY KEY,
      history_exercise_id  INTEGER NOT NULL REFERENCES strength_template_history_exercises(id) ON DELETE CASCADE,
      set_order            INTEGER NOT NULL DEFAULT 0,
      reps                 INTEGER,
      weight_kg            FLOAT
  );
  ```

Data migration (in the same Alembic migration):
- For every existing `strength_templates` row: insert one `strength_template_history` row with `version = 1` and write its current exercises + sets into the history exercise/set tables.
- Do this in Python migration code (not raw SQL) using the existing `strength_template_exercises` and `strength_template_sets` tables.

### 1.2 SQLAlchemy models

In `backend/app/models/template.py`:

```python
class StrengthTemplateHistory(Base):
    __tablename__ = "strength_template_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int | None] = mapped_column(ForeignKey("strength_templates.id", ondelete="CASCADE"), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    exercises: Mapped[list["StrengthTemplateHistoryExercise"]] = relationship(
        "StrengthTemplateHistoryExercise",
        back_populates="history",
        order_by="StrengthTemplateHistoryExercise.exercise_order",
        cascade="all, delete-orphan",
    )

class StrengthTemplateHistoryExercise(Base):
    __tablename__ = "strength_template_history_exercises"
    id: Mapped[int] = mapped_column(primary_key=True)
    history_id: Mapped[int] = mapped_column(ForeignKey("strength_template_history.id", ondelete="CASCADE"), nullable=False)
    exercise_id: Mapped[int | None] = mapped_column(ForeignKey("exercises.id", ondelete="SET NULL"), nullable=True)
    exercise_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    history: Mapped["StrengthTemplateHistory"] = relationship("StrengthTemplateHistory", back_populates="exercises")
    sets: Mapped[list["StrengthTemplateHistorySet"]] = relationship(
        "StrengthTemplateHistorySet",
        back_populates="exercise",
        order_by="StrengthTemplateHistorySet.set_order",
        cascade="all, delete-orphan",
    )
    exercise: Mapped["Exercise"] = relationship("Exercise")  # for exercise.name lookups

class StrengthTemplateHistorySet(Base):
    __tablename__ = "strength_template_history_sets"
    id: Mapped[int] = mapped_column(primary_key=True)
    history_exercise_id: Mapped[int] = mapped_column(ForeignKey("strength_template_history_exercises.id", ondelete="CASCADE"), nullable=False)
    set_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(nullable=True)

    exercise: Mapped["StrengthTemplateHistoryExercise"] = relationship("StrengthTemplateHistoryExercise", back_populates="sets")
```

Add `current_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)` to `StrengthTemplate`.

In `backend/app/models/plan.py`:

Add `template_version: Mapped[int | None] = mapped_column(Integer, nullable=True)` to `PlannedSession`.

### 1.3 Shared helper function

Add `_write_template_history(db, template)` in `backend/app/services/templates.py` (or a new `backend/app/services/template_versioning.py`):
- Creates a `StrengthTemplateHistory` row with `template_id = template.id` and `version = template.current_version`.
- For each exercise in `template.exercises` (ordered), creates a `StrengthTemplateHistoryExercise` with the current `exercise_id` and `exercise_order`.
- For each set in that exercise, creates a `StrengthTemplateHistorySet` with `set_order`, `reps`, `weight_kg`.
- Does not commit — caller commits.

---

## Group 2 — Template Versioning Logic

Files: `backend/app/api/templates.py`, `backend/app/api/plans.py`

Dependencies: Group 1

### 2.1 Template create endpoint (`POST /templates`)

After inserting the new template and its exercises/sets (existing logic):
- Call `_write_template_history(db, template)` to write the version 1 snapshot.
- `template.current_version` is already 1 by default.

### 2.2 Template update endpoint (`PUT /templates/{id}`)

After updating template exercises/sets (existing logic):
- Increment `template.current_version += 1`.
- Call `_write_template_history(db, template)` with the updated exercises/sets.
- Commit includes both the template update and the new history row.

Note: the template update endpoint currently deletes all exercises and re-creates them. The helper is called after the re-creation so it reads the fresh exercise rows.

### 2.3 Plan session create (`POST /plan/{week_start}/sessions`)

After creating the `PlannedSession`:
- If `session_type == "strength"`:
  - Load `template.current_version`.
  - Set `session.template_version = template.current_version`.

### 2.4 Plan session update (`PUT /plan/{week_start}/sessions/{session_id}`)

- If `session_type == "strength"` and `body.template_id != session.template_id` (template changed):
  - Load new template, set `session.template_version = new_template.current_version`.
- If `session_type == "strength"` and template is unchanged: leave `template_version` as-is.

### 2.5 Copy from last week (`POST /plan/{week_start}/copy-from-last-week`)

For each strength session being copied:
- Load `current_version` from `prev_session.template_id` (the live template).
- Set `new_session.template_version = current_version`.
- This is a new plan for a new week — it plans against the template as it stands today.

---

## Group 3 — Backend: Comparison Endpoint & Schemas

Files: `backend/app/schemas/plan.py`, `backend/app/api/plan_summary.py`

Dependencies: Group 2

### 3.1 New Pydantic schemas (`backend/app/schemas/plan.py`)

```python
class SetComparisonRow(BaseModel):
    planned_reps: int | None
    planned_weight_kg: float | None
    actual_reps: int | None
    actual_weight_kg: float | None

class ExerciseComparison(BaseModel):
    exercise_id: int | None          # None if exercise was deleted
    exercise_name: str               # "Unknown exercise" if exercise_id is None
    source: Literal["both", "planned_only", "actual_only"]
    planned_volume: float            # sum(weight_kg * reps) for planned sets; 0.0 if none
    actual_volume: float
    sets: list[SetComparisonRow]     # paired by index; padded with None where lengths differ

class StrengthComparisonOut(BaseModel):
    exercises: list[ExerciseComparison]
    planned_total_volume: float
    actual_total_volume: float

class CardioComparisonOut(BaseModel):
    planned_distance_km: float | None
    actual_distance_km: float | None
    planned_duration_min: float | None
    actual_duration_min: float | None

class SessionComparisonOut(BaseModel):
    planned_session_id: int
    actual_session_id: int
    session_type: Literal["cardio", "strength"]
    cardio: CardioComparisonOut | None = None
    strength: StrengthComparisonOut | None = None
```

### 3.2 New endpoint `GET /plan/sessions/{planned_session_id}/comparison`

In `backend/app/api/plan_summary.py`:

```
GET /plan/sessions/{planned_session_id}/comparison
```

Logic:
1. Load `PlannedSession` by `id`; if missing or `user_id != current_user`: 403.
2. If `matched_session_id` is None: 404, `detail = "Session is not done"`.
3. If `session_type == "cardio"`:
   - Sum `distance_metres` and `duration_secs` across `PlannedCardioSegment` rows → km / min.
   - Load matched `CardioSession` (join on `session_id`); sum `CardioSegment.distance_meters` and `CardioSession.total_duration_seconds`.
   - Return `SessionComparisonOut(session_type="cardio", cardio=CardioComparisonOut(...))`.
4. If `session_type == "strength"`:
   - If `template_id` is None or `template_version` is None: 404, `detail = "No planned exercise data available (template deleted or session predates versioning)"`.
   - Load `StrengthTemplateHistory` WHERE `template_id = ps.template_id AND version = ps.template_version`; include exercises + sets + `exercise.name` via joined loads. If no history record: 404.
   - Load matched `StrengthSession` with exercises + sets + `exercise.name`.
   - Build exercise comparison list:
     - For each history exercise (in `exercise_order`): find matching entry in the logged session by `exercise_id`. Pair sets by index (zip with None padding). Compute volumes. `source = "both"` or `"planned_only"`.
     - For each logged exercise not in the history: append with `source = "actual_only"`.
   - Return `SessionComparisonOut(session_type="strength", strength=StrengthComparisonOut(...))`.

---

## Group 4 — Frontend: Comparison Panel & Card Update

Files: `frontend/src/lib/planApi.ts`, `frontend/src/components/plan/SessionComparisonPanel.tsx` (new), `frontend/src/components/plan/PlannedSessionCard.tsx`

Dependencies: Group 3

### 4.1 TypeScript types in `frontend/src/lib/planApi.ts`

```typescript
interface SetComparisonRow {
  planned_reps: number | null
  planned_weight_kg: number | null
  actual_reps: number | null
  actual_weight_kg: number | null
}
interface ExerciseComparison {
  exercise_id: number | null
  exercise_name: string
  source: 'both' | 'planned_only' | 'actual_only'
  planned_volume: number
  actual_volume: number
  sets: SetComparisonRow[]
}
interface StrengthComparisonOut {
  exercises: ExerciseComparison[]
  planned_total_volume: number
  actual_total_volume: number
}
interface CardioComparisonOut {
  planned_distance_km: number | null
  actual_distance_km: number | null
  planned_duration_min: number | null
  actual_duration_min: number | null
}
export interface SessionComparisonOut {
  planned_session_id: number
  actual_session_id: number
  session_type: 'cardio' | 'strength'
  cardio: CardioComparisonOut | null
  strength: StrengthComparisonOut | null
}
```

React Query hook:
```typescript
export function useSessionComparison(plannedSessionId: number | null) {
  return useQuery({
    queryKey: ['session-comparison', plannedSessionId],
    queryFn: () => apiFetch<SessionComparisonOut>(`/plan/sessions/${plannedSessionId}/comparison`),
    enabled: plannedSessionId != null,
    staleTime: 5 * 60 * 1000,
    retry: false,  // 404 for pre-versioning sessions should not retry
  })
}
```

### 4.2 New `SessionComparisonPanel.tsx`

Props: `{ plannedSessionId: number; sessionType: 'cardio' | 'strength' }`

States:
- Loading: show "Loading…" in `text-slate-400 text-xs`.
- Error (any, including 404): show "Planned data not available." in `text-slate-400 text-xs italic`.
- Success → render appropriate table.

**Cardio panel (when `data.cardio` is set):**
- `text-xs` table, two columns: **Planned** and **Actual**.
- Rows: Distance (`{val.toFixed(1)} km` or "—") and Duration (`{val.toFixed(0)} min` or "—").

**Strength panel (when `data.strength` is set):**
- For each `ExerciseComparison`:
  - Exercise name as `text-xs font-semibold text-slate-700`. Append `(not logged)` in slate-400 if `source === "planned_only"`, `(added)` if `source === "actual_only"`.
  - `text-xs` table: columns **Set**, **Planned**, **Actual**.
    - Each `SetComparisonRow` is one row. Set column: "1", "2", etc. Planned/Actual: `{reps} × {weight_kg} kg` or "—" if null.
  - Volume summary row (no set number, italic): **Volume** | `{planned_volume.toFixed(0)} kg` | `{actual_volume.toFixed(0)} kg`.
- Below all exercises: **Total volume** row (bold): `{planned_total_volume.toFixed(0)} kg` | `{actual_total_volume.toFixed(0)} kg`.
- Consistent compact styling: `text-xs`, slate palette, no external table border.

### 4.3 Update `PlannedSessionCard.tsx` (Done cards only)

Add `const [comparisonOpen, setComparisonOpen] = useState(false)`.

In the `status === 'done'` block (currently only "View session →"), add below it:

```tsx
<button
  onClick={() => setComparisonOpen(v => !v)}
  className="text-xs text-slate-500 hover:text-slate-700 font-medium"
>
  {comparisonOpen ? '▾' : '▸'} Compare planned vs. actual
</button>
{comparisonOpen && (
  <div className="mt-2 pt-2 border-t border-slate-100">
    <SessionComparisonPanel
      plannedSessionId={session.id}
      sessionType={session.session_type as 'cardio' | 'strength'}
    />
  </div>
)}
```

No other card variants (Planned, Skipped) are changed.

---

## Group 5 — Tests & Cleanup

Dependencies: Groups 2, 3, 4

Files: `backend/tests/test_templates.py` (update), `backend/tests/test_plan_comparison.py` (new)

### 5.1 Template versioning tests (add to `test_templates.py`)

- `test_create_template_writes_version_1_history` — POST a template with 2 exercises; assert `current_version = 1` and a history row with `version = 1` exists.
- `test_update_template_increments_version` — PUT the template with changed exercises; assert `current_version = 2` and a new history row with `version = 2` exists.
- `test_update_template_version_1_history_unchanged` — after update, version 1 history still exists and reflects the original exercises.

### 5.2 Plan creation records template_version (add to `test_plans.py`)

- `test_plan_session_stores_template_version` — create a strength planned session; assert `template_version = template.current_version`.
- `test_plan_session_edit_same_template_version_unchanged` — edit a planned session (change date only); assert `template_version` unchanged.
- `test_plan_session_edit_new_template_updates_version` — edit a planned session with a different template; assert `template_version = new_template.current_version`.
- `test_copy_from_last_week_uses_current_version` — create a plan with a strength session; update the template (version increments to 2); copy plan to next week; assert copied session has `template_version = 2`.

### 5.3 Comparison endpoint tests (`backend/tests/test_plan_comparison.py`)

- `test_comparison_cardio_basic` — planned cardio session (2 segments: 4 km + 4 km, total 3000 s); matching logged session (7.5 km, 2880 s); assert response has correct planned and actual values.
- `test_comparison_strength_basic` — template with 2 exercises (each 3 sets); planned session; matching logged session with same exercises but different weights; assert `exercises` list has 2 items with correct set rows and volumes.
- `test_comparison_strength_extra_exercise_in_actual` — logged session adds an exercise not in the template; assert it appears last with `source = "actual_only"`.
- `test_comparison_strength_exercise_only_in_template` — template has an exercise the user skipped; assert it appears with `source = "planned_only"`, all actual fields `null`.
- `test_comparison_strength_set_count_mismatch` — template has 3 sets, logged has 4; assert 4 rows in response; 4th planned row has all-null fields.
- `test_comparison_not_done_returns_404` — call comparison on a planned (not done) session; assert 404.
- `test_comparison_no_template_version_returns_404` — manually set `template_version = NULL`; assert 404 with descriptive message.
- `test_comparison_wrong_user_returns_403` — call with a different user; assert 403.

### 5.4 Regression

- `pytest` (backend) — no failures across existing test files.
- `vitest` (frontend) — no failures.
- Plan tab: Planned and Skipped card flows unchanged.
- Plan tab `PlanVsActualCard` unchanged.
- Analytics `PlanAdherenceChart` unchanged.
