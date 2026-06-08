import { Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Params, ParamKey, PARAMS } from '../core/dial-model';
import { hex } from '../core/util';

@Component({
  selector: 'app-calc-log',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="calclog">
      <div class="calclog-h">
        <span>{{ computing ? 'COMPUTING MATCH…' : 'MATCH RESOLVED' }}</span>
        <span class="cur-sq"></span>
      </div>
      @for (r of rows; track $index; let i = $index) {
        <div [class.sum]="i === rows.length - 1">{{ r }}</div>
      }
    </div>
  `,
})
export class CalcLogComponent implements OnInit, OnChanges, OnDestroy {
  @Input() keys: ParamKey[] = [];
  @Input() player: Params = {};
  @Input() target: Params = {};
  @Input() computing = false;

  rows: string[] = [];
  private id: any;

  ngOnInit(): void {
    this.refresh();
  }
  ngOnChanges(ch: SimpleChanges): void {
    if (ch['computing']) this.refresh();
  }
  ngOnDestroy(): void {
    clearInterval(this.id);
  }

  private refresh(): void {
    clearInterval(this.id);
    if (this.computing) {
      const run = () => {
        this.rows = this.keys
          .map((k) => `${PARAMS[k].code} Δ ${(Math.random() * 0.999).toFixed(3)} :: 0x${hex(2)}`)
          .concat([`Σ ACC = ${(Math.random() * 100).toFixed(1)}%  ${hex(4)}`]);
      };
      run();
      this.id = setInterval(run, 60);
    } else {
      this.rows = this.keys
        .map((k) => {
          const span = PARAMS[k].max - PARAMS[k].min;
          const e = 1 - Math.min(1, Math.abs(this.player[k] - this.target[k]) / span);
          return `${PARAMS[k].code} Δ ${e.toFixed(3)} :: LOCK`;
        })
        .concat(['Σ RESOLVED ········· OK']);
    }
  }
}
