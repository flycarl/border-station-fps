import type { EntityId, Vec3 } from '../core/types';
import type { WeaponEvent } from '../weapons/weapon-system';

export type GameSound = 'footstep' | 'gunshot' | 'flesh-hit' | 'death';

export interface GameAudioBackend {
  unlock(): Promise<boolean>;
  setPaused(paused: boolean): void;
  play(sound: GameSound, distance: number): void;
  stopAll(): void;
  dispose(): void;
}

export interface GameAudioDiagnostics {
  unlocked: boolean;
  paused: boolean;
  events: {
    footsteps: number;
    gunshots: number;
    fleshHits: number;
    deaths: number;
  };
}

interface FootstepState {
  position: Vec3;
  distance: number;
}

const distanceBetween = (a: Vec3, b: Vec3): number => Math.hypot(
  a.x - b.x,
  a.y - b.y,
  a.z - b.z,
);

const planarDistance = (a: Vec3, b: Vec3): number => Math.hypot(
  a.x - b.x,
  a.z - b.z,
);

export class GameAudio {
  private readonly footsteps = new Map<EntityId, FootstepState>();
  private unlocked = false;
  private paused = false;
  private readonly eventCounts = {
    footsteps: 0,
    gunshots: 0,
    fleshHits: 0,
    deaths: 0,
  };

  constructor(
    private readonly backend: GameAudioBackend = new WebAudioBackend(),
    private readonly strideDistance = 1.2,
  ) {}

  async unlock(): Promise<void> {
    this.unlocked = await this.backend.unlock();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.backend.setPaused(paused);
  }

  updateFootstep(
    actorId: EntityId,
    position: Vec3,
    alive: boolean,
    grounded: boolean,
    listener: Vec3,
  ): boolean {
    const previous = this.footsteps.get(actorId);
    if (!previous) {
      this.footsteps.set(actorId, { position: { ...position }, distance: 0 });
      return false;
    }

    const travelled = planarDistance(previous.position, position);
    previous.position = { ...position };
    if (!alive || !grounded || travelled > 2.5) {
      previous.distance = 0;
      return false;
    }

    previous.distance += travelled;
    if (previous.distance < this.strideDistance) return false;
    previous.distance %= this.strideDistance;
    this.emit('footstep', distanceBetween(position, listener));
    return true;
  }

  playWeaponEvents(events: WeaponEvent[], listener: Vec3, shooterPosition: Vec3): void {
    for (const event of events) {
      if (event.type === 'shot') {
        this.emit('gunshot', distanceBetween(shooterPosition, listener));
      } else if (event.type === 'hit') {
        this.emit('flesh-hit', distanceBetween(event.point, listener));
      } else {
        this.emit('death', distanceBetween(event.point, listener));
      }
    }
  }

  resetRound(): void {
    this.footsteps.clear();
    this.backend.stopAll();
  }

  diagnostics(): GameAudioDiagnostics {
    return {
      unlocked: this.unlocked,
      paused: this.paused,
      events: { ...this.eventCounts },
    };
  }

  dispose(): void {
    this.footsteps.clear();
    this.backend.dispose();
  }

  private emit(sound: GameSound, distance: number): void {
    if (!this.unlocked || this.paused) return;
    this.backend.play(sound, distance);
    if (sound === 'footstep') this.eventCounts.footsteps++;
    if (sound === 'gunshot') this.eventCounts.gunshots++;
    if (sound === 'flesh-hit') this.eventCounts.fleshHits++;
    if (sound === 'death') this.eventCounts.deaths++;
  }
}

class WebAudioBackend implements GameAudioBackend {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private unlocked = false;
  private readonly sources = new Set<AudioScheduledSourceNode>();

