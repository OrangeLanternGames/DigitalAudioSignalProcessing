# Technische Uebersicht: DIAL IN

## Kurzbeschreibung

`DIAL IN` ist aktuell eine Angular-Standalone-App im Stil eines 90er-CRT-Audio-Puzzle-Terminals. Der Spieler hoert bzw. sieht ein "Originalsignal", danach wird das Signal manipuliert und der Spieler versucht die Parameter per Slider wieder an das Original anzugleichen.

Wichtig: Im aktuellen Stand wird noch keine echte Audiodatei veraendert. Die Audio-Logik ist bisher eine mathematische Simulation im Frontend. Die Wellenform wird per Canvas gezeichnet, und die "Play"-Aktionen steuern aktuell nur UI-Zustand und Animation.

Ziel fuer die naechste Ausbaustufe: Eine echte Audiodatei soll durch ein Backend mit 4-6 Filtern manipuliert werden, z. B. Echo, Reverb, Filter/EQ, Distortion, Pitch/Tempo oder Bitcrusher. Das Frontend kann dann Original und manipulierte Version abspielen und die vorhandenen Slider zur Rekonstruktion nutzen.

## Tech Stack

- Frontend: Angular 21 Standalone Components
- Styling: globales CSS in `src/styles.css`
- Animation: `animejs`
- 3D/Globe: `three`
- Persistenz im Frontend: `localStorage`
- Build/Dev Server: Angular CLI
- Paketmanager: npm

Start:

```powershell
npm install
npm start
```

Browser:

```text
http://localhost:4200
```

## Projektstruktur

```text
src/
  index.html
  main.ts
  styles.css
  app/
    app.component.ts
    core/
      dial-model.ts
      storage.service.ts
      util.ts
    components/
      boot.component.ts
      landing.component.ts
      difficulty.component.ts
      game.component.ts
      wave-graph.component.ts
      calc-log.component.ts
      chrome.component.ts
      globe.component.ts
    ui/
      bars.component.ts
      clock.component.ts
      glyphs.component.ts
      hex-stream.component.ts
      mini-scope.component.ts
      seg.component.ts
      telemetry.component.ts
```

## Wichtige Dateien

### `src/main.ts`

Startet die Angular-App mit `bootstrapApplication(AppComponent)`.

### `src/app/app.component.ts`

Zentrale Screen-Steuerung:

- `boot`
- `landing`
- `difficulty`
- `game`

Verwaltet ausserdem:

- Theme
- Volume
- Scoreboard
- gewaehlte Difficulty
- Screen-Transition per Sweep-Animation

### `src/app/core/dial-model.ts`

Enthaelt die aktuelle Spiel- und Signal-Simulation.

Aktuelle Parameter:

| Key | Label | Bedeutung aktuell |
| --- | --- | --- |
| `freq` | Frequency | Frequenz der simulierten Sinuswelle |
| `amp` | Amplitude | Lautstaerke/Amplitude der simulierten Welle |
| `phase` | Phase | Phasenverschiebung |
| `harm` | Harmonic | zusaetzliche Oberwelle |
| `drive` | Drive | Verzerrung per `tanh` |

Wichtige Funktionen:

- `makeRound(diff)`: erstellt Zielwerte und veraenderte Player-Werte
- `waveAt(t, p)`: berechnet einen Wellenwert fuer die Canvas-Darstellung
- `computeAccuracy(keys, player, target)`: berechnet Match-Prozent aus Slider-Abweichungen

### `src/app/components/game.component.ts`

Hauptspiel-Logik:

- Phasen: `listen`, `dial`, `reveal`, `sign`
- Zaehlt die 3 Original-Playbacks
- Startet die Manipulation
- Verwaltet Sliderwerte
- Berechnet Score
- Speichert den Score nach Eingabe des Namens

Aktuell fehlt hier echte Audio-Wiedergabe. `playing` wird nur fuer Animation und UI benutzt.

### `src/app/components/wave-graph.component.ts`

Zeichnet die simulierte Wellenform auf ein Canvas. Diese Komponente kann spaeter echte Waveform-Daten vom Backend bekommen, statt nur `waveAt(...)` zu verwenden.

