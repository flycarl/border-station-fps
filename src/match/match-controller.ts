import type { RoundPhase, Team } from '../core/types';
import type { BombSnapshot } from './bomb-system';

export interface MatchConfig {
  freeze: number;
  live: number;
  result: number;
  roundsToWin: number;
  halftimeAfter: number;
}

export interface RoundFacts {
  attackersAlive: number;
  defendersAlive: number;
  bombPlanted: boolean;
  bombExploded: boolean;
  bombDefused: boolean;
}

export function bombFactsFrom(
  bomb: BombSnapshot,
): Pick<RoundFacts, 'bombPlanted' | 'bombExploded' | 'bombDefused'> {
  return {
    bombPlanted: bomb.state === 'planted' || bomb.state === 'defusing',
    bombExploded: bomb.state === 'exploded',
    bombDefused: bomb.state === 'defused',
  };
}

export interface MatchSnapshot {
  phase: RoundPhase;
  round: number;
  attackScore: number;
  defenseScore: number;
  phaseRemaining: number;
  winner: Team | null;
}

export class MatchController {
  private phase: RoundPhase = 'freeze';
  private remaining: number;
  private round = 1;
  private attackScore = 0;
  private defenseScore = 0;
  private winner: Team | null = null;

  constructor(private readonly config: MatchConfig) {
    this.remaining = config.freeze;
  }

  update(dt: number, facts: RoundFacts): void {
    if (this.phase === 'match-over') return;

    this.remaining = Math.max(0, this.remaining - dt);
    if (this.phase === 'freeze' && this.remaining === 0) {
      this.enter('live', this.config.live);
    } else if (this.phase === 'live') {
      if (facts.bombPlanted) this.enter('planted', Number.POSITIVE_INFINITY);
      else if (facts.defendersAlive === 0) this.endRound('attack');
      else if (facts.attackersAlive === 0 || this.remaining === 0) this.endRound('defense');
    } else if (this.phase === 'planted') {
      if (facts.bombExploded) this.endRound('attack');
      else if (facts.bombDefused) this.endRound('defense');
    } else if (this.phase === 'result' && this.remaining === 0) {
      this.startNextRound();
    }
  }

  private enter(phase: RoundPhase, duration: number): void {
    this.phase = phase;
    this.remaining = duration;
  }

  private endRound(team: Team): void {
    if (team === 'attack') this.attackScore++;
    else this.defenseScore++;
    this.winner = team;
    this.enter(
      this.attackScore >= this.config.roundsToWin || this.defenseScore >= this.config.roundsToWin
        ? 'match-over'
        : 'result',
      this.config.result,
    );
  }

  private startNextRound(): void {
    this.round++;
    this.winner = null;
    this.enter('freeze', this.config.freeze);
  }

  snapshot(): MatchSnapshot {
    return {
      phase: this.phase,
      round: this.round,
      attackScore: this.attackScore,
      defenseScore: this.defenseScore,
      phaseRemaining: this.remaining,
      winner: this.winner,
    };
  }
}
