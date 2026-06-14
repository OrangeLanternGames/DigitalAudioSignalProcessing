# Prompt-Kontrolle: DIAL IN Audio-Backend und Angular-Integration

## Wiederverwendbarer Prompt

```text
Du arbeitest im Repo `DigitalAudioSignalProcessing`.

Kontext:
- Das Projekt ist eine Angular-Standalone-App namens DIAL IN.
- Ziel des Spiels: Der Spieler hoert ein manipuliertes Audiosignal und stellt Filterparameter per Slider so ein, dass sein Signal moeglichst nah an das Zielsignal kommt.
- Vorher war die Audio-Logik nur eine Frontend-Simulation mit mathematischen Wellenformen.
- Jetzt wurde ein echtes Python-FastAPI-Backend im Monorepo unter `server/` ergaenzt.

Bitte pruefe, erweitere oder debugge die aktuelle Umsetzung:
- FastAPI-Backend mit Upload, Round-Erstellung, Preview-Rendering, Target-Audio und Score.
- DSP-Filter: 4-Band-FIR-EQ (`eq4`), Echo/Delay und Distortion.
- Serverseitiges Rendering von WAV-Dateien und Waveform-Peaks.
- Angular-Services fuer API-Kommunikation und Audio-Playback.
- `GameComponent` nutzt API-Rounds, dynamische Filter-Slider, Preview-Rendering und Backend-Scoring.
- `WaveGraphComponent` kann echte Waveform-Peaks zeichnen.
- Manim-Dokumentationsszenen liegen unter `docs/dial_in_manim.py`.

Wichtige Befehle:
- Backend starten:
  `cd server && python -m uvicorn app.main:app --reload --port 8000`
- Frontend starten:
  `npm start`
- Backend testen:
  `python -m pytest server`
- Frontend bauen:
  `npm run build`
- Manim-Syntax pruefen:
  `python -m py_compile docs\dial_in_manim.py`

Bitte arbeite vorsichtig mit bestehenden Aenderungen:
- Keine fremden Aenderungen zuruecksetzen.
- Bestehende Dirty-Files respektieren.
- Bei Codeaenderungen Tests/Build erneut ausfuehren.
```

## Was umgesetzt wurde

### 1. Monorepo-Backend unter `server/`

Es wurde ein neues Python-FastAPI-Backend angelegt. Die Idee dahinter: Angular bleibt das sichtbare Spiel-Frontend, waehrend Python die echte Audiosignalverarbeitung uebernimmt.

Neue Kern-Dateien:

- `server/app/main.py`: FastAPI-App mit HTTP-Endpunkten.
- `server/app/dsp.py`: DSP-Funktionen fuer WAV-Loading, Filter, Rendering, Waveform-Peaks und Spektrum-Score.
- `server/app/models.py`: Pydantic-Modelle fuer API-Requests und Responses.
- `server/app/rounds.py`: Round- und Filterparameter-Logik.
- `server/tests/test_api.py`: API-Tests fuer Round, Preview und Score.
- `server/requirements.txt`: Python-Abhaengigkeiten.
- `server/Dockerfile`: Container-Setup fuer das Backend.
- `docker-compose.yml`: Startet Backend und Frontend gemeinsam fuer Demo/Abgabe.

Das Backend kann auch ohne Upload direkt eine Demo-Runde erzeugen. Dafuer wird automatisch ein internes Testsignal generiert. Das ist praktisch fuer die Praesentation, weil das Spiel sofort funktioniert.

### 2. Echte DSP-Filter

Die bisherige Frontend-Simulation wurde nicht geloescht, sondern durch echte Backend-Filter ergaenzt.

Umgesetzt wurden:

- `eq4`: 4-Band-FIR-EQ mit Bass, Low Mid, High Mid und Treble.
- `echo`: Delay mit Delay-Zeit, Feedback und Mix.
- `distortion`: nichtlineare Verzerrung ueber `tanh` Waveshaping.

Difficulty-Mapping:

- Easy: nur `eq4`
- Medium: `eq4` + `echo`
- Hard: `eq4` + `echo` + `distortion`

### 3. API-Endpunkte

Die wichtigsten Endpunkte:

- `POST /api/audio/upload`: WAV-Datei hochladen und normalisieren.
- `POST /api/rounds`: Neue Spielrunde erzeugen.
- `GET /api/audio/{fileId}`: Original-/Source-WAV ausliefern.
- `GET /api/rounds/{roundId}/target`: Zielsignal ausliefern.
- `POST /api/rounds/{roundId}/preview`: Spielerfilter rendern.
- `GET /api/rounds/{roundId}/preview/{previewId}`: Preview-WAV ausliefern.
- `POST /api/rounds/{roundId}/score`: Score berechnen.

Der Score kombiniert:

- Parameternaehe zum versteckten Ziel.
- Spektrale Aehnlichkeit der gerenderten Signale.

### 4. Angular-Integration

Im Frontend wurden neue Core-Dateien angelegt:

- `src/app/core/audio-model.ts`
- `src/app/core/audio-api.service.ts`
- `src/app/core/audio-player.service.ts`

`main.ts` wurde erweitert, damit Angular `HttpClient` verwenden kann.

`AppComponent` gibt jetzt die aktuelle Lautstaerke an `GameComponent` weiter.

`GameComponent` wurde so angepasst, dass es:

- beim Start eine Backend-Runde anfragt,
- dynamische Slider aus den Backend-Filtern erzeugt,
- echte Preview-WAVs serverseitig rendern laesst,
- echte Audio-Dateien abspielt,
- den Score vom Backend abruft,
- bei nicht erreichbarer API weiterhin auf die alte Simulation zurueckfallen kann.

### 5. Waveform-Anzeige

`WaveGraphComponent` kann jetzt zwei Modi:

- alter Modus: synthetische Wellenform ueber `waveAt(...)`.
- neuer Modus: echte Waveform-Peaks aus dem Backend.

Damit sieht die Anzeige weiterhin im CRT-Stil aus, kann aber reale Audiodaten darstellen.

### 6. Manim-Dokumentation

Unter `docs/dial_in_manim.py` wurde eine neue Manim-Datei angelegt.

Sie enthaelt Szenen fuer:

- API-Pipeline: Upload -> FastAPI Round -> DSP Chain -> Preview -> Score.
- Filterkette: EQ4 -> Echo -> Distortion.
- Scoring: Parameter-Match plus Spektrum-Match.

Das dient als Basis fuer Abschlussdokumentation oder Praesentation.

## Gepruefte Befehle

Folgende Checks wurden erfolgreich ausgefuehrt:

```powershell
python -m pytest server
npm run build
python -m py_compile docs\dial_in_manim.py
```

Ergebnis:

- Backend-Tests: bestanden.
- Angular-Build: erfolgreich.
- Manim-Datei: syntaktisch gueltig.

## Lokale Demo

Gestartete URLs:

- Frontend: `http://localhost:4200`
- Backend Healthcheck: `http://localhost:8000/api/health`

Hinweis:
Der sichtbare Upload-Button im Angular-UI ist noch nicht eingebaut. Das Backend und der Angular-Service koennen Uploads bereits, aber die Spielrunde nutzt aktuell standardmaessig das generierte Demo-Signal.

## Technische Details: Vom Python-Prototyp zur API

### Ausgangspunkt: `audio_engine.py`

Der Python-Prototyp hatte bereits die wichtigsten DASP-Bausteine:

- WAV laden und auf Mono/44.1 kHz normalisieren.
- FIR-Filterbank fuer vier Frequenzbaender bauen.
- EQ ueber Faltung anwenden.
- Spektrum per FFT berechnen.
- Score ueber spektrale Differenz berechnen.

Beispiel aus `audio_engine.py`: FIR-Filterdesign per Windowed-Sinc.

```python
def _lp_fir(cutoff_norm: float, num_taps: int = NUM_TAPS) -> np.ndarray:
    """Lowpass FIR via windowed-sinc. cutoff_norm in (0, 0.5)."""
    M = num_taps - 1
    n = np.arange(num_taps, dtype=np.float64)
    h = 2.0 * cutoff_norm * np.sinc(2.0 * cutoff_norm * (n - M / 2.0))
    h *= np.blackman(num_taps)
    h /= h.sum()
    return h
```

Die Idee: Ein idealer Lowpass wird ueber die Sinc-Funktion angenaehert und mit einem Blackman-Fenster geglaettet. Dadurch entstehen FIR-Koeffizienten, die spaeter per Faltung auf das Signal angewendet werden.

Highpass und Bandpass entstehen daraus:

```python
def _hp_fir(cutoff_norm: float, num_taps: int = NUM_TAPS) -> np.ndarray:
    """Highpass via spectral inversion of lowpass."""
    h = _lp_fir(cutoff_norm, num_taps)
    h = -h
    h[num_taps // 2] += 1.0
    return h

def _bp_fir(low_norm: float, high_norm: float, num_taps: int = NUM_TAPS) -> np.ndarray:
    """Bandpass = LP(high) - LP(low)."""
    return _lp_fir(high_norm, num_taps) - _lp_fir(low_norm, num_taps)
```

Damit wird die 4-Band-Filterbank gebaut:

```python
def build_filters(sr: int = TARGET_SR, num_taps: int = NUM_TAPS) -> dict:
    """Pre-compute the 4-band FIR filter bank. Call once per sample rate."""
    return {
        'bass':     _lp_fir(300  / sr, num_taps),
        'low_mid':  _bp_fir(300  / sr, 1000 / sr, num_taps),
        'high_mid': _bp_fir(1000 / sr, 4000 / sr, num_taps),
        'treble':   _hp_fir(4000 / sr, num_taps),
    }
```

Im neuen Backend wurde dieses Konzept nach `server/app/dsp.py` uebertragen. Die Bandnamen wurden an das API/Frontend-Modell angepasst:

```python
BANDS = ("bass", "lowMid", "highMid", "treble")

def build_filters(sr: int = TARGET_SR) -> dict[str, np.ndarray]:
    return {
        "bass": _lp_fir(300 / sr),
        "lowMid": _bp_fir(300 / sr, 1000 / sr),
        "highMid": _bp_fir(1000 / sr, 4000 / sr),
        "treble": _hp_fir(4000 / sr),
    }
```

### EQ-Anwendung per Faltung

Im Prototyp:

```python
def apply_eq(signal: np.ndarray, gains_db: dict, filters: dict) -> np.ndarray:
    sig = signal.astype(np.float64)
    out = np.zeros(len(sig))
    for band, h in filters.items():
        gain = 10.0 ** (gains_db.get(band, 0.0) / 20.0)
        out += fftconvolve(sig, h, mode='same') * gain
    return out.astype(np.float32)
```

Technisch passiert hier:

1. Das Signal wird fuer jede Frequenzband-Kurve gefaltet.
2. Jedes Band wird mit einem dB-Gain skaliert.
3. Alle Baender werden wieder addiert.
4. Bei 0 dB auf allen Baendern ergibt die Filterbank ungefaehr wieder das Ursprungssignal.

Im neuen Backend:

```python
def apply_eq4(signal: np.ndarray, gains_db: dict[str, float]) -> np.ndarray:
    out = np.zeros(len(signal), dtype=np.float64)
    sig = signal.astype(np.float64)
    for band, h in FILTERS.items():
        gain = 10.0 ** (float(gains_db.get(band, 0.0)) / 20.0)
        out += fftconvolve(sig, h, mode="same") * gain
    return normalize(out)
```

Der Unterschied: Das Backend normalisiert das Ergebnis danach, damit Preview- und Target-WAVs nicht clippen.

### Neue Filter im Backend

Zusaetzlich zum EQ wurden zwei weitere Spiel-Filter umgesetzt.

Echo/Delay:

```python
def apply_echo(signal: np.ndarray, delay_ms: float, feedback: float, mix: float) -> np.ndarray:
    delay = max(1, int(TARGET_SR * delay_ms / 1000.0))
    fb = float(np.clip(feedback, 0.0, 0.85))
    wet_mix = float(np.clip(mix, 0.0, 0.8))
    wet = np.zeros(len(signal), dtype=np.float32)
    for i, sample in enumerate(signal.astype(np.float32)):
        delayed = wet[i - delay] * fb if i >= delay else 0.0
        wet[i] = sample + delayed
    return normalize(signal * (1.0 - wet_mix) + wet * wet_mix)
```

Distortion:

```python
def apply_distortion(signal: np.ndarray, drive: float, output_gain: float) -> np.ndarray:
    amount = 1.0 + float(np.clip(drive, 0.0, 1.0)) * 18.0
    shaped = np.tanh(signal.astype(np.float32) * amount) / np.tanh(amount)
    return normalize(shaped * float(np.clip(output_gain, 0.35, 1.2)))
```

Die Filter werden in einer festen Kette gerendert:

