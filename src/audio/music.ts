import { midiToFreq, noise, tone, type Synth } from './synth';

export type Track = 'menu' | 'run';

export interface Song {
  bpm: number;
  /** Schedules everything that sounds on 16th-note `step`, starting at time `t`. */
  step(s: Synth, step: number, t: number, sixteenth: number): void;
}

// --- Instruments ------------------------------------------------------------

function kick(s: Synth, t: number, gain = 0.7) {
  tone(s, { type: 'sine', freq: 150, to: 42, at: t, duration: 0.22, gain });
}

function clap(s: Synth, t: number, gain = 0.3) {
  noise(s, { filter: 'bandpass', freq: 1500, q: 0.8, at: t, duration: 0.14, gain });
}

function hat(s: Synth, t: number, open = false, gain = 0.1) {
  noise(s, { filter: 'highpass', freq: 7500, at: t, duration: open ? 0.14 : 0.04, gain });
}

function bass(s: Synth, t: number, midi: number, length: number, gain = 0.28) {
  tone(s, { type: 'sawtooth', freq: midiToFreq(midi), at: t, duration: length, gain, lowpass: 520 });
  tone(s, { type: 'sine', freq: midiToFreq(midi - 12), at: t, duration: length, gain: gain * 0.8 });
}

function pluck(s: Synth, t: number, midi: number, length: number, gain = 0.07, type: OscillatorType = 'square') {
  tone(s, { type, freq: midiToFreq(midi), at: t, duration: length, gain, lowpass: 2400 });
}

function pad(s: Synth, t: number, chord: number[], length: number, gain = 0.035) {
  for (const midi of chord) {
    for (const detune of [-8, 8]) {
      tone(s, { type: 'sawtooth', freq: midiToFreq(midi), detune, at: t, attack: length * 0.3, duration: length, gain, lowpass: 1100 });
    }
  }
}

// --- Songs ------------------------------------------------------------------

// Upbeat run music: Am – F – C – G that builds up over 16 bars, then loops.
const RUN_CHORDS = [
  { root: 33, tones: [69, 72, 76] },
  { root: 29, tones: [65, 69, 72] },
  { root: 36, tones: [64, 67, 72] },
  { root: 31, tones: [62, 67, 71] },
];
const RUN_ARP = [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 4, 3, 2, 1];

const run: Song = {
  bpm: 128,
  step(s, step, t, sixteenth) {
    const bar = Math.floor(step / 16);
    const i = step % 16;
    const chord = RUN_CHORDS[bar % 4];
    const section = Math.floor(bar / 4) % 4; // 0 drums+bass, 1 +arp, 2 +pad+clap, 3 all, arp up an octave

    if (i % 4 === 0) kick(s, t);
    if (section >= 2 && (i === 4 || i === 12)) clap(s, t);
    if (i % 2 === 1) hat(s, t, i % 4 === 2, 0.06);
    if (i % 4 === 2) hat(s, t, true, 0.08);
    if (i % 2 === 0) bass(s, t, chord.root + (i % 4 === 2 ? 12 : 0), sixteenth * 1.6);

    if (section >= 1) {
      const [a, b, c] = chord.tones;
      const arp = [a, b, c, a + 12, b + 12][RUN_ARP[i]] + (section === 3 ? 12 : 0);
      pluck(s, t, arp, sixteenth * 1.5, section === 3 ? 0.05 : 0.06);
    }
    if (section >= 2 && i === 0) pad(s, t, chord.tones.map((m) => m - 12), sixteenth * 16);
  },
};

// Calm menu music: Fmaj7 – Em7 – Dm7 – Cmaj7 with soft pads and a plucked arpeggio.
const MENU_CHORDS = [
  { root: 41, tones: [65, 69, 72, 76] },
  { root: 40, tones: [64, 67, 71, 74] },
  { root: 38, tones: [62, 65, 69, 72] },
  { root: 36, tones: [60, 64, 67, 71] },
];
const MENU_ARP = [0, 2, 1, 3, 2, 1, 3, 2];

const menu: Song = {
  bpm: 92,
  step(s, step, t, sixteenth) {
    const bar = Math.floor(step / 16);
    const i = step % 16;
    const chord = MENU_CHORDS[bar % 4];

    if (i === 0) {
      pad(s, t, chord.tones, sixteenth * 16, 0.025);
      tone(s, { type: 'sine', freq: midiToFreq(chord.root), at: t, attack: 0.05, duration: sixteenth * 15, gain: 0.25 });
      kick(s, t, 0.35);
    }
    if (i === 10) kick(s, t, 0.25);
    if (i % 4 === 2) hat(s, t, false, 0.04);
    if (i % 2 === 0) pluck(s, t, chord.tones[MENU_ARP[i / 2]] + 12, sixteenth * 3, 0.07, 'triangle');
  },
};

export const SONGS: Record<Track, Song> = { menu, run };

const LOOKAHEAD = 0.12; // seconds of music scheduled ahead of time
const FADE = 0.6;

/**
 * Plays a song by scheduling notes slightly ahead of the audio clock, so
 * timing stays tight even if a frame is late. Switching tracks crossfades.
 */
export class Music {
  private track: Track | null = null;
  private bus: GainNode | null = null;
  private step = 0;
  private nextTime = 0;

  constructor(private readonly synth: Synth) {
    setInterval(this.schedule, 25);
  }

  play(track: Track | null) {
    if (track === this.track) return;
    const { ctx, out } = this.synth;
    const now = ctx.currentTime;
    if (this.bus) {
      const old = this.bus;
      old.gain.setTargetAtTime(0, now, FADE / 4);
      setTimeout(() => old.disconnect(), FADE * 2000);
    }
    this.track = track;
    this.bus = null;
    if (!track) return;

    this.bus = ctx.createGain();
    this.bus.gain.setValueAtTime(0, now);
    this.bus.gain.linearRampToValueAtTime(1, now + FADE / 2);
    this.bus.connect(out);
    this.step = 0;
    this.nextTime = now + 0.05;
  }

  private schedule = () => {
    if (!this.track || !this.bus) return;
    const { ctx } = this.synth;
    const song = SONGS[this.track];
    const sixteenth = 60 / song.bpm / 4;
    // After a long stall (e.g. the tab was throttled), skip ahead instead of
    // firing a burst of stale notes.
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
    const s = { ...this.synth, out: this.bus };
    while (this.nextTime < ctx.currentTime + LOOKAHEAD) {
      song.step(s, this.step, this.nextTime, sixteenth);
      this.nextTime += sixteenth;
      this.step++;
    }
  };
}