### `src/app/core/storage.service.ts`

Kleine localStorage-Abstraktion fuer:

- `dialin.theme`
- `dialin.volume`
- `dialin.scores`

## Aktueller Spielablauf

1. App startet mit Bootscreen.
2. Landing Screen zeigt Play, Settings und Scoreboard.
3. Difficulty Screen waehlt `easy`, `medium` oder `hard`.
4. Game Screen erzeugt eine Runde mit `makeRound(difficulty)`.
5. Spieler darf Original 3-mal "abspielen".
6. Signal wird auf manipulierte Werte gesetzt.
7. Spieler stellt Slider nach Gehoer ein.
8. `computeAccuracy(...)` berechnet den Score.
9. Spieler traegt Callsign ein.
10. Score wird lokal gespeichert.

## Aktuelle Einschraenkung

Das Projekt sieht wie ein Audio-Tool aus, manipuliert aber noch keine Audiodatei.

Diese Teile sind aktuell simuliert:

- Original-Audio
- manipuliertes Audio
- Playback
- Filterkette
- Waveform-Vergleich
- DSP-Statuswerte

Die naechste technische Aufgabe ist also nicht nur "Filter hinzufuegen", sondern eine echte Audio-Pipeline zu definieren.

## Zielarchitektur fuer echte Audio-Manipulation

Empfohlene Aufteilung:

```text
Angular Frontend
  - UI
  - Difficulty-Auswahl
  - Slider
  - Audio-Player fuer Original/Manipuliert
  - Anzeige von Waveform/Score

Backend API
  - Datei-Upload oder Auswahl einer Beispiel-Audiodatei
  - Erzeugung einer zufaelligen Filterkette
  - Anwendung der Filter auf Audio
  - Rueckgabe von Session-ID, Filterparametern, Audio-URLs und Waveform-Daten

Audio Engine
  - FFmpeg oder eigene DSP-Library
  - erzeugt manipulierte Audiodatei
  - normalisiert Lautstaerke
  - exportiert WAV/MP3/OGG
```

## Vorgeschlagene Backend-Technologie

Naheliegend fuer dieses Projekt:

- Node.js + Express oder Fastify
- `multer` fuer Uploads
- FFmpeg fuer Audiofilter
- Optional: `fluent-ffmpeg` als Node Wrapper

Alternative:

- Python + FastAPI
- `pydub`, `librosa`, `soundfile` oder FFmpeg

Fuer ein Angular/npm-Projekt ist Node.js als Backend am einfachsten in einem gemeinsamen Repo zu betreiben.

## Filteranforderung: 4-6 Filter

Empfohlene Filter fuer das Spiel:

| Filter | Zweck | Typische Parameter | Slider im UI |
| --- | --- | --- | --- |
| Echo/Delay | Wiederholung des Signals | delay ms, feedback, mix | Echo |
| Reverb | Raum/Hall | room size, decay, wet mix | Reverb |
| Lowpass/Highpass/EQ | Frequenzbereich veraendern | cutoff Hz, resonance/Q, gain | Filter |
| Distortion/Drive | Verzerrung/Saettigung | drive amount, output gain | Drive |
| Pitch Shift | Tonhoehe veraendern | semitones/cents | Pitch |
| Bitcrusher | digitale Zerstoerung | bit depth, sample rate reduction | Crush |

Minimal fuer die Anforderung:

- Echo
- Reverb
- Filter/EQ
- Distortion

Besser fuer `hard`:

- Echo
- Reverb
- Filter/EQ
- Distortion
- Pitch Shift
- Bitcrusher

## Difficulty Mapping

Die vorhandene Difficulty-Logik kann auf echte Filter gemappt werden.

```text
easy:
  1 Filter
  z. B. Echo

medium:
  3 Filter
  z. B. Echo, Filter/EQ, Distortion

hard:
  5-6 Filter
  z. B. Echo, Reverb, Filter/EQ, Distortion, Pitch, Bitcrusher
```

Damit bleibt die existierende Spielidee erhalten: Mehr Difficulty bedeutet mehr Slider und mehr Filter in der Kette.

## Neue Datenmodelle