```python
def render_chain(source: np.ndarray, filters: list[dict[str, Any]]) -> np.ndarray:
    values = filter_values(filters)
    out = source.copy()
    if "eq4" in values:
        out = apply_eq4(out, values["eq4"])
    if "echo" in values:
        echo = values["echo"]
        out = apply_echo(out, echo.get("delayMs", 220), echo.get("feedback", 0.25), echo.get("mix", 0.25))
    if "distortion" in values:
        dist = values["distortion"]
        out = apply_distortion(out, dist.get("drive", 0.25), dist.get("outputGain", 0.75))
    return normalize(out)
```

Das ist wichtig fuer Angular: Das Frontend muss die DSP-Logik nicht kennen. Es sendet nur Filterparameter, und das Backend rendert daraus Audio.

### Score-Berechnung

Im Prototyp wurde der Score ueber Spektren berechnet:

```python
def compute_score(target: np.ndarray, player: np.ndarray,
                  sr: int = TARGET_SR) -> float:
    _, mag_t = compute_spectrum(target, sr)
    _, mag_p = compute_spectrum(player, sr)
    mag_t -= np.mean(mag_t)
    mag_p -= np.mean(mag_p)
    rms_diff   = np.sqrt(np.mean((mag_t - mag_p) ** 2))
    rms_target = np.sqrt(np.mean(mag_t ** 2)) + 1e-6
    return round(float(np.clip(100.0 * (1.0 - rms_diff / rms_target), 0.0, 100.0)), 1)
```

Im Backend wurde das Prinzip beibehalten und mit einem Parameter-Score kombiniert:

- Parameter-Score: Wie nah sind die Sliderwerte am versteckten Ziel?
- Spektrum-Score: Wie aehnlich ist das gerenderte Audiosignal dem Target im Frequenzbereich?
- Finaler Score: `65%` Parameter + `35%` Spektrum.

Das ist fuer das Spiel stabiler als reiner Audiovergleich, aber fachlich noch gut erklaerbar.

## Technische Details: Angular-Frontend

### API-Datenmodell

Angular bekommt keine festen Slider mehr aus `dial-model.ts`, sondern dynamische Filter vom Backend.

In `src/app/core/audio-model.ts`:

```ts
export type AudioFilterType = 'eq4' | 'echo' | 'distortion';

export interface AudioFilterParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string | null;
}

export interface AudioFilterConfig {
  id: string;
  type: AudioFilterType;
  label: string;
  params: AudioFilterParam[];
}
```

Eine Round enthaelt dann Zielparameter, Spielerparameter und Waveform-Daten:

```ts
export interface AudioRound {
  sessionId: string;
  fileId: string;
  difficulty: Difficulty;
  sourceUrl: string;
  targetUrl: string;
  previewUrl: string;
  targetFilters: AudioFilterConfig[];
  playerFilters: AudioFilterConfig[];
  waveform: {
    target?: WaveformPeaks;
    preview?: WaveformPeaks;
  };
}
```

### Angular API-Service

`src/app/core/audio-api.service.ts` kapselt die HTTP-Kommunikation:

```ts
createRound(difficulty: Difficulty, fileId?: string): Observable<AudioRound> {
  return this.http.post<AudioRound>(`${this.baseUrl}/api/rounds`, { difficulty, fileId: fileId || null });
}

renderPreview(sessionId: string, filters: AudioFilterConfig[]): Observable<PreviewResponse> {
  return this.http.post<PreviewResponse>(`${this.baseUrl}/api/rounds/${sessionId}/preview`, { filters });
}

score(sessionId: string, filters: AudioFilterConfig[]): Observable<ScoreResponse> {
  return this.http.post<ScoreResponse>(`${this.baseUrl}/api/rounds/${sessionId}/score`, { filters });
}
```

Damit bleibt `GameComponent` schlanker: Die Komponente muss nicht wissen, wie URLs gebaut oder Requests verschickt werden.

### Audio Playback

`src/app/core/audio-player.service.ts` nutzt native Browser-Audio-Objekte:

```ts
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
```

Dadurch spielt Angular echte WAV-Dateien aus dem Backend ab:

- Target beim Listen.
- Preview nach Slider-Anpassung.

### GameComponent: API-Round laden

Beim Start erzeugt `GameComponent` zuerst weiterhin eine alte Simulationsrunde als Fallback. Danach wird versucht, eine echte Backend-Runde zu laden:

