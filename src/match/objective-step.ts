import type { ActorAction, BombEvent, BombSystem, SiteBounds } from './bomb-system';
import { bombFactsFrom, type MatchController } from './match-controller';

export interface AliveFacts {
  attackersAlive: number;
  defendersAlive: number;
}

export function stepBombAndMatch(
  bomb: BombSystem,
  match: MatchController,
  dt: number,
  actors: readonly ActorAction[],
  site: SiteBounds,
  alive: AliveFacts,
): BombEvent[] {
  const matchPhase = match.snapshot().phase;
  const bombState = bomb.snapshot().state;
  const canAdvancePlant = matchPhase === 'live'
    && (bombState === 'carried' || bombState === 'dropped' || bombState === 'planting');
  const canAdvancePlanted = matchPhase === 'planted'
    && (bombState === 'planted' || bombState === 'defusing');
  const events = canAdvancePlant || canAdvancePlanted
    ? bomb.update(dt, actors, site)
    : [];
  match.update(dt, { ...alive, ...bombFactsFrom(bomb.snapshot()) });
  return events;
}
