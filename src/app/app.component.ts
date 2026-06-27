import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BootComponent } from './components/boot.component';
import { LandingComponent } from './components/landing.component';
import { DifficultyComponent } from './components/difficulty.component';
import { GameComponent } from './components/game.component';
import { StorageService } from './core/storage.service';
import { Difficulty, Score } from './core/dial-model';

type Screen = 'boot' | 'landing' | 'difficulty' | 'game';

const SEED_SCORES: Score[] = [
  { name: 'NEO', pct: 97.4, diff: 'random' },
  { name: 'VX9', pct: 91.2, diff: 'distortion' },
  { name: 'ECHO', pct: 88.0, diff: 'echo' },
  { name: 'KAI', pct: 81.6, diff: 'eq4' },
  { name: 'M0DE', pct: 74.3, diff: 'echo' },
  { name: 'RAW', pct: 69.9, diff: 'eq4' },
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, BootComponent, LandingComponent, DifficultyComponent, GameComponent],
  template: `
    <div style="position:absolute;inset:0">
      @switch (screen) {
        @case ('boot') {
          <app-boot (done)="screen = 'landing'"></app-boot>
        }
        @case ('landing') {
          <app-landing [theme]="theme" [volume]="volume" [scores]="scores"
                       (play)="flow('difficulty')" (setTheme)="setTheme($event)"
                       (setVolume)="setVolume($event)"></app-landing>
        }
        @case ('difficulty') {
          <app-difficulty [theme]="theme" (selected)="onSelectDiff($event)" (back)="flow('landing')"></app-difficulty>
        }
        @case ('game') {
          <app-game [theme]="theme" [difficulty]="difficulty" [volume]="volume"
                    (completed)="onComplete($event)" (exit)="flow('landing')"></app-game>
        }
      }
    </div>

    <div #sweep class="flow-sweep"
         style="position:fixed;top:0;bottom:0;left:0;width:70%;z-index:90;
                background:linear-gradient(90deg, transparent, color-mix(in srgb,var(--fg) 25%,transparent) 42%, var(--fg) 50%, color-mix(in srgb,var(--fg) 25%,transparent) 58%, transparent);
                box-shadow:0 0 50px var(--fg);mix-blend-mode:screen;pointer-events:none"></div>
  `,
})
export class AppComponent implements OnInit {
  @ViewChild('sweep') sweepRef!: ElementRef<HTMLElement>;

  screen: Screen = 'boot';
  theme = 'ammo8';
  volume = 70;
  scores: Score[] = SEED_SCORES;
  difficulty: Difficulty = 'eq4';

  constructor(private ls: StorageService) {}

  ngOnInit(): void {
    this.theme = this.ls.get('theme', 'ammo8');
    this.volume = this.ls.get('volume', 70);
    this.scores = this.ls.get<Score[]>('scores', SEED_SCORES);
    this.applyTheme();
  }

  private applyTheme(): void {
    document.documentElement.dataset['theme'] = this.theme;
    this.ls.set('theme', this.theme);
  }

  setTheme(t: string): void {
    this.theme = t;
    this.applyTheme();
  }

  setVolume(v: number): void {
    this.volume = v;
    this.ls.set('volume', v);
  }

  flow(next: Screen): void {
    const el = this.sweepRef?.nativeElement;
    if (el) {
      el.classList.remove('run');
      void el.offsetWidth;
      el.classList.add('run');
    }
    setTimeout(() => (this.screen = next), 300);
    if (el) setTimeout(() => el.classList.remove('run'), 700);
  }

  onSelectDiff(d: Difficulty): void {
    this.difficulty = d;
    this.flow('game');
  }

  onComplete(s: Score): void {
    this.addScore(s);
    this.flow('landing');
  }

  private addScore(s: Score): void {
    const cleaned = this.scores.map((x) => ({ ...x, isNew: false }));
    this.scores = [...cleaned, { ...s, isNew: true }].sort((a, b) => b.pct - a.pct).slice(0, 12);
    this.ls.set('scores', this.scores);
  }
}