```ts
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
```

Wichtig:

- Wenn die API laeuft, nutzt das Spiel echte Audiodaten.
- Wenn die API nicht laeuft, bleibt die alte Simulation spielbar.

### Dynamische Slider aus Backend-Filtern

Vorher gab es feste Sliderkeys wie `freq`, `amp`, `phase`, `harm`, `drive`.

Jetzt rendert Angular bei API-Rounds alle Filterparameter dynamisch:

```html
@if (audioRound) {
  @for (f of playerFilters; track f.id) {
    @for (p of f.params; track f.id + p.key) {
      <div class="slider">
        <div class="lab">
          <span>{{ codeForFilter(f) }} · {{ p.label }}</span>
          <b>{{ dispParam(p) }}</b>
        </div>
        <input
          type="range"
          class="focusable"
          [min]="p.min"
          [max]="p.max"
          [step]="p.step"
          [value]="p.value"
          (input)="setAudioParam(f, p, +$any($event.target).value)"
          [attr.aria-label]="p.label"
        />
      </div>
    }
  }
}
```

Die zugehoerige Update-Funktion ersetzt immutable den geaenderten Parameter:

```ts
setAudioParam(filter: AudioFilterConfig, param: AudioFilterParam, value: number): void {
  this.playerFilters = this.playerFilters.map((f) =>
    f.id === filter.id
      ? { ...f, params: f.params.map((p) => (p.key === param.key ? { ...p, value } : p)) }
      : f,
  );
}
```

### Preview-Rendering im Spiel

Wenn der Spieler Preview drueckt:

```ts
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
  this.api.renderPreview(this.audioRound.sessionId, this.playerFilters).subscribe({
    next: (res) => {
      this.previewPeaks = res.waveform;
      this.audio.play(this.api.absoluteUrl(res.previewUrl), this.volume, () => (this.playing = false));
    },
    error: () => {
      this.playing = false;
    },
  });
}
```

Ablauf:

1. Angular schickt aktuelle Sliderwerte an FastAPI.
2. FastAPI rendert daraus eine WAV-Datei.
3. FastAPI gibt `previewUrl` und neue Waveform-Peaks zurueck.
4. Angular spielt die Preview ab und zeichnet die neue Wellenform.

### Backend-Scoring im Spiel

Beim Submit:

```ts
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
```

Die UI zeigt danach:

- finalen Score,
- Parameterdetails,
- Abweichungen pro Filterparameter.

### WaveGraphComponent: echte Peaks statt synthetischer Welle

Vorher wurde die Welle ueber `waveAt(t, params)` generiert.

Jetzt kann die Komponente echte Peaks zeichnen:

```ts
@Input() playerPeaks?: WaveformPeaks | null;
@Input() targetPeaks?: WaveformPeaks | null;
```

Wenn Peak-Daten vorhanden sind, werden diese geplottet:

```ts
const drawPeaks = (peaks: WaveformPeaks, color: string, glow: number, alpha: number, dash?: number[]) => {
  const values = peaks.samples || [];
  if (values.length < 2) return;
  ctx.beginPath();
  for (let i = 0; i < values.length; i++) {
    const t = i / (values.length - 1);
    const px = padX + t * gx;
    const py = midY - values[i] * (gy / 2) * 0.86;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.strokeStyle = color;
  ctx.stroke();
};
```

Falls keine Peaks vorhanden sind, verwendet die Komponente weiterhin den alten Simulationsmodus. Dadurch bleibt das Frontend robust.

## Gesamt-Datenfluss

```text
Angular GameComponent
  -> AudioApiService.createRound(difficulty)
  -> FastAPI /api/rounds
  -> server/app/rounds.py erzeugt Ziel- und Spielerfilter
  -> server/app/dsp.py rendert Target- und Preview-WAV
  -> FastAPI gibt AudioRound + WaveformPeaks zurueck
  -> Angular erzeugt dynamische Slider
  -> Spieler veraendert Parameter
  -> AudioApiService.renderPreview(...)
  -> FastAPI rendert neue Preview-WAV
  -> Angular spielt WAV ab und zeichnet Peaks
  -> AudioApiService.score(...)
  -> FastAPI berechnet Parameter- und Spektrum-Score
  -> Angular zeigt Ergebnis und speichert Score lokal
```
