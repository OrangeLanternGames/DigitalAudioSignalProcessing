import { Difficulty } from './dial-model';

export type AudioFilterType = 'eq4' | 'echo' | 'distortion';

export interface AudioFileInfo {
  fileId: string;
  filename: string;
  durationSec: number;
  sampleRate: number;
  channels: number;
  url: string;
}

export interface AudioFilterParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string | null;
}

export interface AudioFilterConfig {
  id: string;
  type: AudioFilterType;
  label: string;
  params: AudioFilterParam[];
}

export interface WaveformPeaks {
  samples: number[];
  sampleRate: number;
  durationSec: number;
}

export interface AudioRound {
  sessionId: string;
  fileId: string;
  difficulty: Difficulty;
  sourceUrl: string;
  targetUrl: string;
  previewUrl: string;
  targetFilters: AudioFilterConfig[];
  playerFilters: AudioFilterConfig[];
  waveform: {
    target?: WaveformPeaks;
    preview?: WaveformPeaks;
  };
}

export interface PreviewResponse {
  previewId: string;
  previewUrl: string;
  waveform: WaveformPeaks;
}

export interface ScoreDetail {
  filter: string;
  param: string;
  accuracy: number;
}

export interface ScoreResponse {
  score: number;
  parameterScore: number;
  spectrumScore: number;
  details: ScoreDetail[];
}
