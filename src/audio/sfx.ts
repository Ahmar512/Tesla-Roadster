import { midiToFreq, noise, tone, type Synth } from './synth';

// Major pentatonic steps: cell chimes climb this scale during a streak.
const PENTATONIC = [0, 2, 4, 7, 9];
const CHIME_BASE = 76; // E5

/** One-shot sound effects. `arg` is sound-specific (e.g. the cell streak). */
export const SOUNDS = {
  click(s: Synth) {
    tone(s, { type: 'triangle', freq: 1400, to: 900, duration: 0.06, gain: 0.4 });
  },

  /** Thruster whoosh: a rising burst of air plus a low kick. */
  jump(s: Synth) {
    noise(s, { filter: 'bandpass', freq: 500, to: 2600, q: 1.2, duration: 0.35, attack: 0.02, gain: 0.7 });
    tone(s, { type: 'sine', freq: 90, to: 160, duration: 0.18, gain: 0.35 });
  },

  land(s: Synth) {
    tone(s, { type: 'sine', freq: 140, to: 45, duration: 0.2, gain: 0.6 });
    noise(s, { filter: 'lowpass', freq: 900, to: 200, duration: 0.15, gain: 0.35 });
  },

  laneChange(s: Synth) {
    noise(s, { filter: 'bandpass', freq: 1800, to: 700, q: 2, duration: 0.18, attack: 0.03, gain: 0.45 });
  },

  /** Traffic rushing past: a quick doppler-ish swoosh. */
  nearMiss(s: Synth) {
    noise(s, { filter: 'bandpass', freq: 3000, to: 500, q: 3, duration: 0.4, attack: 0.08, gain: 0.45 });
    tone(s, { type: 'sine', freq: 1568, duration: 0.25, gain: 0.08, at: s.ctx.currentTime + 0.12 });
  },

  /** Bell chime; `streak` raises the pitch along the pentatonic scale. */
  cell(s: Synth, streak = 0) {
    const step = Math.min(streak, 14);
    const midi = CHIME_BASE + 12 * Math.floor(step / 5) + PENTATONIC[step % 5];
    const f = midiToFreq(midi);
    tone(s, { type: 'sine', freq: f, duration: 0.3, gain: 0.4 });
    tone(s, { type: 'sine', freq: f * 2.76, duration: 0.12, gain: 0.1 });
  },

  powerUp(s: Synth) {
    const t = s.ctx.currentTime;
    [60, 64, 67, 72, 76].forEach((m, i) =>
      tone(s, { type: 'square', freq: midiToFreq(m + 12), at: t + i * 0.055, duration: 0.16, gain: 0.09, lowpass: 3000 }),
    );
    noise(s, { filter: 'highpass', freq: 3000, to: 8000, duration: 0.4, attack: 0.05, gain: 0.12 });
  },

  powerDown(s: Synth) {
    const t = s.ctx.currentTime;
    [76, 71, 67, 60].forEach((m, i) =>
      tone(s, { type: 'triangle', freq: midiToFreq(m), at: t + i * 0.07, duration: 0.18, gain: 0.16 }),
    );
  },

  shieldBreak(s: Synth) {
    const t = s.ctx.currentTime;
    noise(s, { filter: 'highpass', freq: 2500, duration: 0.5, gain: 0.4 });
    for (const f of [2093, 2637, 3136]) tone(s, { type: 'sine', freq: f, to: f * 0.7, at: t + Math.random() * 0.05, duration: 0.45, gain: 0.07 });
  },

  /** Nitro ramming a car out of the way. */
  smash(s: Synth) {
    tone(s, { type: 'sine', freq: 110, to: 40, duration: 0.25, gain: 0.6 });
    noise(s, { filter: 'bandpass', freq: 1200, to: 300, q: 0.8, duration: 0.3, gain: 0.5 });
    tone(s, { type: 'square', freq: 520, to: 380, duration: 0.18, gain: 0.06, lowpass: 2000 });
  },

  stumble(s: Synth) {
    tone(s, { type: 'sine', freq: 120, to: 60, duration: 0.18, gain: 0.5 });
    noise(s, { filter: 'bandpass', freq: 1500, to: 600, duration: 0.2, gain: 0.35 });
    tone(s, { type: 'square', freq: 700, to: 500, duration: 0.12, gain: 0.05, lowpass: 2500 });
  },

  crash(s: Synth) {
    const t = s.ctx.currentTime;
    tone(s, { type: 'sine', freq: 90, to: 28, duration: 0.8, gain: 0.8 });
    noise(s, { filter: 'lowpass', freq: 4000, to: 150, duration: 1.1, gain: 0.7 });
    // Metal clanks and glass.
    for (let i = 0; i < 4; i++) {
      const f = 300 + Math.random() * 500;
      tone(s, { type: 'square', freq: f, to: f * 0.8, at: t + 0.05 + i * 0.09, duration: 0.15, gain: 0.05, lowpass: 2200 });
    }
    noise(s, { filter: 'highpass', freq: 5000, at: t + 0.06, duration: 0.5, gain: 0.18 });
  },

  /** Countdown beep; arg 0 is the higher "go" beep. */
  beep(s: Synth, n = 1) {
    tone(s, { type: 'square', freq: n > 0 ? 660 : 1320, duration: n > 0 ? 0.15 : 0.35, gain: 0.25, lowpass: 3000 });
  },

  /** Gentle cue when a tutorial prompt appears. */
  prompt(s: Synth) {
    const t = s.ctx.currentTime;
    tone(s, { type: 'triangle', freq: midiToFreq(79), duration: 0.18, gain: 0.15 });
    tone(s, { type: 'triangle', freq: midiToFreq(84), at: t + 0.09, duration: 0.25, gain: 0.15 });
  },

  newBest(s: Synth) {
    const t = s.ctx.currentTime;
    const notes = [67, 72, 76, 79, 84];
    notes.forEach((m, i) => {
      const last = i === notes.length - 1;
      tone(s, { type: 'square', freq: midiToFreq(m), at: t + i * 0.1, duration: last ? 0.7 : 0.14, gain: 0.08, lowpass: 3500 });
      tone(s, { type: 'triangle', freq: midiToFreq(m - 12), at: t + i * 0.1, duration: last ? 0.7 : 0.14, gain: 0.12 });
    });
  },
} satisfies Record<string, (s: Synth, arg?: number) => void>;

export type SoundName = keyof typeof SOUNDS;
