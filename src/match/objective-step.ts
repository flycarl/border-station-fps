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
  const events = bomb.update(dt, actors, site);
  match.update(dt, { ...alive, ...bombFactsFrom(bomb.snapshot()) });
  return events;
}
