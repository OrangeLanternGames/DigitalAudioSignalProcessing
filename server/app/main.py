from __future__ import annotations

import json
import random
import re
import shutil
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .dsp import TARGET_SR, load_wav, render_chain, save_wav, spectrum_score, waveform_peaks
from .models import AudioFileInfo, AudioFilterConfig, AudioRound, CreateRoundRequest, PreviewRequest, PreviewResponse, ScoreRequest, ScoreResponse, WaveformPeaks
from .rounds import filters_to_plain, make_filters, parameter_score

ROOT = Path(__file__).resolve().parents[1]
STORAGE = ROOT / "storage"
ASSETS = ROOT / "assets"
UPLOADS = STORAGE / "uploads"
ROUNDS = STORAGE / "rounds"

for directory in (UPLOADS, ROUNDS):
    directory.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="DIAL IN Audio API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200", "http://127.0.0.1:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _meta_path(round_id: str) -> Path:
    return ROUNDS / round_id / "round.json"


def _load_round(round_id: str) -> dict:
    path = _meta_path(round_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Round not found")
    return json.loads(path.read_text(encoding="utf-8"))


def _audio_info(file_id: str, filename: str, signal_len: int) -> AudioFileInfo:
    return AudioFileInfo(
        fileId=file_id,
        filename=filename,
        durationSec=round(signal_len / TARGET_SR, 3),
        sampleRate=TARGET_SR,
        channels=1,
        url=f"/api/audio/{file_id}",
    )


def _asset_file_id(asset: Path) -> str:
    # Stable, URL-safe id derived from the filename so the same asset always maps
    # to the same /api/audio/{id} and its normalised copy can be cached.
    stem = re.sub(r"[^A-Za-z0-9_-]", "_", asset.stem)
    return f"asset_{stem}"


def _ensure_asset_loaded(asset: Path) -> tuple[str, Path]:
    file_id = _asset_file_id(asset)
    path = UPLOADS / f"{file_id}.wav"
    if not path.exists() or asset.stat().st_mtime > path.stat().st_mtime:
        _sr, signal = load_wav(asset)
        save_wav(path, signal)
    return file_id, path


def _pick_random_source() -> tuple[str, Path]:
    # Directory scan, so dropping more .wav files into assets/ (or wiring up the
    # upload flow) needs no code change — they are picked up automatically.
    assets = sorted(ASSETS.glob("*.wav"))
    if not assets:
        raise HTTPException(status_code=500, detail="No source audio found in assets/")
    return _ensure_asset_loaded(random.choice(assets))


def _wave(signal) -> WaveformPeaks:
    return WaveformPeaks(samples=waveform_peaks(signal), sampleRate=TARGET_SR, durationSec=round(len(signal) / TARGET_SR, 3))


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/audio/upload", response_model=AudioFileInfo)
async def upload_audio(file: UploadFile = File(...)) -> AudioFileInfo:
    if not file.filename or not file.filename.lower().endswith(".wav"):
        raise HTTPException(status_code=400, detail="Only WAV files are supported in v1")
    file_id = f"aud_{uuid.uuid4().hex[:12]}"
    raw_path = UPLOADS / f"{file_id}_raw.wav"
    normalized_path = UPLOADS / f"{file_id}.wav"
    with raw_path.open("wb") as fh:
        shutil.copyfileobj(file.file, fh)
    try:
        _sr, signal = load_wav(raw_path)
        save_wav(normalized_path, signal)
    finally:
        raw_path.unlink(missing_ok=True)
    return _audio_info(file_id, file.filename, len(signal))


@app.get("/api/audio/{file_id}")
def get_audio(file_id: str) -> FileResponse:
    path = UPLOADS / f"{file_id}.wav"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    return FileResponse(path, media_type="audio/wav", filename=f"{file_id}.wav")


@app.post("/api/rounds", response_model=AudioRound)
def create_round(req: CreateRoundRequest) -> AudioRound:
    file_id, source_path = (req.fileId, UPLOADS / f"{req.fileId}.wav") if req.fileId else _pick_random_source()
    if not file_id or not source_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")

    _sr, source = load_wav(source_path)
    target_filters, player_filters = make_filters(req.difficulty)
    target = render_chain(source, filters_to_plain(target_filters))
    player = render_chain(source, filters_to_plain(player_filters))

    round_id = f"round_{uuid.uuid4().hex[:12]}"
    round_dir = ROUNDS / round_id
    round_dir.mkdir(parents=True, exist_ok=True)
    target_path = round_dir / "target.wav"
    preview_path = round_dir / "preview_initial.wav"
    save_wav(target_path, target)
    save_wav(preview_path, player)

    payload = {
        "sessionId": round_id,
        "fileId": file_id,
        "difficulty": req.difficulty,
        "sourcePath": str(source_path),
        "targetPath": str(target_path),
        "targetFilters": [f.model_dump() for f in target_filters],
        "playerFilters": [f.model_dump() for f in player_filters],
    }
    _meta_path(round_id).write_text(json.dumps(payload, indent=2), encoding="utf-8")

    return AudioRound(
        sessionId=round_id,
        fileId=file_id,
        difficulty=req.difficulty,
        sourceUrl=f"/api/audio/{file_id}",
        targetUrl=f"/api/rounds/{round_id}/target",
        previewUrl=f"/api/rounds/{round_id}/preview/initial",
        targetFilters=target_filters,
        playerFilters=player_filters,
        waveform={"target": _wave(target), "preview": _wave(player)},
    )


@app.get("/api/rounds/{round_id}/target")
def get_target(round_id: str) -> FileResponse:
    meta = _load_round(round_id)
    path = Path(meta["targetPath"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Target audio not found")
    return FileResponse(path, media_type="audio/wav", filename=f"{round_id}_target.wav")


@app.get("/api/rounds/{round_id}/preview/{preview_id}")
def get_preview(round_id: str, preview_id: str) -> FileResponse:
    _load_round(round_id)
    name = "preview_initial.wav" if preview_id == "initial" else f"preview_{preview_id}.wav"
    path = ROUNDS / round_id / name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Preview audio not found")
    return FileResponse(path, media_type="audio/wav", filename=name)


@app.post("/api/rounds/{round_id}/preview", response_model=PreviewResponse)
def render_preview(round_id: str, req: PreviewRequest) -> PreviewResponse:
    meta = _load_round(round_id)
    _sr, source = load_wav(Path(meta["sourcePath"]))
    preview = render_chain(source, [f.model_dump() for f in req.filters])
    preview_id = uuid.uuid4().hex[:10]
    save_wav(ROUNDS / round_id / f"preview_{preview_id}.wav", preview)
    return PreviewResponse(previewId=preview_id, previewUrl=f"/api/rounds/{round_id}/preview/{preview_id}", waveform=_wave(preview))


@app.post("/api/rounds/{round_id}/score", response_model=ScoreResponse)
def score_round(round_id: str, req: ScoreRequest) -> ScoreResponse:
    meta = _load_round(round_id)
    _sr, source = load_wav(Path(meta["sourcePath"]))
    target_filters = [AudioFilterConfig.model_validate(f) for f in meta["targetFilters"]]
    # Render the target fresh from its filters instead of loading the saved
    # target.wav: the on-disk file is int16-quantised, and the dB-domain spectrum
    # score is so sensitive to that quantisation in quiet bins that even a perfect
    # reconstruction would be penalised. Comparing float render vs float render
    # measures filter closeness cleanly. DSP unchanged.
    target = render_chain(source, filters_to_plain(target_filters))
    player = render_chain(source, [f.model_dump() for f in req.filters])
    param_score, details = parameter_score(
        target_filters,
        req.filters,
        meta.get("difficulty", "medium"),
    )
    spec = round(spectrum_score(target, player), 2)
    # Parameter-dominant: a clean dial reads ~100% even if the FFT match is noisier.
    final = round(param_score * 0.8 + spec * 0.2, 1)
    return ScoreResponse(score=final, parameterScore=round(param_score, 2), spectrumScore=spec, details=details)
