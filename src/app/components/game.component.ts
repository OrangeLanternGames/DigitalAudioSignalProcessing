import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { animate } from 'animejs';
import { ChromeComponent } from './chrome.component';
import { SegComponent } from '../ui/seg.component';
import { WaveGraphComponent } from './wave-graph.component';
import { CalcLogComponent } from './calc-log.component';
import {
  computeAccuracy, DIFF_META, Difficulty, makeRound, Params, ParamDesc, ParamKey, PARAMS, Round, Score,
} from '../core/dial-model';
import { hex } from '../core/util';

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
            @for (k of keys; track k) { <div class="row"><span>{{ P(k).code }}</span><b>{{ P(k).label }}</b></div> }
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
            <app-calc-log [keys]="keys" [player]="player" [target]="round.target" [computing]="computing"></app-calc-log>
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
            @for (k of keys; track k) { <div class="row"><span>{{ P(k).code }}</span><b>{{ deltaPct(k) }}%</b></div> }
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
                            [keys]="keys" [showOriginal]="showOrig" [playing]="playing"></app-wave-graph>
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
                @for (k of keys; track k) {
                  <div class="slider">
                    <div class="lab"><span>{{ P(k).code }} · {{ P(k).label }}</span><b>{{ P(k).disp(player[k]) }}</b></div>
                    <input type="range" class="focusable" [min]="P(k).min" [max]="P(k).max" [step]="step(k)"
                           [value]="player[k]" (input)="setKey(k, +$any($event.target).value)" [attr.aria-label]="P(k).label" />
                  </div>
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
  @Output() completed = new EventEmitter<Score>();
  @Output() exit = new EventEmitter<void>();
  @ViewChild('sigInput') sigInput?: ElementRef<HTMLInputElement>;

  round!: Round;
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

  ngOnInit(): void {
    this.round = makeRound(this.difficulty);
    this.keys = this.round.keys;
    this.player = { ...this.round.target };
  }

  ngOnDestroy(): void {
    clearTimeout(this.playTimer);
    clearInterval(this.countTimer);
  }

  P(k: ParamKey): ParamDesc { return PARAMS[k]; }
  step(k: ParamKey): number { const P = PARAMS[k]; return (P.max - P.min) / 200; }
  get diffName(): string { return DIFF_META[this.difficulty].name; }
  get colTemplate(): string { return `repeat(${Math.min(this.keys.length, 3)},1fr)`; }
  get finalAcc(): number { return computeAccuracy(this.keys, this.player, this.round.target); }

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
    this.playing = true;
    clearTimeout(this.playTimer);
    this.playTimer = setTimeout(() => {
      this.playing = false;
      this.playsLeft--;
    }, 2400);
  }

  doManipulate(): void {
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
    this.playing = !this.playing;
  }

  submit(): void {
    this.playing = false;
    this.phase = 'reveal';
    this.showOrig = true;
    this.playing = true;
    const acc = computeAccuracy(this.keys, this.player, this.round.target);
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
