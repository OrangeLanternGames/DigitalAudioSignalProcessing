from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


def test_round_preview_and_score_flow():
    created = client.post("/api/rounds", json={"difficulty": "hard"}).json()
    assert created["sessionId"].startswith("round_")
    assert len(created["targetFilters"]) == 3
    assert len(created["waveform"]["target"]["samples"]) > 100

    preview = client.post(f"/api/rounds/{created['sessionId']}/preview", json={"filters": created["playerFilters"]}).json()
    assert preview["previewUrl"].endswith(preview["previewId"])
    assert len(preview["waveform"]["samples"]) > 100

    score = client.post(f"/api/rounds/{created['sessionId']}/score", json={"filters": created["targetFilters"]}).json()
    assert score["score"] >= 95
    assert score["parameterScore"] == 100


def test_score_drops_for_initial_player_filters():
    created = client.post("/api/rounds", json={"difficulty": "medium"}).json()
    score = client.post(f"/api/rounds/{created['sessionId']}/score", json={"filters": created["playerFilters"]}).json()
    assert 0 <= score["score"] < 100
