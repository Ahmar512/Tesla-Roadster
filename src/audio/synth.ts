// Tiny Web Audio building blocks shared by the sound effects and the music.
// Everything is synthesized at runtime, so the game needs no audio files.

export interface Synth {
  ctx: AudioContext;
  out: AudioNode;
  noise: AudioBuffer;
}

export interface ToneOptions {
  type?: OscillatorType;
  freq: number;
  /** Glide to this frequency over the note. */
  to?: number;
  at?: number;
  attack?: number;
  /** Seconds from start until the sound has faded out. */
  duration: number;
  gain?: number;
  lowpass?: number;
  detune?: number;
}

export interface NoiseOptions {
  filter: BiquadFilterType;
  freq: number;
  /** Sweep the filter to this frequency over the sound. */
  to?: number;
  q?: number;
  at?: number;
  attack?: number;
  duration: number;
  gain?: number;
}

export const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

/** Two seconds of white noise, reused by every noisy sound. */
export function createNoise(ctx: AudioContext) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Quick attack, exponential decay to silence. */
function envelope(param: AudioParam, t: number, attack: number, duration: number, peak: number) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + Math.max(duration, attack + 0.01));
}

export function tone(s: Synth, o: ToneOptions, dest: AudioNode = s.out) {
  const { ctx } = s;
  const t = o.at ?? ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? 'sine';
  osc.frequency.setValueAtTime(o.freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.duration);
  if (o.detune) osc.detune.value = o.detune;

  const gain = ctx.createGain();
  envelope(gain.gain, t, o.attack ?? 0.005, o.duration, o.gain ?? 0.3);
  let node: AudioNode = osc;
  if (o.lowpass) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = o.lowpass;
    node = node.connect(filter);
  }
  node.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + o.duration + 0.05);
}

export function noise(s: Synth, o: NoiseOptions, dest: AudioNode = s.out) {
  const { ctx } = s;
  const t = o.at ?? ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = s.noise;

  const filter = ctx.createBiquadFilter();
  filter.type = o.filter;
  filter.frequency.setValueAtTime(o.freq, t);
  if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t + o.duration);
  filter.Q.value = o.q ?? 1;

  const gain = ctx.createGain();
  envelope(gain.gain, t, o.attack ?? 0.005, o.duration, o.gain ?? 0.3);
  src.connect(filter).connect(gain).connect(dest);
  // Start somewhere random in the buffer so repeated hits don't sound identical.
  src.start(t, Math.random() * 1.5);
  src.stop(t + o.duration + 0.05);
}
