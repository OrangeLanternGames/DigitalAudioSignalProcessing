# DIAL IN Audio API

FastAPI backend for the Angular DIAL IN frontend.

## Run locally

```powershell
cd server
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The Angular app expects the API at `http://localhost:8000`.

## Endpoints

- `POST /api/audio/upload` accepts mono/stereo WAV files and normalizes them to 44.1 kHz mono WAV.
- `POST /api/rounds` creates a game round. If `fileId` is omitted, a generated demo signal is used.
- `POST /api/rounds/{roundId}/preview` renders the current player filter chain.
- `POST /api/rounds/{roundId}/score` returns parameter and spectral match scores.
- `GET /api/audio/{fileId}`, `GET /api/rounds/{roundId}/target`, and `GET /api/rounds/{roundId}/preview/{previewId}` serve WAV files.
