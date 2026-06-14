import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { animate } from 'animejs';
import { finalize } from 'rxjs';
import { ChromeComponent } from './chrome.component';
import { SegComponent } from '../ui/seg.component';
import { WaveGraphComponent } from './wave-graph.component';
import { CalcLogComponent } from './calc-log.component';
import {
  computeAccuracy, DIFF_META, Difficulty, makeRound, Params, ParamDesc, ParamKey, PARAMS, Round, Score,
} from '../core/dial-model';
import { hex } from '../core/util';
import { AudioFilterConfig, AudioFilterParam, AudioRound, ScoreDetail, WaveformPeaks } from '../core/audio-model';
import { AudioApiService } from '../core/audio-api.service';
import { AudioPlayerService } from '../core/audio-player.service';

type Phase = 'listen' | 'dial' | 'reveal' | 'sign';

@Component({
  selector: 'app-game',
  standalone: true,
  imports: [CommonModule, ChromeComponent, SegComponent, WaveGraphComponent, CalcLogComponent],
  template: `
    <app-chrome [theme]="theme" [status]="phase.toUpperCase()" [statusCode]="code" [footerHint]="'03 / GAME // ' + diffName">
      <div rightRail style="display:contents">
      @if (phase === 'listen' || phase === 'dial') {
        <app-seg title="MANIPULATION" [segStyle]="{ flex: '0 0 auto' }">
          <div class="tele">
            @if (audioRound) {
              @for (f of playerFilters; track f.id) { <div class="row"><span>{{ codeForFilter(f) }}</span><b>{{ f.label }}</b></div> }
            } @else {
              @for (k of keys; track k) { <div class="row"><span>{{ P(k).code }}</span><b>{{ P(k).label }}</b></div> }
            }
          </div>
        </app-seg>
        <app-seg [title]="phase === 'listen' ? 'MEMORY BANK' : 'TARGET'" [segStyle]="{ flex: '1' }">
          <div style="font-size:9px;color:var(--fg);line-height:1.9">
            @if (phase === 'listen') {
              STUDY THE ORIGINAL.<br /><span class="dim">YOU GET 3 PLAYS.<br />THEN IT SCRAMBLES.</span>
            } @else {
              RECONSTRUCT FROM<br />MEMORY.<br /><span class="dim">ORIGINAL IS HIDDEN<br />UNTIL YOU SUBMIT.</span>
            }
          </div>
        </app-seg>
        <app-seg title="PLAYS" [segStyle]="{ flex: '0 0 auto' }">
          <div class="spread">
            @for (i of [0, 1, 2]; track i) {
              <span [class.glow]="i < playsLeft" [ngStyle]="playCellStyle(i)">{{ i < playsLeft ? '●' : '○' }}</span>
            }
          </div>
        </app-seg>
      } @else {
        <app-seg title="MATCH SCORE" [right]="matchCode"
                 [segStyle]="{ flex: '1', minHeight: '0', display: 'flex', flexDirection: 'column' }">
          <div class="matchpanel">
            @if (audioRound) {
              <div class="calclog">
                <div class="calclog-h"><span>{{ computing ? 'COMPUTING MATCH...' : 'SERVER SCORE' }}</span><span class="cur-sq"></span></div>
                @if (computing) {
                  <div>FFT DELTA :: API</div>
                  <div>PARAM LOCK :: WAIT</div>
                  <div class="sum">SIGMA ACC = {{ pct.toFixed(1) }}%</div>
                } @else {
                  @for (d of scoreDetails.slice(0, 5); track $index) {
                    <div>{{ d.filter.toUpperCase() }} {{ d.param }} DELTA {{ d.accuracy.toFixed(3) }}</div>
                  }
                  <div class="sum">SIGMA RESOLVED OK</div>
                }
              </div>
            } @else {
              <app-calc-log [keys]="keys" [player]="player" [target]="round.target" [computing]="computing"></app-calc-log>
            }
            <div class="match-num">
              <div class="pct2 glow-hi">{{ pct.toFixed(1) }}<span class="u">%</span></div>
              <div class="match-lbl">SIGNAL MATCH</div>
            </div>
            <div class="match-inv">
              <div class="spread">
                <span class="dim" style="font-size:9px">DEVIATION</span>
                <b style="color:var(--accent)">{{ (100 - pct).toFixed(1) }}%</b>
              </div>
              <div class="meter inv"><i [style.width.%]="100 - pct"></i></div>
              <div class="match-grade">{{ grade }}</div>
            </div>
          </div>
        </app-seg>
        <app-seg title="DELTA" [segStyle]="{ flex: '0 0 auto' }">
          <div class="tele">
            @if (audioRound) {
              @for (d of scoreDetails.slice(0, 4); track $index) {
                <div class="row"><span>{{ d.param }}</span><b>{{ (d.accuracy * 100).toFixed(0) }}%</b></div>
              }
            } @else {
              @for (k of keys; track k) { <div class="row"><span>{{ P(k).code }}</span><b>{{ deltaPct(k) }}%</b></div> }
            }
          </div>
        </app-seg>
      }
      </div>

      <div class="stage" style="gap:12px">
        <app-seg [flush]="true" [brackets]="true" [segStyle]="{ flex: '1', minHeight: '0', position: 'relative' }">
          <div style="position:absolute;top:8px;left:12px;font-size:9px;color:var(--dim);z-index:2">
            {{ phase === 'listen' ? 'ORIGINAL SIGNAL' : phase === 'dial' ? 'YOUR SIGNAL' : 'COMPARE // OVERLAP' }} • AMP/T
          </div>
          <div style="position:absolute;top:8px;right:12px;font-size:9px;z-index:2">
            @if (showOrig) { <span style="color:var(--orig)">▬ ORIGINAL </span> }
            <span style="color:var(--wave)">▬ {{ phase === 'listen' ? 'ORIGINAL' : 'YOURS' }}</span>
          </div>
          <div style="position:absolute;inset:0">
            <app-wave-graph [player]="phase === 'listen' ? round.target : player" [target]="round.target"
                            [keys]="keys" [showOriginal]="showOrig" [playing]="playing"
                            [targetPeaks]="targetPeaks" [playerPeaks]="phase === 'listen' ? targetPeaks : previewPeaks"></app-wave-graph>
          </div>
          <div style="position:absolute;bottom:6px;left:12px;font-size:9px;color:var(--dim);z-index:2">
            {{ playing ? '▶ PLAYING' : '■ IDLE' }} • {{ graphCode }}
          </div>
        </app-seg>

        <app-seg [segStyle]="{ flex: '0 0 auto' }">
          @if (phase === 'listen') {
            <div class="spread">
              <div class="col" style="gap:4px">
                <span class="dim" style="font-size:9px">CLASSIC MODE // ORIGINAL PLAYBACK</span>
                <span class="f-pixel" style="font-size:13px;color:var(--hi)">
                  {{ playsLeft > 0 ? 'PLAYS LEFT  ' + playsLeft + ' / 3' : 'MEMORY LOCKED' }}
                  @if (apiUnavailable) { <span class="dim"> // SIM</span> }
                </span>
              </div>
              @if (playsLeft > 0) {
                <button class="btn big focusable" (click)="doListen()" [disabled]="playing">
                  {{ playing ? '▶ PLAYING…' : '▶ PLAY ORIGINAL' }}</button>
              } @else {
                <button class="btn big focusable" (click)="doManipulate()">⚡ MANIPULATE ▸</button>
              }
            </div>
          }

          @if (phase === 'dial') {
            <div class="col" style="gap:14px">
              <div class="spread">
                <span class="dim" style="font-size:9px">DIAL EACH SLIDER TO MATCH THE ORIGINAL FROM MEMORY</span>
                <div style="display:flex;gap:10px">
                  <button class="btn sm focusable" (click)="preview()">{{ playing ? '■ STOP' : '▶ PREVIEW' }}</button>
                  <button class="btn focusable" (click)="submit()">SUBMIT ▸</button>
                </div>
              </div>
              <div [ngStyle]="{ display: 'grid', gridTemplateColumns: colTemplate, gap: '16px' }">
                @if (audioRound) {
                  @for (f of playerFilters; track f.id) {
                    @for (p of f.params; track f.id + p.key) {
                      <div class="slider">
                        <div class="lab"><span>{{ codeForFilter(f) }} · {{ p.label }}</span><b>{{ dispParam(p) }}</b></div>
                        <input type="range" class="focusable" [min]="p.min" [max]="p.max" [step]="p.step"
                               [value]="p.value" (input)="setAudioParam(f, p, +$any($event.target).value)" [attr.aria-label]="p.label" />
                      </div>
                    }
                  }
                } @else {
                @for (k of keys; track k) {
                  <div class="slider">
                    <div class="lab"><span>{{ P(k).code }} · {{ P(k).label }}</span><b>{{ P(k).disp(player[k]) }}</b></div>
                    <input type="range" class="focusable" [min]="P(k).min" [max]="P(k).max" [step]="step(k)"
                           [value]="player[k]" (input)="setKey(k, +$any($event.target).value)" [attr.aria-label]="P(k).label" />
                  </div>
                }
                }
              </div>
            </div>
          }

          @if (phase === 'reveal') {
            <div class="spread">
              <div class="col" style="gap:4px">
                <span class="dim" style="font-size:9px">SIGNALS OVERLAID // MATCH COMPUTED</span>
                <span class="f-pixel" style="font-size:15px;color:var(--hi)">FINAL {{ pct.toFixed(1) }}%</span>
              </div>
              <button class="btn big focusable" (click)="goSign()">SIGN SCORE ▸</button>
            </div>
          }

          @if (phase === 'sign') {
            <div class="spread">
              <div class="col" style="gap:8px">
                <span class="dim" style="font-size:9px">ENTER CALLSIGN // 3-6 CHARS</span>
                <input #sigInput class="siginput" maxlength="6" [value]="name"
                       (input)="onName($event)" (keydown.enter)="onSignEnter()" placeholder="___" />
              </div>
              <button class="btn big focusable" [disabled]="name.length < 2" (click)="complete()">CONFIRM ▸</button>
            </div>
          }
        </app-seg>
      </div>
    </app-chrome>
  `,
})
export class GameComponent implements OnInit, OnDestroy {
  @Input() theme = 'ammo8';
  @Input() difficulty: Difficulty = 'medium';
  @Input() volume = 70;
  @Output() completed = new EventEmitter<Score>();
  @Output() exit = new EventEmitter<void>();
  @ViewChild('sigInput') sigInput?: ElementRef<HTMLInputElement>;