Vorschlag fuer neue Types im Frontend, z. B. in `src/app/core/audio-model.ts`:

```ts
export type AudioFilterType =
  | 'echo'
  | 'reverb'
  | 'eq'
  | 'distortion'
  | 'pitch'
  | 'bitcrusher';

export interface AudioFilterParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
}

export interface AudioFilterConfig {
  id: string;
  type: AudioFilterType;
  label: string;
  params: AudioFilterParam[];
}

export interface AudioRound {
  sessionId: string;
  difficulty: 'easy' | 'medium' | 'hard';
  originalUrl: string;
  manipulatedUrl: string;
  targetFilters: AudioFilterConfig[];
  playerFilters: AudioFilterConfig[];
  waveform?: {
    original: number[];
    manipulated: number[];
  };
}
```

## API-Vorschlag

### `POST /api/audio/upload`

Laedt eine Audiodatei hoch.

Request:

```text
multipart/form-data
file: audio file
```

Response:

```json
{
  "fileId": "aud_123",
  "filename": "sample.wav",
  "durationSec": 32.4,
  "sampleRate": 44100,
  "channels": 2
}
```

### `POST /api/rounds`

Erstellt eine neue Spielrunde und generiert eine manipulierte Audiodatei.

Request:

```json
{
  "fileId": "aud_123",
  "difficulty": "medium"
}
```

Response:

```json
{
  "sessionId": "round_456",
  "difficulty": "medium",
  "originalUrl": "/api/audio/aud_123/original",
  "manipulatedUrl": "/api/rounds/round_456/manipulated",
  "targetFilters": [
    {
      "id": "flt_echo",
      "type": "echo",
      "label": "Echo",
      "params": [
        { "key": "delayMs", "label": "Delay", "min": 80, "max": 650, "step": 1, "value": 280, "unit": "ms" },
        { "key": "feedback", "label": "Feedback", "min": 0, "max": 0.8, "step": 0.01, "value": 0.35 }
      ]
    }
  ],
  "playerFilters": [
    {
      "id": "flt_echo",
      "type": "echo",
      "label": "Echo",
      "params": [
        { "key": "delayMs", "label": "Delay", "min": 80, "max": 650, "step": 1, "value": 510, "unit": "ms" },
        { "key": "feedback", "label": "Feedback", "min": 0, "max": 0.8, "step": 0.01, "value": 0.12 }
      ]
    }
  ]
}
```

### `POST /api/rounds/:sessionId/render-preview`

Rendert die Audiodatei mit den aktuellen Sliderwerten des Spielers.

Request:

```json
{
  "filters": []
}
```

Response:

```json
{
  "previewUrl": "/api/rounds/round_456/previews/preview_001.wav",
  "waveform": [0.01, 0.04, -0.02]
}
```

### `POST /api/rounds/:sessionId/score`

Berechnet den Score serverseitig aus Zielparametern und Spielerparametern.

Request:

```json
{
  "filters": []
}
```

Response:

```json
{
  "score": 87.4,
  "details": [
    { "filter": "echo", "param": "delayMs", "accuracy": 0.91 },
    { "filter": "distortion", "param": "drive", "accuracy": 0.82 }
  ]
}
```

## Audio-Pipeline im Backend

Vorschlag:

1. Upload speichern, z. B. `server/storage/uploads`.
2. Audiodatei validieren:
   - erlaubte Typen: WAV, MP3, OGG, FLAC
   - maximale Laenge, z. B. 60 Sekunden
   - maximale Dateigroesse, z. B. 20 MB
3. Intern nach WAV normalisieren:
   - 44.1 kHz
   - stereo oder mono
   - konstante Lautstaerke
4. Filterkette je Difficulty erzeugen.
5. Manipulierte Datei rendern.
6. URLs und Zielparameter an Frontend geben.
7. Bei Preview Spielerfilter rendern.
8. Beim Submit Score berechnen.

## FFmpeg-Filterideen

Moegliche Umsetzung mit FFmpeg:

