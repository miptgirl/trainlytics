"""Tests for the Apple Health XML parser, type mapping, and upload endpoints."""

import io
import textwrap
import zipfile
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient

from app.services.apple_health_service import (
    MetricPreferences,
    _ParsedData,
    _parse_xml,
    _parse_date,
    _parse_datetime,
    _process_record,
    _process_workout,
    _duration_to_s,
    _distance_to_m,
    get_task_status,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_xml(records: str) -> str:
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<HealthData locale="en_US">\n{records}\n</HealthData>\n'


def _xml_file(content: str):
    """Return a BytesIO object wrapping the given XML string."""
    return io.BytesIO(content.encode())


def _make_zip_bytes(xml_content: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("apple_health_export/export.xml", xml_content)
    return buf.getvalue()


def _parse_xml_string(xml: str, prefs: MetricPreferences | None = None) -> _ParsedData:
    """Helper: write XML to a temp file and parse it."""
    import tempfile, os
    prefs = prefs or MetricPreferences()
    with tempfile.NamedTemporaryFile(suffix=".xml", delete=False, mode="w", encoding="utf-8") as f:
        f.write(xml)
        path = f.name
    try:
        return _parse_xml(path, prefs)
    finally:
        os.unlink(path)


# ---------------------------------------------------------------------------
# Unit tests — date / datetime helpers
# ---------------------------------------------------------------------------

def test_parse_date_standard():
    assert _parse_date("2024-03-15 06:00:00 +0000") == date(2024, 3, 15)


def test_parse_date_short():
    assert _parse_date("2024-03-15") == date(2024, 3, 15)


def test_parse_date_none():
    assert _parse_date(None) is None
    assert _parse_date("") is None


def test_parse_datetime_with_space_tz():
    dt = _parse_datetime("2024-03-15 06:00:00 +0000")
    assert dt is not None
    assert dt.year == 2024
    assert dt.month == 3
    assert dt.day == 15


def test_parse_datetime_none():
    assert _parse_datetime(None) is None


def test_duration_to_s_minutes():
    assert _duration_to_s(60.0, "min") == 3600


def test_duration_to_s_seconds():
    assert _duration_to_s(3600.0, "s") == 3600


def test_distance_to_m_km():
    assert _distance_to_m(10.0, "km") == pytest.approx(10000.0)


def test_distance_to_m_mi():
    assert _distance_to_m(1.0, "mi") == pytest.approx(1609.344, rel=1e-3)


# ---------------------------------------------------------------------------
# Unit tests — record processing
# ---------------------------------------------------------------------------

def _make_elem(attribs: dict):
    from xml.etree.ElementTree import Element
    e = Element("Record")
    for k, v in attribs.items():
        e.set(k, v)
    return e


def test_resting_hr_record():
    from collections import defaultdict
    metrics = defaultdict(lambda: {"resting_hr_bpm": None, "hrv_sdnn_ms": None,
                                   "weight_kg": None, "sleep_duration_seconds": 0,
                                   "vo2_max": None, "active_energy_kcal": 0.0})
    prefs = MetricPreferences()
    elem = _make_elem({
        "type": "HKQuantityTypeIdentifierRestingHeartRate",
        "value": "52.0",
        "unit": "count/min",
        "startDate": "2024-01-01 08:00:00 +0000",
    })
    _process_record(elem, prefs, metrics)
    assert metrics[date(2024, 1, 1)]["resting_hr_bpm"] == pytest.approx(52.0)


def test_hrv_record():
    from collections import defaultdict
    metrics = defaultdict(lambda: {"resting_hr_bpm": None, "hrv_sdnn_ms": None,
                                   "weight_kg": None, "sleep_duration_seconds": 0,
                                   "vo2_max": None, "active_energy_kcal": 0.0})
    prefs = MetricPreferences()
    elem = _make_elem({
        "type": "HKQuantityTypeIdentifierHeartRateVariabilitySDNN",
        "value": "68.5",
        "unit": "ms",
        "startDate": "2024-01-01 08:00:00 +0000",
    })
    _process_record(elem, prefs, metrics)
    assert metrics[date(2024, 1, 1)]["hrv_sdnn_ms"] == pytest.approx(68.5)


def test_weight_record_kg():
    from collections import defaultdict
    metrics = defaultdict(lambda: {"resting_hr_bpm": None, "hrv_sdnn_ms": None,
                                   "weight_kg": None, "sleep_duration_seconds": 0,
                                   "vo2_max": None, "active_energy_kcal": 0.0})
    prefs = MetricPreferences()
    elem = _make_elem({
        "type": "HKQuantityTypeIdentifierBodyMass",
        "value": "70.0",
        "unit": "kg",
        "startDate": "2024-01-01 08:00:00 +0000",
    })
    _process_record(elem, prefs, metrics)
    assert metrics[date(2024, 1, 1)]["weight_kg"] == pytest.approx(70.0)


def test_weight_record_lbs():
    from collections import defaultdict
    metrics = defaultdict(lambda: {"resting_hr_bpm": None, "hrv_sdnn_ms": None,
                                   "weight_kg": None, "sleep_duration_seconds": 0,
                                   "vo2_max": None, "active_energy_kcal": 0.0})
    prefs = MetricPreferences()
    elem = _make_elem({
        "type": "HKQuantityTypeIdentifierBodyMass",
        "value": "154.324",
        "unit": "lb",
        "startDate": "2024-01-01 08:00:00 +0000",
    })
    _process_record(elem, prefs, metrics)
    assert metrics[date(2024, 1, 1)]["weight_kg"] == pytest.approx(70.0, rel=1e-2)


def test_vo2max_record():
    from collections import defaultdict
    metrics = defaultdict(lambda: {"resting_hr_bpm": None, "hrv_sdnn_ms": None,
                                   "weight_kg": None, "sleep_duration_seconds": 0,
                                   "vo2_max": None, "active_energy_kcal": 0.0})
    prefs = MetricPreferences()
    elem = _make_elem({
        "type": "HKQuantityTypeIdentifierVO2Max",
        "value": "48.5",
        "unit": "mL/min·kg",
        "startDate": "2024-01-01 08:00:00 +0000",
    })
    _process_record(elem, prefs, metrics)
    assert metrics[date(2024, 1, 1)]["vo2_max"] == pytest.approx(48.5)


def test_active_energy_accumulates():
    from collections import defaultdict
    metrics = defaultdict(lambda: {"resting_hr_bpm": None, "hrv_sdnn_ms": None,
                                   "weight_kg": None, "sleep_duration_seconds": 0,
                                   "vo2_max": None, "active_energy_kcal": 0.0})
    prefs = MetricPreferences()
    for val in ["200.0", "150.0", "100.0"]:
        elem = _make_elem({
            "type": "HKQuantityTypeIdentifierActiveEnergyBurned",
            "value": val,
            "unit": "kcal",
            "startDate": "2024-01-01 08:00:00 +0000",
        })
        _process_record(elem, prefs, metrics)
    assert metrics[date(2024, 1, 1)]["active_energy_kcal"] == pytest.approx(450.0)


def test_sleep_asleep_values_accumulate():
    """Multiple sleep-asleep records for the same date are summed."""
    from collections import defaultdict
    from xml.etree.ElementTree import Element

    metrics = defaultdict(lambda: {"resting_hr_bpm": None, "hrv_sdnn_ms": None,
                                   "weight_kg": None, "sleep_duration_seconds": 0,
                                   "vo2_max": None, "active_energy_kcal": 0.0})
    prefs = MetricPreferences()

    # 1h core + 30m deep + 30m REM straddling midnight (all startDate on Jan 1) = 2h total
    sleep_records = [
        ("HKCategoryValueSleepAnalysisAsleepCore", "2024-01-01 22:00:00 +0000", "2024-01-01 23:00:00 +0000"),
        ("HKCategoryValueSleepAnalysisAsleepDeep", "2024-01-01 23:00:00 +0000", "2024-01-01 23:30:00 +0000"),
        ("HKCategoryValueSleepAnalysisAsleepREM", "2024-01-01 23:30:00 +0000", "2024-01-02 00:00:00 +0000"),
    ]
    for value, start, end in sleep_records:
        e = Element("Record")
        e.set("type", "HKCategoryTypeIdentifierSleepAnalysis")
        e.set("value", value)
        e.set("startDate", start)
        e.set("endDate", end)
        _process_record(e, prefs, metrics)

    assert metrics[date(2024, 1, 1)]["sleep_duration_seconds"] == 7200


def test_sleep_inbed_ignored():
    """HKCategoryValueSleepAnalysisInBed is not counted as sleep time."""
    from collections import defaultdict
    from xml.etree.ElementTree import Element

    metrics = defaultdict(lambda: {"resting_hr_bpm": None, "hrv_sdnn_ms": None,
                                   "weight_kg": None, "sleep_duration_seconds": 0,
                                   "vo2_max": None, "active_energy_kcal": 0.0})
    prefs = MetricPreferences()
    e = Element("Record")
    e.set("type", "HKCategoryTypeIdentifierSleepAnalysis")
    e.set("value", "HKCategoryValueSleepAnalysisInBed")
    e.set("startDate", "2024-01-01 22:00:00 +0000")
    e.set("endDate", "2024-01-02 07:00:00 +0000")
    _process_record(e, prefs, metrics)
    assert metrics[date(2024, 1, 1)]["sleep_duration_seconds"] == 0


def test_disabled_metric_not_stored():
    """When a metric preference is disabled its records are skipped."""
    from collections import defaultdict
    metrics = defaultdict(lambda: {"resting_hr_bpm": None, "hrv_sdnn_ms": None,
                                   "weight_kg": None, "sleep_duration_seconds": 0,
                                   "vo2_max": None, "active_energy_kcal": 0.0})
    prefs = MetricPreferences(resting_hr=False)
    elem = _make_elem({
        "type": "HKQuantityTypeIdentifierRestingHeartRate",
        "value": "55.0",
        "unit": "count/min",
        "startDate": "2024-01-01 08:00:00 +0000",
    })
    _process_record(elem, prefs, metrics)
    assert metrics[date(2024, 1, 1)]["resting_hr_bpm"] is None


# ---------------------------------------------------------------------------
# Unit tests — workout processing
# ---------------------------------------------------------------------------

def test_process_workout_running():
    from xml.etree.ElementTree import Element
    e = Element("Workout")
    e.set("workoutActivityType", "HKWorkoutActivityTypeRunning")
    e.set("duration", "60.0")
    e.set("durationUnit", "min")
    e.set("totalDistance", "10.0")
    e.set("totalDistanceUnit", "km")
    e.set("totalEnergyBurned", "550.0")
    e.set("totalEnergyBurnedUnit", "kcal")
    e.set("startDate", "2024-03-10 06:00:00 +0000")
    e.set("endDate", "2024-03-10 07:00:00 +0000")

    w = _process_workout(e)
    assert w is not None
    assert w["ah_type"] == "HKWorkoutActivityTypeRunning"
    assert w["date"] == "2024-03-10"
    assert w["duration_seconds"] == 3600
    assert w["distance_m"] == pytest.approx(10000.0)
    assert w["calories"] == pytest.approx(550.0)


def test_process_workout_missing_date_returns_none():
    from xml.etree.ElementTree import Element
    e = Element("Workout")
    e.set("workoutActivityType", "HKWorkoutActivityTypeRunning")
    e.set("startDate", "")
    assert _process_workout(e) is None


def test_process_workout_distance_in_miles():
    from xml.etree.ElementTree import Element
    e = Element("Workout")
    e.set("workoutActivityType", "HKWorkoutActivityTypeCycling")
    e.set("duration", "60.0")
    e.set("durationUnit", "min")
    e.set("totalDistance", "6.21371")  # ~10km in miles
    e.set("totalDistanceUnit", "mi")
    e.set("startDate", "2024-03-10 06:00:00 +0000")
    e.set("endDate", "2024-03-10 07:00:00 +0000")
    w = _process_workout(e)
    assert w is not None
    assert w["distance_m"] == pytest.approx(10000.0, rel=1e-3)


# ---------------------------------------------------------------------------
# Integration-style: full XML parse
# ---------------------------------------------------------------------------

def test_parse_xml_resting_hr():
    xml = _make_xml("""
    <Record type="HKQuantityTypeIdentifierRestingHeartRate"
            value="52.0" unit="count/min"
            startDate="2024-01-15 08:00:00 +0000"
            endDate="2024-01-15 08:00:00 +0000"/>
    """)
    result = _parse_xml_string(xml)
    assert date(2024, 1, 15) in result.metrics_by_date
    assert result.metrics_by_date[date(2024, 1, 15)]["resting_hr_bpm"] == pytest.approx(52.0)


def test_parse_xml_workout_staged():
    xml = _make_xml("""
    <Workout workoutActivityType="HKWorkoutActivityTypeRunning"
             duration="45.0" durationUnit="min"
             totalDistance="8.0" totalDistanceUnit="km"
             totalEnergyBurned="420.0" totalEnergyBurnedUnit="kcal"
             startDate="2024-01-20 07:00:00 +0000"
             endDate="2024-01-20 07:45:00 +0000"/>
    """)
    result = _parse_xml_string(xml)
    assert len(result.workouts) == 1
    w = result.workouts[0]
    assert w["ah_type"] == "HKWorkoutActivityTypeRunning"
    assert w["date"] == "2024-01-20"
    assert w["duration_seconds"] == 2700


def test_parse_xml_unknown_type_parsed():
    """Unknown workout types are still captured (user can remap in review queue)."""
    xml = _make_xml("""
    <Workout workoutActivityType="HKWorkoutActivityTypeSurfingSports"
             duration="90.0" durationUnit="min"
             startDate="2024-02-01 10:00:00 +0000"
             endDate="2024-02-01 11:30:00 +0000"/>
    """)
    result = _parse_xml_string(xml)
    assert len(result.workouts) == 1
    assert result.workouts[0]["ah_type"] == "HKWorkoutActivityTypeSurfingSports"


def test_parse_xml_sleep_aggregation():
    """Sleep records across multiple segments for the same date sum correctly."""
    xml = _make_xml("""
    <Record type="HKCategoryTypeIdentifierSleepAnalysis"
            value="HKCategoryValueSleepAnalysisAsleepCore"
            startDate="2024-01-10 22:00:00 +0000"
            endDate="2024-01-10 23:00:00 +0000"/>
    <Record type="HKCategoryTypeIdentifierSleepAnalysis"
            value="HKCategoryValueSleepAnalysisAsleepREM"
            startDate="2024-01-10 23:00:00 +0000"
            endDate="2024-01-10 23:30:00 +0000"/>
    """)
    result = _parse_xml_string(xml)
    jan10 = result.metrics_by_date.get(date(2024, 1, 10), {})
    # 1h core + 30m REM, both starting Jan 10
    assert jan10.get("sleep_duration_seconds", 0) == 5400


def test_parse_xml_disabled_metric_skipped():
    xml = _make_xml("""
    <Record type="HKQuantityTypeIdentifierRestingHeartRate"
            value="55.0" unit="count/min"
            startDate="2024-01-15 08:00:00 +0000"
            endDate="2024-01-15 08:00:00 +0000"/>
    """)
    prefs = MetricPreferences(resting_hr=False)
    result = _parse_xml_string(xml, prefs)
    assert result.metrics_by_date == {}


# ---------------------------------------------------------------------------
# API endpoint tests
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_upload_non_zip_rejected(auth_client: AsyncClient, db_session):
    resp = await auth_client.post(
        "/api/apple-health/upload",
        files={"file": ("export.xml", b"<data/>", "text/xml")},
    )
    assert resp.status_code == 400


@pytest.mark.anyio
async def test_upload_returns_task_id(auth_client: AsyncClient, db_session):
    zip_bytes = _make_zip_bytes(_make_xml(""))
    with patch("app.api.apple_health.apple_health_service.parse_xml_worker", new_callable=AsyncMock):
        resp = await auth_client.post(
            "/api/apple-health/upload",
            files={"file": ("export.zip", zip_bytes, "application/zip")},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "task_id" in data
    assert len(data["task_id"]) == 36  # UUID format


@pytest.mark.anyio
async def test_status_not_found(auth_client: AsyncClient, db_session):
    resp = await auth_client.get("/api/apple-health/status/nonexistent-id")
    assert resp.status_code == 404


@pytest.mark.anyio
async def test_status_returns_running(auth_client: AsyncClient, db_session):
    import app.services.apple_health_service as svc
    task_id = svc.new_task_id()
    svc._task_status[task_id] = {"status": "running", "workouts_staged": 0, "metrics_saved": 0, "errors": []}
    try:
        resp = await auth_client.get(f"/api/apple-health/status/{task_id}")
        assert resp.status_code == 200
        assert resp.json()["status"] == "running"
    finally:
        del svc._task_status[task_id]


# ---------------------------------------------------------------------------
# Type mapping tests
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_map_running_to_run(db_session):
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.services.apple_health_service import map_apple_health_type
    from app.models.cardio_activity_type import CardioActivityType

    async with db_session() as db:
        db.add(CardioActivityType(user_id="testuser", name="Run"))
        await db.commit()
        result = await map_apple_health_type("HKWorkoutActivityTypeRunning", db, "testuser")

    assert result["session_type"] == "cardio"
    assert result["activity_type_name"] == "Run"
    assert result["proposed_type_name"] is None


@pytest.mark.anyio
async def test_map_strength_type(db_session):
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.services.apple_health_service import map_apple_health_type

    async with db_session() as db:
        result = await map_apple_health_type(
            "HKWorkoutActivityTypeTraditionalStrengthTraining", db, "testuser"
        )
    assert result["session_type"] == "strength"
    assert result["activity_type_name"] is None


@pytest.mark.anyio
async def test_map_unknown_type_proposes(db_session):
    from app.services.apple_health_service import map_apple_health_type

    async with db_session() as db:
        result = await map_apple_health_type("HKWorkoutActivityTypeSurfingSports", db, "testuser")

    assert result["session_type"] == "cardio"
    assert result["activity_type_name"] is None
    assert result["proposed_type_name"] == "HKWorkoutActivityTypeSurfingSports"
