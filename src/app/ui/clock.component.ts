import { Component, OnDestroy, OnInit } from '@angular/core';

@Component({
  selector: 'app-clock',
  standalone: true,
  template: `<span>{{ t }}</span>`,
})
export class ClockComponent implements OnInit, OnDestroy {
  t = '';
  private id: any;

  ngOnInit(): void {
    this.tick();
    this.id = setInterval(() => this.tick(), 1000);
  }
  ngOnDestroy(): void {
    clearInterval(this.id);
  }
  private tick(): void {
    const d = new Date();
    const hh = String(d.getHours() % 12 || 12).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    this.t = (d.getHours() < 12 ? 'AM' : 'PM') + ' ' + hh + ':' + mm + ':' + ss;
  }
}
