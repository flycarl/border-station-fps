import type {
  EntityId,
  PlayerCommand,
  RoundPhase,
  Team,
  Vec3,
} from '../core/types';
import type { BombState } from '../match/bomb-system';
import {
  BotController,
  type BotObjective,
  type BotView,
} from './bot-controller';
import { NavGraph } from './nav-graph';

export interface BotActorView extends BotView {
  id: EntityId;
  team: Team;
}

export interface BombView {
  state: BombState;
  carrierId: EntityId | null;
  position: Vec3;
}

export interface BotSquadContext {
  round: number;
  actors: BotActorView[];
  bomb: BombView;
  nav: NavGraph;
  canSee(from: Vec3, to: Vec3): boolean;
  dt: number;
  phase?: RoundPhase;
}

interface OwnedBot {
  id: EntityId;
  team: Team;
  controller: BotController;
}

const distance = (left: Vec3, right: Vec3): number => Math.hypot(
  left.x - right.x,
  left.y - right.y,
  left.z - right.z,
);

const routeToward = (nav: NavGraph, from: Vec3, target: Vec3): Vec3 => {
  const start = nav.nearest(from);
  const goal = nav.nearest(target);
  if (start.id === goal.id) return target;
  const path = nav.findPath(start.id, goal.id);
  const nextId = path[1] ?? path[0] ?? goal.id;
  return nav.nodes.find(({ id }) => id === nextId)?.position ?? target;
};

export class BotSquad {
  private readonly bots: OwnedBot[];
  private round: number | null = null;

  constructor(botIds: EntityId[]) {
    if (botIds.length !== 5) {
      throw new Error('BotSquad requires exactly five bot ids');
    }
    if (new Set(botIds).size !== botIds.length) {
      throw new Error('BotSquad bot ids must be unique');
    }

    this.bots = botIds.map((id, index) => {
      const team: Team = index < 2 ? 'attack' : 'defense';
      return {
        id,
        team,
        controller: new BotController(id, team, index),
      };
    });
  }

  sample(context: BotSquadContext): Map<EntityId, PlayerCommand> {
    if (this.round !== context.round) this.reset(context.round);

    const actorById = new Map(context.actors.map((actor) => [actor.id, actor]));
    const defuserId = this.selectDefuser(context);
    const retrieverId = this.selectRetriever(context);
    const commands = new Map<EntityId, PlayerCommand>();
    const activePhase = context.phase === undefined
      || context.phase === 'live'
      || context.phase === 'planted';

    for (const bot of this.bots) {
      const actor = actorById.get(bot.id);
      if (!actor) throw new Error(`Missing bot actor: ${bot.id}`);
      const objective = this.objectiveFor(bot, context, defuserId, retrieverId);
      const targetNode = activePhase
        ? this.targetFor(bot, actor, objective, context)
        : actor.position;
      const enemies = activePhase
        ? context.actors
          .filter((candidate) => candidate.team !== bot.team)
          .map(({ id, position, alive }) => ({ id, position, alive }))
        : [];

      commands.set(bot.id, bot.controller.update({
        self: actor,
        enemies,
        canSee: context.canSee,
        objective,
        targetNode,
        dt: context.dt,
      }));
    }

    return commands;
  }

  reset(round: number): void {
    this.round = round;
    this.bots.forEach((bot, index) => {
      bot.controller.reset(round * 100 + index);
    });
  }

  private selectDefuser(context: BotSquadContext): EntityId | null {
    if (context.bomb.state !== 'planted' && context.bomb.state !== 'defusing') {
      return null;
    }
    const defenderIds = new Set(
      this.bots.filter(({ team }) => team === 'defense').map(({ id }) => id),
    );
    return context.actors
      .filter((actor) => defenderIds.has(actor.id) && actor.alive)
      .sort((left, right) => distance(left.position, context.bomb.position)
        - distance(right.position, context.bomb.position)
        || left.id.localeCompare(right.id))[0]?.id ?? null;
  }

  private selectRetriever(context: BotSquadContext): EntityId | null {
    if (context.bomb.state !== 'dropped') return null;
    const attackerIds = new Set(
      this.bots.filter(({ team }) => team === 'attack').map(({ id }) => id),
    );
    return context.actors
      .filter((actor) => attackerIds.has(actor.id) && actor.alive)
      .sort((left, right) => distance(left.position, context.bomb.position)
        - distance(right.position, context.bomb.position)
        || left.id.localeCompare(right.id))[0]?.id ?? null;
  }

  private objectiveFor(
    bot: OwnedBot,
    context: BotSquadContext,
    defuserId: EntityId | null,
    retrieverId: EntityId | null,
  ): BotObjective {
    if (context.phase !== undefined
      && context.phase !== 'live'
      && context.phase !== 'planted') {
      return 'hold';
    }
    if (bot.team === 'attack') {
      if (bot.id === retrieverId) return 'retrieve';
      return context.bomb.carrierId === bot.id ? 'plant' : 'advance';
    }
    return bot.id === defuserId ? 'defuse' : 'advance';
  }

  private targetFor(
    bot: OwnedBot,
    actor: BotActorView,
    objective: BotObjective,
    context: BotSquadContext,
  ): Vec3 {
    if (bot.team === 'defense' && objective === 'defuse') {
      return context.bomb.position;
    }
    if (objective === 'retrieve') {
      return routeToward(context.nav, actor.position, context.bomb.position);
    }

    if (bot.team === 'defense') {
      const closestAttacker = context.actors
        .filter((candidate) => candidate.team === 'attack' && candidate.alive)
        .sort((left, right) => distance(actor.position, left.position)
          - distance(actor.position, right.position)
          || left.id.localeCompare(right.id))[0];
      if (closestAttacker) {
        return routeToward(context.nav, actor.position, closestAttacker.position);
      }
    }

    const site = context.nav.nearest(actor.position, 'site');
    if (objective === 'hold' || bot.team === 'defense') {
      const defenderIndex = this.bots
        .filter(({ team }) => team === 'defense')
        .findIndex(({ id }) => id === bot.id);
      const anchorId = ['site-left', 'site', 'site-right'][defenderIndex];
      return context.nav.nodes.find(({ id }) => id === anchorId)?.position
        ?? site.position;
    }
    const from = context.nav.nearest(actor.position);
    const path = context.nav.findPath(from.id, site.id);
    const nextId = path[1] ?? path[0] ?? site.id;
    return context.nav.nodes.find(({ id }) => id === nextId)?.position ?? site.position;
  }
}
