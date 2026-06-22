import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AudioPlayerService {
  private audio?: HTMLAudioElement;

  /** Current playback position as 0..1 of the clip, or 0 when nothing plays. */
  get progress(): number {
    const a = this.audio;
    if (!a || !a.duration || !isFinite(a.duration) || a.duration <= 0) return 0;
    return Math.min(1, Math.max(0, a.currentTime / a.duration));
  }

  stop(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.audio = undefined;
  }

  play(url: string, volume: number, onEnded?: () => void, onStarted?: () => void): void {
    this.stop();
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume / 100));
    // Fires when playback actually begins (after the file has buffered enough),
    // so callers can sync the UI/animation to real audio, not to the click.
    audio.onplaying = () => onStarted?.();
    audio.onended = () => {
      this.audio = undefined;
      onEnded?.();
    };
    audio.onerror = () => {
      this.audio = undefined;
      onEnded?.();
    };
    this.audio = audio;
    void audio.play().catch(() => onEnded?.());
  }
}
