import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AudioPlayerService {
  private audio?: HTMLAudioElement;

  stop(): void {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.audio = undefined;
  }

  play(url: string, volume: number, onEnded?: () => void): void {
    this.stop();
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume / 100));
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
