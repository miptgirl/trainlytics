import asyncio
import os
import shutil
import uuid
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from xml.etree import ElementTree

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.body_metrics import BodyMetrics
from app.models.cardio_activity_type import CardioActivityType
from app.models.pending_import import ImportSource, ImportStatus, PendingImport
from app.models.user_settings import UserSettings


_task_status: dict[str, dict] = {}

_AH_STRENGTH_TYPES: frozenset[str] = frozenset({
    "hkworkoutactivitytypetraditionalstrengthtraining",
    "hkworkoutactivitytypefunctionalstrengthtraining",
    "hkworkoutactivitytypecrossfit",
    "hkworkoutactivitytypeyoga",
    "hkworkoutactivitytypepilates",
    "hkworkoutactivitytypebarre",
    "hkworkoutactivitytypeflexibility",
    "hkworkoutactivitytypemindandbody",
    "hkworkoutactivitytypecorefours",
})

# AH type (lowercased) → Trainlytics activity type name to look up in DB.
_AH_TYPE_ALIAS: dict[str, str] = {
    "hkworkoutactivitytyperunning": "run",
    "hkworkoutactivitytypecycling": "cycle",
    "hkworkoutactivitytypewalking": "walk",
    "hkworkoutactivitytypeswimming": "swim",
}

# Sleep values that count as actual sleep (not in-bed / awake)
_SLEEP_ASLEEP_VALUES: frozenset[str] = frozenset({
    "HKCategoryValueSleepAnalysisAsleepUnspecified",
    "HKCategoryValueSleepAnalysisAsleepCore",
    "HKCategoryValueSleepAnalysisAsleepDeep",
    "HKCategoryValueSleepAnalysisAsleepREM",
})


@dataclass
class MetricPreferences:
    resting_hr: bool = True
    hrv: bool = True
    weight: bool = True
    sleep: bool = True
    vo2_max: bool = True
    active_energy: bool = True


@dataclass
class _ParsedData:
    workouts: list[dict]
    metrics_by_date: dict[date, dict]


def new_task_id() -> str:
    return str(uuid.uuid4())


def get_task_status(task_id: str) -> dict | None:
    return _task_status.get(task_id)


def _get_prefs(row: UserSettings | None) -> MetricPreferences:
    if row is None:
        return MetricPreferences()
    return MetricPreferences(
        resting_hr=row.health_metric_resting_hr,
        hrv=row.health_metric_hrv,
        weight=row.health_metric_weight,
        sleep=row.health_metric_sleep,
        vo2_max=row.health_metric_vo2_max,
        active_energy=row.health_metric_active_energy,
    )


def _extract_xml(zip_path: str, temp_dir: str) -> str:
    """Extract export.xml from the Apple Health zip. Returns path to the XML file."""
    with zipfile.ZipFile(zip_path, "r") as zf:
        names = zf.namelist()
        # Guard against zip-slip path traversal
        for name in names:
            parts = name.replace("\\", "/").split("/")
            if ".." in parts or os.path.isabs(name):
                raise ValueError(f"Unsafe path in zip: {name}")

        xml_name = next(
            (n for n in names if n.split("/")[-1] == "export.xml"),
            None,
        )
        if xml_name is None:
            raise ValueError("export.xml not found in the zip archive")
        xml_path = zf.extract(xml_name, temp_dir)

    # Remove the zip to free disk space before the (potentially large) parse
    os.remove(zip_path)
    return xml_path


def _parse_date(date_str: str | None) -> date | None:
    if not date_str or len(date_str) < 10:
        return None
    try:
        return date.fromisoformat(date_str[:10])
    except (ValueError, TypeError):
        return None


def _parse_datetime(date_str: str | None) -> datetime | None:
    """Parse Apple Health datetime strings like '2024-01-01 06:00:00 +0000'."""
    if not date_str:
        return None
    try:
        return datetime.strptime(date_str.strip(), "%Y-%m-%d %H:%M:%S %z")
    except (ValueError, TypeError):
        try:
            return datetime.strptime(date_str.strip(), "%Y-%m-%d %H:%M:%S%z")
        except (ValueError, TypeError):
            return None


def _safe_float(val: str | None) -> float | None:
    try:
        return float(val) if val is not None else None
    except (ValueError, TypeError):
        return None


def _distance_to_m(value: float, unit: str) -> float:
    unit_lower = (unit or "").lower()
    if "km" in unit_lower:
        return value * 1000.0
    if "mi" in unit_lower:
        return value * 1609.344
    return value  # assume meters


def _duration_to_s(value: float, unit: str) -> int:
    if "min" in (unit or "").lower():
        return int(value * 60)
    return int(value)  # assume seconds