  round!: Round;
  audioRound?: AudioRound;
  playerFilters: AudioFilterConfig[] = [];
  scoreDetails: ScoreDetail[] = [];
  targetPeaks?: WaveformPeaks;
  previewPeaks?: WaveformPeaks;
  apiUnavailable = false;
  keys: ParamKey[] = [];
  phase: Phase = 'listen';
  playsLeft = 3;
  player: Params = {};
  playing = false;
  pct = 0;
  showOrig = false;
  computing = false;
  name = '';

  code = hex(4);
  graphCode = hex(4);
  matchCode = hex(3);

  private playTimer: any;
  private countTimer: any;

  constructor(private api: AudioApiService, private audio: AudioPlayerService) {}

  ngOnInit(): void {
    this.round = makeRound(this.difficulty);
    this.keys = this.round.keys;
    this.player = { ...this.round.target };
    this.api.createRound(this.difficulty).subscribe({
      next: (round) => {
        this.audioRound = round;
        this.playerFilters = this.cloneFilters(round.playerFilters);
        this.targetPeaks = round.waveform.target;
        this.previewPeaks = round.waveform.preview;
        this.keys = [];
        this.apiUnavailable = false;
      },
      error: () => {
        this.apiUnavailable = true;
      },
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.playTimer);
    clearInterval(this.countTimer);
    this.audio.stop();
  }

  P(k: ParamKey): ParamDesc { return PARAMS[k]; }
  step(k: ParamKey): number { const P = PARAMS[k]; return (P.max - P.min) / 200; }
  get diffName(): string { return DIFF_META[this.difficulty].name; }
  get colTemplate(): string { return `repeat(${Math.min(this.audioControlCount || this.keys.length, 3)},1fr)`; }
  get finalAcc(): number { return this.audioRound ? this.pct : computeAccuracy(this.keys, this.player, this.round.target); }
  get audioControlCount(): number { return this.playerFilters.reduce((sum, f) => sum + f.params.length, 0); }

  get grade(): string {
    return this.pct >= 90 ? 'IMMACULATE EAR' : this.pct >= 70 ? 'SOLID DIAL' : this.pct >= 45 ? 'WITHIN RANGE' : 'OFF SIGNAL';
  }

  deltaPct(k: ParamKey): number {
    const span = PARAMS[k].max - PARAMS[k].min;
    return Math.round((1 - Math.min(1, Math.abs(this.player[k] - this.round.target[k]) / span)) * 100);
  }

  playCellStyle(i: number): { [k: string]: string } {
    return {
      width: '26px', height: '26px', border: '1px solid var(--line)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px',
      background: i < this.playsLeft ? 'transparent' : 'color-mix(in srgb,var(--fg) 18%,transparent)',
      color: i < this.playsLeft ? 'var(--fg)' : 'var(--dim)',
    };
  }

  doListen(): void {
    if (this.playsLeft <= 0 || this.playing) return;
    if (this.audioRound) {
      this.playing = true;
      this.audio.play(this.api.absoluteUrl(this.audioRound.targetUrl), this.volume, () => {
        this.playing = false;
        this.playsLeft--;
      });
      return;
    }
    this.playing = true;
    clearTimeout(this.playTimer);
    this.playTimer = setTimeout(() => {
      this.playing = false;
      this.playsLeft--;
    }, 2400);
  }

  doManipulate(): void {
    if (this.audioRound) {
      this.phase = 'dial';
      return;
    }
    if (this.difficulty === 'easy') {
      this.player = { ...this.player, ...this.round.player };
      this.phase = 'dial';
      return;
    }
    const proxy: Params = { ...this.round.target };
    const targetVals = Object.fromEntries(this.keys.map((k) => [k, this.round.player[k]]));
    animate(proxy, {
      ...targetVals,
      duration: 1000,
      ease: 'inOutQuad',
      onUpdate: () => {
        this.keys.forEach((k) => (this.player[k] = proxy[k]));
      },
    });
    setTimeout(() => {
      this.player = { ...this.player, ...this.round.player };
      this.phase = 'dial';
    }, 1050);
  }

  preview(): void {
    if (!this.audioRound) {
      this.playing = !this.playing;
      return;
    }
    if (this.playing) {
      this.audio.stop();
      this.playing = false;
      return;
    }
    this.playing = true;
    this.api.renderPreview(this.audioRound.sessionId, this.playerFilters)
      .pipe(finalize(() => {}))
      .subscribe({
        next: (res) => {
          this.previewPeaks = res.waveform;
          this.audio.play(this.api.absoluteUrl(res.previewUrl), this.volume, () => (this.playing = false));
        },
        error: () => {
          this.playing = false;
        },
      });
  }

  submit(): void {
    this.playing = false;
    this.audio.stop();
    this.phase = 'reveal';
    this.showOrig = true;
    this.playing = !this.audioRound;
    if (this.audioRound) {
      this.computing = true;
      this.api.score(this.audioRound.sessionId, this.playerFilters).subscribe({
        next: (res) => {
          this.scoreDetails = res.details;
          this.animateScore(res.score);
        },
        error: () => {
          this.scoreDetails = [];
          this.animateScore(0);
        },
      });
      return;
    }
    const acc = computeAccuracy(this.keys, this.player, this.round.target);
    this.animateScore(acc);
  }

  private animateScore(acc: number): void {
    const dur = 2200, start = performance.now();
    this.computing = true;
    clearInterval(this.countTimer);
    this.countTimer = setInterval(() => {
      const t = Math.min(1, (performance.now() - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      this.pct = Math.round(acc * eased * 10) / 10;
      if (t >= 1) {
        clearInterval(this.countTimer);
        this.pct = acc;
        this.computing = false;
      }
    }, 40);
  }

  setKey(k: ParamKey, v: number): void {
    this.player = { ...this.player, [k]: v };
  }

  setAudioParam(filter: AudioFilterConfig, param: AudioFilterParam, value: number): void {
    this.playerFilters = this.playerFilters.map((f) =>
      f.id === filter.id ? { ...f, params: f.params.map((p) => (p.key === param.key ? { ...p, value } : p)) } : f,
    );
  }

  dispParam(p: AudioFilterParam): string {
    const value = p.step < 1 ? p.value.toFixed(2) : p.value.toFixed(0);
    return p.unit ? `${value}${p.unit}` : value;
  }

  codeForFilter(f: AudioFilterConfig): string {
    return f.type === 'eq4' ? 'EQ4' : f.type === 'echo' ? 'DLY' : 'DRV';
  }

  private cloneFilters(filters: AudioFilterConfig[]): AudioFilterConfig[] {
    return filters.map((f) => ({ ...f, params: f.params.map((p) => ({ ...p })) }));
  }

  goSign(): void {
    this.phase = 'sign';
    setTimeout(() => this.sigInput?.nativeElement.focus(), 0);
  }

  onName(e: Event): void {
    this.name = (e.target as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    (e.target as HTMLInputElement).value = this.name;
  }

  onSignEnter(): void {
    if (this.name.length >= 2) this.complete();
  }

  complete(): void {
    if (this.name.length < 2) return;
    this.completed.emit({ name: this.name, pct: this.finalAcc, diff: this.difficulty });
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (this.phase === 'listen' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      this.playsLeft > 0 ? this.doListen() : this.doManipulate();
    }
    if (this.phase === 'dial' && e.key === 'Enter') { e.preventDefault(); this.submit(); }
    if (e.key === 'Escape') this.exit.emit();
  }
}
