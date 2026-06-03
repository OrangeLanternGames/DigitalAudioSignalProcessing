import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-telemetry',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="tele">
      @for (r of rows; track $index) {
        <div class="row"><span>{{ r[0] }}</span><b>{{ r[1] }}</b></div>
      }
    </div>
  `,
})
export class TelemetryComponent {
  @Input() rows: [string, string][] = [];
}