def _process_record(
    elem,
    prefs: MetricPreferences,
    metrics: dict[date, dict],
) -> None:
    rtype = elem.get("type", "")

    if rtype == "HKQuantityTypeIdentifierRestingHeartRate" and prefs.resting_hr:
        d = _parse_date(elem.get("startDate"))
        val = _safe_float(elem.get("value"))
        if d is not None and val is not None:
            metrics[d]["resting_hr_bpm"] = val

    elif rtype == "HKQuantityTypeIdentifierHeartRateVariabilitySDNN" and prefs.hrv:
        d = _parse_date(elem.get("startDate"))
        val = _safe_float(elem.get("value"))
        if d is not None and val is not None:
            metrics[d]["hrv_sdnn_ms"] = val

    elif rtype == "HKQuantityTypeIdentifierBodyMass" and prefs.weight:
        d = _parse_date(elem.get("startDate"))
        val = _safe_float(elem.get("value"))
        unit = elem.get("unit", "kg")
        if d is not None and val is not None:
            if "lb" in unit.lower():
                val = val * 0.453592
            metrics[d]["weight_kg"] = val

    elif rtype == "HKCategoryTypeIdentifierSleepAnalysis" and prefs.sleep:
        if elem.get("value", "") in _SLEEP_ASLEEP_VALUES:
            start_dt = _parse_datetime(elem.get("startDate"))
            end_dt = _parse_datetime(elem.get("endDate"))
            if start_dt and end_dt and end_dt > start_dt:
                d = _parse_date(elem.get("startDate"))
                if d is not None:
                    duration_s = int((end_dt - start_dt).total_seconds())
                    metrics[d]["sleep_duration_seconds"] += duration_s

    elif rtype == "HKQuantityTypeIdentifierVO2Max" and prefs.vo2_max:
        d = _parse_date(elem.get("startDate"))
        val = _safe_float(elem.get("value"))
        if d is not None and val is not None:
            metrics[d]["vo2_max"] = val

    elif rtype == "HKQuantityTypeIdentifierActiveEnergyBurned" and prefs.active_energy:
        d = _parse_date(elem.get("startDate"))
        val = _safe_float(elem.get("value"))
        if d is not None and val is not None:
            metrics[d]["active_energy_kcal"] += val


def _process_workout(elem) -> dict | None:
    start_date_str = elem.get("startDate", "")
    d = _parse_date(start_date_str)
    if d is None:
        return None

    duration_val = _safe_float(elem.get("duration")) or 0.0
    duration_s = _duration_to_s(duration_val, elem.get("durationUnit", "min"))

    dist_val = _safe_float(elem.get("totalDistance"))
    distance_m = _distance_to_m(dist_val, elem.get("totalDistanceUnit", "km")) if dist_val is not None else None
    calories = _safe_float(elem.get("totalEnergyBurned"))

    return {
        "ah_type": elem.get("workoutActivityType", ""),
        "start_date_str": start_date_str,
        "date": d.isoformat(),
        "duration_seconds": duration_s,
        "distance_m": distance_m,
        "calories": calories,
    }


def _parse_xml(xml_path: str, prefs: MetricPreferences) -> _ParsedData:
    """Synchronous streaming parse of export.xml. Safe for large files."""
    workouts: list[dict] = []
    metrics: dict[date, dict] = defaultdict(lambda: {
        "resting_hr_bpm": None,
        "hrv_sdnn_ms": None,
        "weight_kg": None,
        "sleep_duration_seconds": 0,
        "vo2_max": None,
        "active_energy_kcal": 0.0,
    })

    for _event, elem in ElementTree.iterparse(xml_path, events=["end"]):
        tag = elem.tag
        if tag == "Record":
            _process_record(elem, prefs, metrics)
        elif tag == "Workout":
            w = _process_workout(elem)
            if w:
                workouts.append(w)
        elem.clear()

    return _ParsedData(workouts=workouts, metrics_by_date=dict(metrics))


async def map_apple_health_type(ah_type: str, db: AsyncSession, user_id: str) -> dict:
    """Map an Apple Health workoutActivityType string to Trainlytics session metadata."""
    lower = ah_type.lower()

    if lower in _AH_STRENGTH_TYPES:
        return {"session_type": "strength", "activity_type_name": None, "proposed_type_name": None}

    lookup_name = _AH_TYPE_ALIAS.get(lower, ah_type)

    result = await db.execute(
        select(CardioActivityType).where(
            CardioActivityType.user_id == user_id,
            func.lower(CardioActivityType.name) == lookup_name.lower(),
        )
    )
    cat = result.scalar_one_or_none()
    if cat:
        return {"session_type": "cardio", "activity_type_name": cat.name, "proposed_type_name": None}

    return {"session_type": "cardio", "activity_type_name": None, "proposed_type_name": ah_type}


