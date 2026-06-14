import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Difficulty } from './dial-model';
import { AudioFileInfo, AudioFilterConfig, AudioRound, PreviewResponse, ScoreResponse } from './audio-model';

@Injectable({ providedIn: 'root' })
export class AudioApiService {
  private readonly baseUrl = 'http://localhost:8000';

  constructor(private http: HttpClient) {}

  absoluteUrl(path: string): string {
    return path.startsWith('http') ? path : `${this.baseUrl}${path}`;
  }

  upload(file: File): Observable<AudioFileInfo> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<AudioFileInfo>(`${this.baseUrl}/api/audio/upload`, form);
  }

  createRound(difficulty: Difficulty, fileId?: string): Observable<AudioRound> {
    return this.http.post<AudioRound>(`${this.baseUrl}/api/rounds`, { difficulty, fileId: fileId || null });
  }

  renderPreview(sessionId: string, filters: AudioFilterConfig[]): Observable<PreviewResponse> {
    return this.http.post<PreviewResponse>(`${this.baseUrl}/api/rounds/${sessionId}/preview`, { filters });
  }

  score(sessionId: string, filters: AudioFilterConfig[]): Observable<ScoreResponse> {
    return this.http.post<ScoreResponse>(`${this.baseUrl}/api/rounds/${sessionId}/score`, { filters });
  }
}
