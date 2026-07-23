import type { EntityId, Vec3 } from '../core/types';
import type { SoundDirectionCue } from '../ui/hud';

interface ActiveSound {
  sourceId: EntityId;
  position: Vec3;
  strength: number;
  remaining: number;
  lifetime: number;
  maxDistance: number;
}

export interface SoundEmission {
  sourceId: EntityId;
  position: Vec3;
  strength: number;
  lifetime: number;
  maxDistance: number;
}

const wrapAngle = (angle: number): number => {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
};

export class SoundAwarenessSystem {
  private readonly sounds = new Map<EntityId, ActiveSound>();

  emit(emission: SoundEmission): void {
    this.sounds.set(emission.sourceId, {
      ...emission,
      position: { ...emission.position },
      remaining: emission.lifetime,
    });
  }

  update(dt: number): void {
    for (const [sourceId, sound] of this.sounds) {
      sound.remaining -= Math.max(0, dt);
      if (sound.remaining <= 0) this.sounds.delete(sourceId);
    }
  }

  snapshot(listener: Vec3, listenerYaw: number): SoundDirectionCue[] {
    return [...this.sounds.values()]
      .map((sound): SoundDirectionCue | null => {
        const dx = sound.position.x - listener.x;
        const dz = sound.position.z - listener.z;
        const distance = Math.hypot(dx, dz);
        if (distance > sound.maxDistance) return null;
        const worldYaw = Math.atan2(-dx, -dz);
        const relative = wrapAngle(worldYaw - listenerYaw);
        const ageFraction = 1 - sound.remaining / Math.max(sound.lifetime, 0.001);
        const distanceFade = Math.max(0, 1 - distance / sound.maxDistance);
        const intensity = Math.max(
          0,
          Math.min(1, sound.strength * distanceFade * (1 - ageFraction * 0.72)),
        );
        if (intensity < 0.04) return null;
        return {
          id: sound.sourceId,
          direction: Math.max(-1, Math.min(1, -Math.sin(relative))),
          intensity,
          behind: Math.abs(relative) > Math.PI / 2,
          arrowAngle: -relative * 180 / Math.PI,
          phase: ageFraction * Math.PI * 5,
        };
      })
      .filter((cue): cue is SoundDirectionCue => cue !== null)
      .sort((a, b) => b.intensity - a.intensity)
      .slice(0, 4);
  }

  reset(): void {
    this.sounds.clear();
  }
}
