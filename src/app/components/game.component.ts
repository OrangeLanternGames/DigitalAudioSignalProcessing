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
import { ClientDspService } from '../core/client-dsp.service';

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
                            [keys]="keys" [showOriginal]="showOrig" [playing]="playing" [progressFn]="progressFn"
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
              <div style="display:flex;gap:10px">
                @if (playsLeft > 0) {
                  <button class="btn big focusable" (click)="doListen()" [disabled]="playing">
                    {{ playing ? '▶ PLAYING…' : '▶ PLAY ORIGINAL' }}</button>
                }
                @if (playsLeft < 3) {
                  <button class="btn big focusable" (click)="doManipulate()" [disabled]="playing">MANIPULATE</button>
                }
              </div>
            </div>
          }

          @if (phase === 'dial') {
            <div class="col" style="gap:14px">
              <div class="spread">
                <span class="dim" style="font-size:9px">DIAL EACH SLIDER TO MATCH THE ORIGINAL FROM MEMORY</span>
                <div style="display:flex;gap:10px">
                  <button class="btn sm focusable" (click)="preview()">{{ previewLoading ? '… RENDERING' : playing ? '■ STOP' : '▶ PREVIEW' }}</button>
                  <button class="btn focusable" (click)="submit()">SUBMIT ▸</button>
                </div>
              </div>
              <div [ngStyle]="{ display: 'grid', gridTemplateColumns: colTemplate, gap: '16px' }">
                @if (audioRound) {
                  @for (f of playerFilters; track f.id) {
                    @for (p of f.params; track p.key) {
                      <div class="slider" [class.keysel]="f.id === selectedFilterId && p.key === selectedParamKey">
                        <div class="lab"><span>{{ codeForFilter(f) }} · {{ p.label }}</span><b>{{ dispParam(p) }}</b></div>
                        <input type="range" class="focusable" [min]="p.min" [max]="p.max" [step]="p.step"
                               [value]="p.value" (input)="setAudioParam(f, p, +$any($event.target).value)" [attr.aria-label]="p.label" />
                      </div>
                    }
                  }
                } @else {
                @for (k of keys; track k) {
                  <div class="slider" [class.keysel]="selectedControlIndex === $index">
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
  @Input() difficulty: Difficulty = 'eq4';
  @Input() volume = 70;
  @Output() completed = new EventEmitter<Score>();
  @Output() exit = new EventEmitter<void>();
  @ViewChild('sigInput') sigInput?: ElementRef<HTMLInputElement>;

  round!: Round;
  audioRound?: AudioRound;
  playerFilters: AudioFilterConfig[] = [];
  scrambleFilters: AudioFilterConfig[] = []; // off-target start applied on MANIPULATE
  scoreDetails: ScoreDetail[] = [];
  targetPeaks?: WaveformPeaks;
  previewPeaks?: WaveformPeaks;
  apiUnavailable = false;
  keys: ParamKey[] = [];
  phase: Phase = 'listen';
  playsLeft = 3;
  player: Params = {};
  playing = false;
  previewLoading = false;
  pct = 0;
  showOrig = false;
  computing = false;
  name = '';
  selectedControlIndex = 0;
  selectedFilterId = '';
  selectedParamKey = '';

  code = hex(4);
  graphCode = hex(4);
  matchCode = hex(3);

  // Real playback position (0..1) for the graph playhead; null in mock mode
  // (no audio) so it falls back to the decorative sweep.
  readonly progressFn = (): number | null => (this.audioRound ? this.audio.progress : null);

  private playTimer: any;
  private countTimer: any;
  private graphTimer: any;
  private previewSeq = 0;

  constructor(private api: AudioApiService, private audio: AudioPlayerService, private clientDsp: ClientDspService) {}

  ngOnInit(): void {
    this.round = makeRound(this.difficulty);
    this.keys = this.round.keys;
    this.player = { ...this.round.target };
    this.api.createRound(this.difficulty).subscribe({
      next: (round) => {
        this.audioRound = round;
        // Start the player ON the original (target): during LISTEN the signal is
        // intact. The off-target scramble is applied only on MANIPULATE, so the
        // player then dials back to reconstruct the original. Mirrors the mock
        // (player starts at round.target, doManipulate moves it to round.player).
        this.scrambleFilters = round.playerFilters;
        this.playerFilters = this.cloneFilters(round.targetFilters);
        this.targetPeaks = round.waveform.target;
        this.previewPeaks = round.waveform.target; // intact graph until manipulate
        this.keys = [];
        this.apiUnavailable = false;
        this.syncSelection();
        // Decode the source once so slider drags can re-render the preview
        // graph in-browser (no per-edit network). Server stays the fallback.
        this.clientDsp.loadSource(this.api.absoluteUrl(round.sourceUrl)).catch(() => {});
      },
      error: () => {
        this.apiUnavailable = true;
      },
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.playTimer);
    clearInterval(this.countTimer);
    clearTimeout(this.graphTimer);
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
      // PLAY ORIGINAL = the clean, unprocessed source. The player memorises this,
      // then (after MANIPULATE) dials the random effects back out to restore it.
      this.audio.play(this.api.absoluteUrl(this.audioRound.sourceUrl), this.volume, () => {
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
      this.scrambleAudioFilters();
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

  // Backend rounds: apply the manipulation on MANIPULATE (all difficulties).
  // Enter the dial phase showing the intact original, sweep the sliders from the
  // target (original) to the off-target scramble start, then settle so the
  // player can reconstruct the original. Backend/scoring untouched.
  private scrambleAudioFilters(): void {
    this.phase = 'dial';
    this.syncSelection();
    const refs = this.audioParamRefs();
    const from = refs.map((r) => r.param.value); // intact == target
    const to = refs.map((r) => {
      const f = this.scrambleFilters.find((x) => x.type === r.filter.type);
      const p = f?.params.find((x) => x.key === r.param.key);
      return this.clamp(p ? Number(p.value) : r.param.value, r.param.min, r.param.max);
    });
    const proxy = { t: 0 };
    animate(proxy, {
      t: 1,
      duration: 900,
      ease: 'inOutQuad',
      onUpdate: () => {
        refs.forEach((r, i) => (r.param.value = from[i] + (to[i] - from[i]) * proxy.t));
      },
    });
    setTimeout(() => {
      refs.forEach((r, i) => (r.param.value = to[i]));
      // Snap the graph to the scrambled state (exact backend render of the start).
      this.previewPeaks = this.audioRound?.waveform.preview ?? this.previewPeaks;
      this.syncSelection();
    }, 950);
  }

  preview(): void {
    if (!this.audioRound) {
      this.playing = !this.playing;
      return;
    }
    // Toggle off: stop playback, or cancel an in-flight render (the seq bump
    // below makes any pending response a no-op).
    if (this.playing || this.previewLoading) {
      this.audio.stop();
      this.playing = false;
      this.previewLoading = false;
      this.previewSeq++;
      return;
    }
    // The backend render can take a few seconds (echo + distortion on a long
    // clip). Show a RENDERING state now, but do NOT start the scrub animation:
    // `playing` flips on only when the audio actually begins (onStarted).
    this.previewLoading = true;
    // Supersede any pending/in-flight debounced graph render so its (older)
    // peaks cannot land after this explicit preview.
    clearTimeout(this.graphTimer);
    const seq = ++this.previewSeq;
    this.api.renderPreview(this.audioRound.sessionId, this.playerFilters)
      .pipe(finalize(() => {}))
      .subscribe({
        next: (res) => {
          if (seq !== this.previewSeq) return; // superseded or cancelled
          this.previewPeaks = res.waveform;
          // Stay in RENDERING until the audio truly starts (covers backend
          // compute + file buffering), then flip straight to playing.
          this.audio.play(
            this.api.absoluteUrl(res.previewUrl),
            this.volume,
            () => { this.playing = false; this.previewLoading = false; },
            () => { this.playing = true; this.previewLoading = false; },
          );
        },
        error: () => {
          this.previewLoading = false;
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
    // Mutate the live param object in place: the template iterates playerFilters,
    // so `param` is already the bound instance. Keeping object identity stable
    // avoids re-asserting [value] on the native range input mid-drag (thumb jump)
    // and the O(N) array churn that recreation caused on every input event.
    param.value = this.clamp(value, param.min, param.max);
    this.scheduleGraphRender();
  }

  // Live-couple the WAV graph to the sliders: re-render the preview waveform
  // (peaks only, no audio) shortly after the last edit. Debounced so a drag
  // does not fire one render per input event.
  private scheduleGraphRender(): void {
    if (!this.audioRound || this.phase !== 'dial') return;
    clearTimeout(this.graphTimer);
    this.graphTimer = setTimeout(() => this.renderGraphPreview(), 150);
  }

  private renderGraphPreview(): void {
    if (!this.audioRound) return;
    const seq = ++this.previewSeq;
    // Preferred path: in-browser DSP approximation in a Web Worker — no network
    // AND no main-thread blocking in the hot path. The score and the actual
    // played audio still come from the server, so this is display-only and a
    // small deviation from the backend render is fine.
    if (this.clientDsp.ready) {
      this.clientDsp.renderPeaks(this.playerFilters).then((samples) => {
        if (seq !== this.previewSeq || !samples.length) return; // superseded
        this.previewPeaks = {
          samples,
          sampleRate: this.clientDsp.sampleRate,
          durationSec: this.clientDsp.durationSec,
        };
      });
      return;
    }
    // Fallback: server render when the client buffer is not (yet) available.
    this.api.renderPreview(this.audioRound.sessionId, this.playerFilters).subscribe({
      next: (res) => {
        // Drop stale responses: a newer edit already bumped previewSeq, so this
        // result is out of date and would otherwise overwrite the latest peaks.
        if (seq === this.previewSeq) this.previewPeaks = res.waveform;
      },
      error: () => {},
    });
  }

  private syncSelection(): void {
    if (!this.audioRound) { this.selectedFilterId = ''; this.selectedParamKey = ''; return; }
    const ref = this.audioParamRefs()[this.selectedControlIndex];
    this.selectedFilterId = ref?.filter.id ?? '';
    this.selectedParamKey = ref?.param.key ?? '';
  }

  dispParam(p: AudioFilterParam): string {
    const value = p.step < 1 ? p.value.toFixed(2) : p.value.toFixed(0);
    return p.unit ? `${value}${p.unit}` : value;
  }

  codeForFilter(f: AudioFilterConfig): string {
    return f.type === 'eq4' ? 'EQ4' : f.type === 'chorus' ? 'CHR' : f.type === 'echo' ? 'DLY' : 'DRV';
  }

  private cloneFilters(filters: AudioFilterConfig[]): AudioFilterConfig[] {
    return filters.map((f) => ({ ...f, params: f.params.map((p) => ({ ...p })) }));
  }

  private audioParamRefs(): Array<{ filter: AudioFilterConfig; param: AudioFilterParam }> {
    return this.playerFilters.flatMap((filter) => filter.params.map((param) => ({ filter, param })));
  }

  private controlCount(): number {
    return this.audioRound ? this.audioParamRefs().length : this.keys.length;
  }

  private clamp(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, v));
  }

  private snap(value: number, step: number): number {
    const decimals = Math.max(0, (String(step).split('.')[1] || '').length);
    return Number(value.toFixed(Math.min(decimals + 2, 6)));
  }

  private selectControl(index: number): void {
    const count = this.controlCount();
    if (!count || index < 0 || index >= count) return;
    this.selectedControlIndex = index;
    this.syncSelection();
  }

  private adjustSelectedControl(direction: 1 | -1): void {
    const count = this.controlCount();
    if (!count) return;
    this.selectedControlIndex = Math.min(this.selectedControlIndex, count - 1);
    this.syncSelection();
    if (this.audioRound) {
      const ref = this.audioParamRefs()[this.selectedControlIndex];
      if (!ref) return;
      const next = this.snap(this.clamp(ref.param.value + ref.param.step * direction, ref.param.min, ref.param.max), ref.param.step);
      this.setAudioParam(ref.filter, ref.param, next);
      return;
    }
    const key = this.keys[this.selectedControlIndex];
    if (!key) return;
    const P = PARAMS[key];
    const amount = this.step(key);
    const next = this.snap(this.clamp(this.player[key] + amount * direction, P.min, P.max), amount);
    this.setKey(key, next);
  }

  private shiftDelay(direction: 1 | -1): void {
    const echo = this.playerFilters.find((filter) => filter.type === 'echo');
    const delay = echo?.params.find((param) => param.key === 'delayMs');
    if (!echo || !delay) return;
    const next = this.snap(this.clamp(delay.value + delay.step * 10 * direction, delay.min, delay.max), delay.step);
    this.setAudioParam(echo, delay, next);
    const delayIndex = this.audioParamRefs().findIndex((ref) => ref.filter.id === echo.id && ref.param.key === delay.key);
    if (delayIndex >= 0) { this.selectedControlIndex = delayIndex; this.syncSelection(); }
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
    const target = e.target as HTMLInputElement;
    if (target.tagName === 'INPUT' && target.type !== 'range') return;
    if (this.phase === 'listen' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      this.playsLeft > 0 ? this.doListen() : this.doManipulate();
    }
    if (this.phase === 'dial') {
      const key = e.key.toLowerCase();
      if (/^[1-9]$/.test(key)) {
        e.preventDefault();
        this.selectControl(Number(key) - 1);
        return;
      }
      if (key === 'w') {
        e.preventDefault();
        this.adjustSelectedControl(1);
        return;
      }
      if (key === 's') {
        e.preventDefault();
        this.adjustSelectedControl(-1);
        return;
      }
      if (key === 'r') {
        e.preventDefault();
        this.shiftDelay(1);
        return;
      }
      if (key === 'e') {
        e.preventDefault();
        this.shiftDelay(-1);
        return;
      }
      if (e.key === 'Enter') { e.preventDefault(); this.submit(); }
    }
    if (e.key === 'Escape') this.exit.emit();
  }
}
