import { Music, type Track } from './music';
import { SOUNDS, type SoundName } from './sfx';
import { createNoise, type Synth } from './synth';

const MUSIC_LEVEL = 0.5; // music sits under the effects
const DUCKED = 0.35; // music level while paused
const SMOOTH = 0.08; // seconds for loop volumes/pitches to glide

/**
 * All game audio: music, one-shot effects and two continuous loops (the
 * electric motor and the police siren). The AudioContext can only start
 * after a user gesture, so until then every call is a silent no-op and the
 * requested music starts on the first tap or key press.
 */
export class AudioEngine {
  private ctx?: AudioContext;
  private synth?: Synth;
  private music?: Music;
  private musicGain?: GainNode;
  private sfxGain?: GainNode;
  private duckGain?: GainNode;
  private motor?: { gain: GainNode; whine: OscillatorNode; harmonic: OscillatorNode; filter: BiquadFilterNode };
  private siren?: GainNode;
  private rotor?: GainNode;
  private track: Track | null = null;
  private ducked = false;
  private volumes = { music: 1, sfx: 1 };

  constructor() {
    const unlock = () => {
      this.start();
      if (this.ctx?.state === 'running') {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
        window.removeEventListener('touchend', unlock);
      }
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchend', unlock);
  }

  /** 0..1 each, from the settings sliders. */
  setVolumes(music: number, sfx: number) {
    this.volumes = { music, sfx };
    if (!this.ctx) return;
    // Squared, so the sliders feel even to the ear.
    this.musicGain!.gain.setTargetAtTime(music * music * MUSIC_LEVEL, this.ctx.currentTime, SMOOTH);
    this.sfxGain!.gain.setTargetAtTime(sfx * sfx, this.ctx.currentTime, SMOOTH);
  }

  setMusic(track: Track | null) {
    this.track = track;
    this.music?.play(track);
  }

  /** Lowers the music (pause menu). */
  setDucked(ducked: boolean) {
    this.ducked = ducked;
    this.duckGain?.gain.setTargetAtTime(ducked ? DUCKED : 1, this.ctx!.currentTime, SMOOTH);
  }

  /** Stops all sound while the app is in the background. */
  setBackground(hidden: boolean) {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  play(name: SoundName, arg?: number) {
    if (this.synth && this.ctx!.state === 'running') SOUNDS[name](this.synth, arg);
  }

  /**
   * Electric motor whine. `level` 0..1 is its loudness (0 = off), `speed` in
   * m/s sets the pitch, and `boost` (nitro) pushes it higher.
   */
  setMotor(level: number, speed: number, boost = false) {
    if (!this.motor) return;
    const t = this.ctx!.currentTime;
    const f = (70 + speed * 7) * (boost ? 1.3 : 1);
    this.motor.whine.frequency.setTargetAtTime(f, t, SMOOTH);
    this.motor.harmonic.frequency.setTargetAtTime(f * 2.01, t, SMOOTH);
    this.motor.filter.frequency.setTargetAtTime(600 + f * 3, t, SMOOTH);
    this.motor.gain.gain.setTargetAtTime(level * 0.07, t, SMOOTH * 2);
  }

  /** Helicopter rotor thump, 0 (off) to 1 (overhead). */
  setRotor(level: number) {
    this.rotor?.gain.setTargetAtTime(level * 0.35, this.ctx!.currentTime, 0.2);
  }

  setSiren(on: boolean) {
    this.siren?.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx!.currentTime, 0.15);
  }

  private start() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    void ctx.resume();

    const compressor = ctx.createDynamicsCompressor(); // keeps big moments from clipping
    compressor.connect(ctx.destination);
    this.sfxGain = ctx.createGain();
    this.sfxGain.connect(compressor);
    this.musicGain = ctx.createGain();
    this.duckGain = ctx.createGain();
    this.musicGain.connect(this.duckGain).connect(compressor);

    const noise = createNoise(ctx);
    this.synth = { ctx, out: this.sfxGain, noise };
    this.music = new Music({ ctx, out: this.musicGain, noise });
    this.createLoops(ctx);

    this.setVolumes(this.volumes.music, this.volumes.sfx);
    this.setDucked(this.ducked);
    this.music.play(this.track);
  }

  private createLoops(ctx: AudioContext) {
    // Motor: a sawtooth whine plus a soft harmonic, gently wobbling.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 4;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    filter.connect(gain).connect(this.sfxGain!);
    const whine = ctx.createOscillator();
    whine.type = 'sawtooth';
    const harmonic = ctx.createOscillator();
    harmonic.type = 'sine';
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 6;
    const wobbleDepth = ctx.createGain();
    wobbleDepth.gain.value = 4;
    wobble.connect(wobbleDepth);
    wobbleDepth.connect(whine.detune);
    whine.connect(filter);
    harmonic.connect(filter);
    for (const osc of [whine, harmonic, wobble]) osc.start();
    this.motor = { gain, whine, harmonic, filter };

    // Siren: the classic wail, a tone sweeping up and down.
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    const sirenFilter = ctx.createBiquadFilter();
    sirenFilter.type = 'lowpass';
    sirenFilter.frequency.value = 2200;
    sirenFilter.connect(sirenGain).connect(this.sfxGain!);
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 950;
    const sweep = ctx.createOscillator();
    sweep.frequency.value = 0.45;
    const sweepDepth = ctx.createGain();
    sweepDepth.gain.value = 320;
    sweep.connect(sweepDepth).connect(osc.frequency);
    osc.connect(sirenFilter);
    osc.start();
    sweep.start();
    this.siren = sirenGain;

    // Rotor: low noise chopped by a ~13 Hz pulse, the "wop-wop" of the blades.
    const rotorNoise = ctx.createBufferSource();
    rotorNoise.buffer = this.synth!.noise;
    rotorNoise.loop = true;
    const rotorFilter = ctx.createBiquadFilter();
    rotorFilter.type = 'lowpass';
    rotorFilter.frequency.value = 320;
    const chop = ctx.createGain();
    chop.gain.value = 0.5;
    const chopper = ctx.createOscillator();
    chopper.type = 'sine';
    chopper.frequency.value = 13;
    const chopDepth = ctx.createGain();
    chopDepth.gain.value = 0.5;
    chopper.connect(chopDepth).connect(chop.gain);
    const rotorGain = ctx.createGain();
    rotorGain.gain.value = 0;
    rotorNoise.connect(rotorFilter).connect(chop).connect(rotorGain).connect(this.sfxGain!);
    rotorNoise.start();
    chopper.start();
    this.rotor = rotorGain;
  }
}