async def _stage_workout(db: AsyncSession, workout: dict, username: str) -> bool:
    """Stage a workout as a pending import. Returns True if staged, False if skipped."""
    external_id = f"HKWorkout_{workout['start_date_str']}"

    result = await db.execute(
        select(PendingImport).where(
            PendingImport.source == ImportSource.apple_health.value,
            PendingImport.external_id == external_id,
        )
    )
    existing = result.scalar_one_or_none()

    if existing and existing.status in (ImportStatus.accepted.value, ImportStatus.discarded.value):
        return False

    type_info = await map_apple_health_type(workout["ah_type"], db, username)
    session_type = type_info["session_type"]
    activity_type_name = type_info["activity_type_name"]

    if session_type == "cardio":
        dist_m = workout["distance_m"]
        dur_s = workout["duration_seconds"]
        pace = (dur_s / (dist_m / 1000)) if dist_m and dist_m > 0 else None
        segments = [{
            "distance_m": dist_m,
            "duration_seconds": dur_s,
            "pace_s_per_km": pace,
            "activity_type": activity_type_name,
        }]
    else:
        segments = []

    mapped: dict = {
        "type": session_type,
        "source": "apple_health",
        "activity_type": activity_type_name,
        "date": workout["date"],
        "duration_seconds": workout["duration_seconds"],
        "distance_m": workout["distance_m"] if session_type == "cardio" else None,
        "calories": workout["calories"],
        "avg_hr_bpm": None,
        "title": None,
        "segments": segments,
    }
    if type_info["proposed_type_name"]:
        mapped["proposed_type_name"] = type_info["proposed_type_name"]

    if existing:
        existing.mapped_session = mapped
    else:
        db.add(PendingImport(
            source=ImportSource.apple_health.value,
            external_id=external_id,
            raw_data=None,
            mapped_session=mapped,
            status=ImportStatus.pending.value,
        ))

    await db.commit()
    return True


async def _upsert_body_metrics(db: AsyncSession, d: date, m: dict) -> bool:
    """Upsert body_metrics for the given date. Returns True if any data was written."""
    has_data = (
        m.get("resting_hr_bpm") is not None
        or m.get("hrv_sdnn_ms") is not None
        or m.get("weight_kg") is not None
        or (m.get("sleep_duration_seconds") or 0) > 0
        or m.get("vo2_max") is not None
        or (m.get("active_energy_kcal") or 0.0) > 0
    )
    if not has_data:
        return False

    result = await db.execute(select(BodyMetrics).where(BodyMetrics.date == d))
    row = result.scalar_one_or_none()
    if row is None:
        row = BodyMetrics(date=d)
        db.add(row)

    if m.get("resting_hr_bpm") is not None:
        row.resting_hr_bpm = m["resting_hr_bpm"]
    if m.get("hrv_sdnn_ms") is not None:
        row.hrv_sdnn_ms = m["hrv_sdnn_ms"]
    if m.get("weight_kg") is not None:
        row.weight_kg = m["weight_kg"]
    sleep_s = m.get("sleep_duration_seconds") or 0
    if sleep_s > 0:
        row.sleep_duration_seconds = sleep_s
    if m.get("vo2_max") is not None:
        row.vo2_max = m["vo2_max"]
    active_kcal = m.get("active_energy_kcal") or 0.0
    if active_kcal > 0:
        row.active_energy_kcal = active_kcal

    await db.commit()
    return True


async def parse_xml_worker(task_id: str, zip_path: str, temp_dir: str, username: str) -> None:
    """Background worker: extract zip, parse XML, stage workouts, upsert body metrics."""
    _task_status[task_id] = {
        "status": "running",
        "workouts_staged": 0,
        "metrics_saved": 0,
        "errors": [],
    }

    try:
        from app.database import AsyncSessionLocal

        # Extract export.xml (also deletes zip to free space)
        xml_path = _extract_xml(zip_path, temp_dir)

        # Load user metric preferences
        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(UserSettings).where(UserSettings.username == username)
            )
            row = result.scalar_one_or_none()
            prefs = _get_prefs(row)

        # CPU-bound XML parse runs in a thread pool so it doesn't block the event loop
        parsed: _ParsedData = await asyncio.to_thread(_parse_xml, xml_path, prefs)

        workouts_staged = 0
        for workout in parsed.workouts:
            try:
                async with AsyncSessionLocal() as db:
                    if await _stage_workout(db, workout, username):
                        workouts_staged += 1
            except Exception as e:
                _task_status[task_id]["errors"].append(f"Workout staging error: {e}")

        metrics_saved = 0
        for d, m in parsed.metrics_by_date.items():
            try:
                async with AsyncSessionLocal() as db:
                    if await _upsert_body_metrics(db, d, m):
                        metrics_saved += 1
            except Exception as e:
                _task_status[task_id]["errors"].append(f"Metrics upsert error for {d}: {e}")

        _task_status[task_id]["workouts_staged"] = workouts_staged
        _task_status[task_id]["metrics_saved"] = metrics_saved
        _task_status[task_id]["status"] = "done"

    except Exception as e:
        _task_status[task_id]["status"] = "error"
        _task_status[task_id]["errors"].append(str(e))

    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
