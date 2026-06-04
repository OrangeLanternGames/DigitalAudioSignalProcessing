import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { hex } from '../core/util';

@Component({
  selector: 'app-hex-stream',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="hexstream">
      @for (r of rows; track $index; let i = $index) {
        <div [style.opacity]="0.32 + (i / lines) * 0.68">{{ r }}</div>
      }
    </div>
  `,
})
export class HexStreamComponent implements OnInit, OnDestroy {
  @Input() lines = 6;
  @Input() speed = 150;
  rows: string[] = [];
  private id: any;

  private dataLine(): string {
    return hex(4) + '  ' + Array.from({ length: 3 }, () => hex(2)).join(' ') + '  ' + (Math.random() < 0.5 ? '··' : '▪▪');
  }
  ngOnInit(): void {
    this.rows = Array.from({ length: this.lines }, () => this.dataLine());
    this.id = setInterval(() => {
      const n = this.rows.slice(1);
      n.push(this.dataLine());
      this.rows = n;
    }, this.speed);
  }
  ngOnDestroy(): void {
    clearInterval(this.id);
  }
}