  async unlock(): Promise<boolean> {
    if (!this.context) {
      const AudioContextClass = window.AudioContext;
      this.context = new AudioContextClass();
      this.output = this.context.createGain();
      this.output.gain.value = 0.62;
      this.output.connect(this.context.destination);
      this.noise = this.createNoiseBuffer(this.context);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    this.unlocked = this.context.state === 'running';
    return this.unlocked;
  }

  setPaused(paused: boolean): void {
    if (!this.context || !this.unlocked) return;
    if (paused && this.context.state === 'running') void this.context.suspend();
    if (!paused && this.context.state === 'suspended') void this.context.resume();
  }

  play(sound: GameSound, distance: number): void {
    const context = this.context;
    const output = this.output;
    if (!context || !output || context.state !== 'running') return;
    const attenuation = Math.max(0.08, 1 / (1 + Math.max(0, distance) * 0.075));
    if (sound === 'footstep') this.playFootstep(context, output, attenuation);
    if (sound === 'gunshot') this.playGunshot(context, output, attenuation);
    if (sound === 'flesh-hit') this.playFleshHit(context, output, attenuation);
    if (sound === 'death') this.playDeath(context, output, attenuation);
  }

  stopAll(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // The source already ended between iteration and stop.
      }
    }
    this.sources.clear();
  }

  dispose(): void {
    this.stopAll();
    if (this.context && this.context.state !== 'closed') void this.context.close();
    this.context = null;
    this.output = null;
    this.noise = null;
    this.unlocked = false;
  }

  private playFootstep(context: AudioContext, output: AudioNode, attenuation: number): void {
    const now = context.currentTime;
    this.filteredNoise(
      context,
      output,
      now,
      0.18,
      1_450 + Math.random() * 420,
      0.052 * attenuation,
    );
    this.filteredNoise(
      context,
      output,
      now + 0.025,
      0.14,
      3_100 + Math.random() * 650,
      0.025 * attenuation,
    );
  }

  private playGunshot(context: AudioContext, output: AudioNode, attenuation: number): void {
    const now = context.currentTime;
    this.noiseBurst(context, output, now, 0.19, 2_200, 0.34 * attenuation);
    this.tone(context, output, now, 0.16, 115, 48, 'triangle', 0.3 * attenuation);
  }

  private playFleshHit(context: AudioContext, output: AudioNode, attenuation: number): void {
    const now = context.currentTime;
    this.noiseBurst(context, output, now, 0.13, 560, 0.2 * attenuation);
    this.tone(context, output, now, 0.11, 145, 72, 'sine', 0.18 * attenuation);
  }

  private playDeath(context: AudioContext, output: AudioNode, attenuation: number): void {
    const now = context.currentTime;
    this.tone(context, output, now, 0.62, 210, 72, 'sawtooth', 0.13 * attenuation);
    this.tone(context, output, now + 0.04, 0.56, 156, 58, 'triangle', 0.14 * attenuation);
    this.noiseBurst(context, output, now + 0.12, 0.42, 430, 0.075 * attenuation);
  }

  private noiseBurst(
    context: AudioContext,
    output: AudioNode,
    start: number,
    duration: number,
    frequency: number,
    volume: number,
  ): void {
    if (!this.noise) return;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noise;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(Math.max(0.0001, volume), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(output);
    this.track(source);
    source.start(start);
    source.stop(start + duration);
  }

  private filteredNoise(
    context: AudioContext,
    output: AudioNode,
    start: number,
    duration: number,
    frequency: number,
    volume: number,
  ): void {
    if (!this.noise) return;
    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = this.noise;
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(520, start);
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), start + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(highpass).connect(lowpass).connect(gain).connect(output);
    this.track(source);
    source.start(start);
    source.stop(start + duration);
  }

  private tone(
    context: AudioContext,
    output: AudioNode,
    start: number,
    duration: number,
    fromFrequency: number,
    toFrequency: number,
    type: OscillatorType,
    volume: number,
  ): void {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(fromFrequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(toFrequency, start + duration);
    gain.gain.setValueAtTime(Math.max(0.0001, volume), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain).connect(output);
    this.track(oscillator);
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  private track(source: AudioScheduledSourceNode): void {
    this.sources.add(source);
    source.addEventListener('ended', () => this.sources.delete(source), { once: true });
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index++) {
      channel[index] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}
