from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# A "mode" selects which manipulation(s) a round uses: one of the three single
# filters, or "random" which combines two of them. The name stays `Difficulty`
# for backwards compatibility across the request/response models.
Difficulty = Literal["eq4", "echo", "distortion", "chorus", "random", "all"]
FilterType = Literal["eq4", "echo", "distortion", "chorus"]


class AudioFileInfo(BaseModel):
    fileId: str
    filename: str
    durationSec: float
    sampleRate: int
    channels: int = 1
    url: str


class AudioFilterParam(BaseModel):
    key: str
    label: str
    min: float
    max: float
    step: float
    value: float
    unit: str | None = None


class AudioFilterConfig(BaseModel):
    id: str
    type: FilterType
    label: str
    params: list[AudioFilterParam]


class WaveformPeaks(BaseModel):
    samples: list[float]
    sampleRate: int
    durationSec: float


class CreateRoundRequest(BaseModel):
    difficulty: Difficulty = "eq4"
    fileId: str | None = None


class AudioRound(BaseModel):
    sessionId: str
    fileId: str
    difficulty: Difficulty
    sourceUrl: str
    targetUrl: str
    previewUrl: str
    targetFilters: list[AudioFilterConfig]
    playerFilters: list[AudioFilterConfig]
    waveform: dict[str, WaveformPeaks]


class PreviewRequest(BaseModel):
    filters: list[AudioFilterConfig] = Field(default_factory=list)


class PreviewResponse(BaseModel):
    previewId: str
    previewUrl: str
    waveform: WaveformPeaks


class ScoreDetail(BaseModel):
    filter: str
    param: str
    accuracy: float


class ScoreRequest(BaseModel):
    filters: list[AudioFilterConfig] = Field(default_factory=list)


class ScoreResponse(BaseModel):
    score: float
    parameterScore: float
    spectrumScore: float
    details: list[ScoreDetail]
