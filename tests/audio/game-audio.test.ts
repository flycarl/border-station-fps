import { describe, expect, it } from 'vitest';
import { GameAudio, type GameAudioBackend, type GameSound } from '../../src/audio/game-audio';
import type { WeaponEvent } from '../../src/weapons/weapon-system';

class RecordingBackend implements GameAudioBackend {
  readonly sounds: Array<{ sound: GameSound; distance: number }> = [];
  unlocks = 0;
  pauses: boolean[] = [];
  stops = 0;
  disposed = false;

  async unlock(): Promise<boolean> {
    this.unlocks++;
    return true;
  }

  setPaused(paused: boolean): void {
    this.pauses.push(paused);
  }

  play(sound: GameSound, distance: number): void {
    this.sounds.push({ sound, distance });
  }

  stopAll(): void {
    this.stops++;
  }

  dispose(): void {
    this.disposed = true;
  }
}

describe('GameAudio', () => {
  it('routes shot, flesh hit and kill events to distinct sounds', async () => {
    const backend = new RecordingBackend();
    const audio = new GameAudio(backend);
    await audio.unlock();
    const events: WeaponEvent[] = [
      { type: 'shot', actorId: 'a', targetId: null, point: { x: 10, y: 0, z: 0 } },
      { type: 'hit', actorId: 'a', targetId: 'b', point: { x: 6, y: 0, z: 0 } },
      { type: 'kill', actorId: 'a', targetId: 'b', point: { x: 6, y: 0, z: 0 } },
    ];

    audio.playWeaponEvents(events, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 });

    expect(backend.sounds).toEqual([
      { sound: 'gunshot', distance: 1 },
      { sound: 'flesh-hit', distance: 6 },
      { sound: 'death', distance: 6 },
    ]);
    expect(audio.diagnostics().events).toEqual({
      footsteps: 0,
      gunshots: 1,
      fleshHits: 1,
      deaths: 1,
    });
  });

  it('makes footsteps from actual grounded travel, not idle or airborne commands', async () => {
    const backend = new RecordingBackend();
    const audio = new GameAudio(backend, 1.2);
    await audio.unlock();
    const listener = { x: 0, y: 0, z: 0 };

    audio.updateFootstep('bot', { x: 0, y: 0, z: 0 }, true, true, listener);
    audio.updateFootstep('bot', { x: 0.7, y: 0, z: 0 }, true, true, listener);
    audio.updateFootstep('bot', { x: 1.3, y: 0, z: 0 }, true, false, listener);
    audio.updateFootstep('bot', { x: 1.9, y: 0, z: 0 }, true, true, listener);
    audio.updateFootstep('bot', { x: 2.5, y: 0, z: 0 }, true, true, listener);

    expect(backend.sounds.map(({ sound }) => sound)).toEqual(['footstep']);
    expect(audio.diagnostics().events.footsteps).toBe(1);
  });

  it('does not emit before unlock and resets transient round audio', () => {
    const backend = new RecordingBackend();
    const audio = new GameAudio(backend);

    audio.updateFootstep('human', { x: 0, y: 0, z: 0 }, true, true, { x: 0, y: 0, z: 0 });
    audio.updateFootstep('human', { x: 2, y: 0, z: 0 }, true, true, { x: 0, y: 0, z: 0 });
    audio.setPaused(true);
    audio.resetRound();
    audio.dispose();

    expect(backend.sounds).toHaveLength(0);
    expect(backend.pauses).toEqual([true]);
    expect(backend.stops).toBe(1);
    expect(backend.disposed).toBe(true);
  });
});