| Effekt | FFmpeg Filter |
| --- | --- |
| Echo | `aecho` |
| Reverb | `afir` mit Impulsantwort oder vereinfachter Hall ueber Echo-Kette |
| EQ/Filter | `lowpass`, `highpass`, `equalizer` |
| Distortion | `acrusher`, `acompressor`, `volume`, ggf. Waveshaping extern |
| Pitch | `asetrate`, `aresample`, `atempo` |
| Bitcrusher | `acrusher` |

Beispiel einer einfachen Filterkette:

```text
aecho=0.8:0.35:280:0.35,
lowpass=f=3200,
acrusher=bits=10:mode=log
```

## Frontend-Integration

Neue Services:

```text
src/app/core/audio-api.service.ts
src/app/core/audio-player.service.ts
src/app/core/audio-model.ts
```

Aufgaben:

- `AudioApiService`
  - Upload
  - Runde erstellen
  - Preview rendern
  - Score submitten

- `AudioPlayerService`
  - Original abspielen
  - manipulierte Datei abspielen
  - Preview abspielen
  - Volume aus `AppComponent` verwenden

- `audio-model.ts`
  - gemeinsame Types fuer Filter, Runden und Scores

Anpassungen in `GameComponent`:

- `makeRound(...)` durch API-Aufruf ersetzen oder optional parallel behalten.
- `round.target` wird zu `targetFilters`.
- `player` wird zu `playerFilters`.
- Slider werden dynamisch aus Filterparametern generiert.
- `doListen()` spielt `originalUrl`.
- `doManipulate()` setzt `manipulatedUrl` und startet `dial`.
- `preview()` rendert oder spielt aktuelle Preview.
- `submit()` ruft Backend-Scoring auf.

## Scoring

Der aktuelle Score berechnet nur lineare Parameterabweichungen. Fuer echte Filter sollte das Backend weiterhin parameterbasiert scoren, weil Audiovergleich allein schwer und fehleranfaellig ist.

Empfohlen:

```text
score pro Parameter = 1 - normalizedError
score pro Filter = Durchschnitt seiner Parameter
final score = gewichteter Durchschnitt aller Filter
```

Beispiel Gewichtung:

| Filter | Gewicht |
| --- | --- |
| Echo | 1.0 |
| Reverb | 1.0 |
| EQ/Filter | 1.2 |
| Distortion | 0.9 |
| Pitch | 1.2 |
| Bitcrusher | 0.8 |

Parameter mit zyklischen Bereichen, z. B. Phase, muessen gesondert behandelt werden. Bei den vorgeschlagenen echten Filtern ist das meistens nicht noetig.

## Waveform-Daten

Aktuell zeichnet `WaveGraphComponent` eine synthetische Welle. Fuer echte Audiofiles gibt es zwei sinnvolle Optionen:

1. Backend berechnet reduzierte Peaks und gibt Arrays zurueck.
2. Frontend decodiert Audio per Web Audio API und berechnet Peaks selbst.

Empfohlene Peak-Struktur:

```ts
export interface WaveformPeaks {
  samples: number[];
  sampleRate: number;
  durationSec: number;
}
```

Fuer die UI reichen 512 bis 2048 Peak-Werte.

## Offene Aufgaben

- Backend-Projekt anlegen, z. B. `server/`.
- Upload-Endpunkt bauen.
- FFmpeg lokal verfuegbar machen und dokumentieren.
- Filtermodell finalisieren.
- Angular-Service fuer API-Kommunikation ergaenzen.
- `GameComponent` von simulierten Parametern auf echte Filterparameter umstellen.
- Echte Audio-Controls integrieren.
- Preview-Rendering cachen, damit Slider nicht bei jeder kleinen Bewegung sofort rendern.
- Waveform-Anzeige auf echte Audiodaten erweitern.
- Score weiterhin stabil und nachvollziehbar berechnen.

## Empfohlener naechster Schritt

Als erster kleiner Implementierungsschritt bietet sich ein Backend-Prototyp mit nur 1 Datei und 2 Filtern an:

1. `POST /api/audio/upload`
2. `POST /api/rounds` mit Echo und Distortion
3. Rueckgabe einer manipulierten WAV-Datei
4. Angular spielt Original und Manipulation wirklich ab

Wenn das funktioniert, koennen Reverb, EQ, Pitch und Bitcrusher ergaenzt werden.
