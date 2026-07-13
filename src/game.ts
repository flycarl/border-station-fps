import type RAPIER from '@dimforge/rapier3d-compat';
import { BotSquad } from './ai/bot-squad';
import { NavGraph } from './ai/nav-graph';
import { FixedStepClock } from './core/fixed-step';
import {
  idleCommand,
  type EntityId,
  type PlayerCommand,
  type Team,
  type Vec3,
} from './core/types';
import { KeyboardMouseInput } from './input/keyboard-mouse';
import { BombSystem } from './match/bomb-system';
import { MatchController } from './match/match-controller';
import { stepBombAndMatch } from './match/objective-step';
import { PlayerController } from './player/player-controller';
import { createPlayerState, type PlayerState } from './player/player-state';
import { Hud, type HudSnapshot } from './ui/hud';
import { StartScreen } from './ui/start-screen';
import { WEAPONS } from './weapons/weapon-data';
import { WeaponSystem } from './weapons/weapon-system';
import { createBorderStationGraybox } from './world/border-station-graybox';
import {
  WorldRuntime,
  type PlayerWorldStatus,
  type WorldDiagnostics,
} from './world/world-runtime';

const FIXED_STEP = 1 / 60;
const EYE_HEIGHT = 0.65;

export const STEP_ORDER = [
  'perception',
  'commands',
  'movement',
  'physics',
  'weapons',
  'bomb',
  'match',
  'snapshot',
] as const;

export interface RosterEntry {
  id: EntityId;
  team: Team;
  human: boolean;
  spawnIndex: number;
}

export function createGameRoster(): RosterEntry[] {
  return [
    { id: 'attack-human', team: 'attack', human: true, spawnIndex: 0 },
    { id: 'attack-bot-1', team: 'attack', human: false, spawnIndex: 1 },
    { id: 'attack-bot-2', team: 'attack', human: false, spawnIndex: 2 },
    { id: 'defense-bot-1', team: 'defense', human: false, spawnIndex: 0 },
    { id: 'defense-bot-2', team: 'defense', human: false, spawnIndex: 1 },
    { id: 'defense-bot-3', team: 'defense', human: false, spawnIndex: 2 },
  ];
}

interface ActorRuntime {
  definition: RosterEntry;
  state: PlayerState;
  body: RAPIER.RigidBody;
  controller: PlayerController;
}

export interface ActorSnapshot {
  id: EntityId;
  team: Team;
  position: Vec3;
  health: number;
  alive: boolean;
}

export interface GameSnapshot extends HudSnapshot {
  round: number;
  paused: boolean;
  actors: ActorSnapshot[];
}

interface GameDiagnostics {
  readonly renderer: WorldDiagnostics['renderer'];
  readonly physics: Omit<WorldDiagnostics, 'renderer'>;
  readonly state: GameSnapshot;
  readonly loop: {
    active: boolean;
    fixedHz: number;
    stepOrder: typeof STEP_ORDER;
  };
  restart(): void;
}

interface GameQaDriver {
  readonly state: GameSnapshot;
  readonly bomb: ReturnType<BombSystem['snapshot']>;
  advance(ticks: number): void;
  command(actorId: EntityId, command: Partial<PlayerCommand>): void;
  clearCommands(): void;
  place(actorId: EntityId, position: Vec3): void;
  actorWorldStatus(actorId: EntityId): PlayerWorldStatus | null;
  canActorsSee(fromActorId: EntityId, toActorId: EntityId): boolean;
  isActorSupported(actorId: EntityId): boolean;
  restart(): void;
}

declare global {
  interface Window {
    __THREE_GAME_DIAGNOSTICS__?: GameDiagnostics;
    __THREE_GAME_QA__?: GameQaDriver;
  }
}

const MATCH_CONFIG = {
  freeze: 12,
  live: 105,
  result: 5,
  roundsToWin: 7,
  halftimeAfter: 6,
};

const BOMB_CONFIG = {
  plantSeconds: 3.2,
  fuseSeconds: 35,
  defuseSeconds: 7,
  kitDefuseSeconds: 3.5,
};

export class Game {
  private readonly clock = new FixedStepClock(FIXED_STEP, 0.25);
  private readonly input: KeyboardMouseInput;
  private readonly hud: Hud;
  private readonly startScreen: StartScreen;
  private readonly roster = createGameRoster();
  private readonly map = createBorderStationGraybox();
  private readonly nav: NavGraph;
  private readonly botSquad: BotSquad;
  private actors = new Map<EntityId, ActorRuntime>();
  private match = new MatchController(MATCH_CONFIG);
  private bomb = new BombSystem(BOMB_CONFIG, 'attack-human');
  private weaponSystem: WeaponSystem;
  private commands = new Map<EntityId, PlayerCommand>();
  private currentSnapshot: GameSnapshot;
  private rafId: number | null = null;
  private lastFrameTime: number | null = null;
  private paused = true;
  private hasEntered = false;
  private disposed = false;
  private qaCommands: Map<EntityId, PlayerCommand> | null = null;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly uiRoot: HTMLElement,
    private readonly world: WorldRuntime,
  ) {
    this.input = new KeyboardMouseInput(document);
    this.hud = new Hud(uiRoot);
    this.nav = new NavGraph(this.map.navNodes);
    this.botSquad = new BotSquad(this.roster.filter(({ human }) => !human).map(({ id }) => id));
    this.weaponSystem = this.createWeaponSystem();
    this.spawnActors();
    this.currentSnapshot = this.composeSnapshot();
    this.startScreen = new StartScreen(
      uiRoot,
      this.resumeFromGesture,
      this.restartFromGesture,
    );
    document.addEventListener('pointerlockchange', this.pointerLockChange);
    document.addEventListener('keydown', this.keyDown);
    this.installDiagnostics();
    this.installQaDriver();
  }

  static async create(canvas: HTMLCanvasElement, uiRoot: HTMLElement): Promise<Game> {
    return new Game(canvas, uiRoot, await WorldRuntime.create(canvas));
  }

  start(): void {
    if (this.disposed || this.rafId !== null) return;
    this.renderFrame();
    this.rafId = requestAnimationFrame(this.frame);
  }

  restart(): void {
    if (this.disposed) return;
    for (const id of this.actors.keys()) this.world.removePlayer(id);
    this.actors.clear();
    this.commands.clear();
    this.match = new MatchController(MATCH_CONFIG);
    this.bomb = new BombSystem(BOMB_CONFIG, 'attack-human');
    this.weaponSystem = this.createWeaponSystem();
    this.botSquad.reset(1);
    this.spawnActors();
    this.clock.reset();
    this.lastFrameTime = null;
    this.currentSnapshot = this.composeSnapshot();
    this.hud.render(this.currentSnapshot);
  }

  snapshot(): GameSnapshot {
    return {
      ...this.currentSnapshot,
      actors: this.currentSnapshot.actors.map((actor) => ({
        ...actor,
        position: { ...actor.position },
      })),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    document.removeEventListener('pointerlockchange', this.pointerLockChange);
    document.removeEventListener('keydown', this.keyDown);
    this.input.dispose();
    this.hud.dispose();
    this.startScreen.dispose();
    for (const id of this.actors.keys()) this.world.removePlayer(id);
    this.actors.clear();
    this.world.dispose();
    delete window.__THREE_GAME_DIAGNOSTICS__;
    delete window.__THREE_GAME_QA__;
    this.uiRoot.replaceChildren();
  }

  private readonly frame = (time: number): void => {
    if (this.disposed) return;
    const frameSeconds = this.lastFrameTime === null ? 0 : (time - this.lastFrameTime) / 1000;
    this.lastFrameTime = time;
    if (!this.paused) this.clock.advance(frameSeconds, this.fixedUpdate);
    this.renderFrame();
    this.rafId = requestAnimationFrame(this.frame);
  };

  private readonly fixedUpdate = (dt: number): void => {
    this.updatePerception();
    this.sampleCommands(dt);
    this.updateMovement(dt);
    this.world.step(dt);
    this.updatePerception();
    this.updateWeapons(dt);

    const actions = [...this.actors.values()].map(({ definition, state }) => ({
      actorId: state.id,
      team: state.team,
      position: state.position,
      interact: this.commands.get(state.id)?.interact ?? false,
      alive: state.alive,
      hasKit: definition.id === 'defense-bot-1',
    }));
    const alive = {
      attackersAlive: [...this.actors.values()].filter(({ state }) => state.team === 'attack' && state.alive).length,
      defendersAlive: [...this.actors.values()].filter(({ state }) => state.team === 'defense' && state.alive).length,
    };
    const previousRound = this.match.snapshot().round;
    stepBombAndMatch(this.bomb, this.match, dt, actions, this.map.bombSite, alive);
    if (this.match.snapshot().round !== previousRound) this.resetRoundActors();
    this.currentSnapshot = this.composeSnapshot();
  };

  private updatePerception(): void {
    for (const actor of this.actors.values()) {
      const translation = actor.body.translation();
      actor.state.position = { x: translation.x, y: translation.y, z: translation.z };
      actor.state.grounded = this.world.isPlayerSupported(actor.state.id);
    }
  }

  private sampleCommands(dt: number): void {
    if (this.qaCommands) {
      this.commands = new Map(this.roster.map(({ id }) => [
        id,
        { ...(this.qaCommands?.get(id) ?? idleCommand()) },
      ]));
      return;
    }
    const phase = this.match.snapshot().phase;
    const active = phase === 'live' || phase === 'planted';
    const human = this.actors.get('attack-human');
    const humanCommand = active && human?.state.alive ? this.input.sample() : idleCommand();
    this.commands = new Map([['attack-human', humanCommand]]);

    const botCommands = this.botSquad.sample({
      round: this.match.snapshot().round,
      actors: [...this.actors.values()].map(({ state }) => ({
        id: state.id,
        team: state.team,
        position: state.position,
        yaw: state.yaw,
        alive: state.alive,
      })),
      bomb: this.bomb.snapshot(),
      nav: this.nav,
      canSee: this.canSee,
      dt,
      phase,
    });
    for (const [id, command] of botCommands) this.commands.set(id, command);
  }

  private updateMovement(dt: number): void {
    for (const actor of this.actors.values()) {
      const command = this.commands.get(actor.state.id) ?? idleCommand();
      actor.state.yaw = command.yaw;
      actor.state.pitch = command.pitch;
      if (actor.state.alive) actor.controller.update(command, dt, actor.state.grounded);
    }
  }

  private updateWeapons(dt: number): void {
    for (const actor of this.actors.values()) {
      const command = this.commands.get(actor.state.id) ?? idleCommand();
      this.weaponSystem.update(actor.state.id, command, {
        origin: this.eyePosition(actor.state.position),
      }, dt);
    }
    this.reconcileActorParticipation();
  }

  private reconcileActorParticipation(): void {
    for (const { state } of this.actors.values()) {
      if (this.world.playerStatus(state.id)?.active !== state.alive) {
        this.world.setPlayerActive(state.id, state.alive);
      }
    }
  }

  private readonly canSee = (from: Vec3, to: Vec3): boolean => {
    const selfId = [...this.actors.values()].find(({ state }) => (
      Math.hypot(
        state.position.x - from.x,
        state.position.y - from.y,
        state.position.z - from.z,
      ) < 0.01
    ))?.state.id;
    const targetId = [...this.actors.values()].find(({ state }) => (
      Math.hypot(
        state.position.x - to.x,
        state.position.y - to.y,
        state.position.z - to.z,
      ) < 0.01
    ))?.state.id;
    const origin = this.eyePosition(from);
    const target = { x: to.x, y: to.y + 0.35, z: to.z };
    const direction = {
      x: target.x - origin.x,
      y: target.y - origin.y,
      z: target.z - origin.z,
    };
    const distance = Math.hypot(direction.x, direction.y, direction.z);
    if (distance <= 0.01) return true;
    const hit = this.world.raycast(origin, direction, distance + 0.1, selfId);
    return targetId !== undefined && hit?.entityId === targetId;
  };

  private spawnActors(): void {
    for (const definition of this.roster) {
      const teamSpawns = this.map.spawns.filter(({ team }) => team === definition.team);
      const spawn = teamSpawns[definition.spawnIndex];
      if (!spawn) throw new Error(`Missing spawn for ${definition.id}`);
      const state = createPlayerState(definition.id, definition.team, { ...spawn.position });
      state.yaw = spawn.yaw;
      state.armor = definition.team === 'defense' ? 50 : 25;
      const body = this.world.spawnPlayer(spawn.position, definition.id);
      this.actors.set(definition.id, {
        definition,
        state,
        body,
        controller: new PlayerController(body),
      });
    }
  }

  private resetRoundActors(): void {
    for (const id of this.actors.keys()) this.world.removePlayer(id);
    this.actors.clear();
    this.commands.clear();
    this.bomb = new BombSystem(BOMB_CONFIG, 'attack-human');
    this.weaponSystem = this.createWeaponSystem();
    this.botSquad.reset(this.match.snapshot().round);
    this.spawnActors();
  }

  private createWeaponSystem(): WeaponSystem {
    return new WeaponSystem(this.world, (id) => this.actors.get(id)?.state);
  }

  private composeSnapshot(): GameSnapshot {
    const match = this.match.snapshot();
    const bomb = this.bomb.snapshot();
    const human = this.actors.get('attack-human')?.state;
    const selected = this.commands.get('attack-human')?.slot === 2
      ? human?.sidearm
      : human?.primary;
    return {
      attackScore: match.attackScore,
      defenseScore: match.defenseScore,
      phase: match.phase,
      phaseRemaining: match.phase === 'planted' ? bomb.remaining : match.phaseRemaining,
      health: human?.health ?? 0,
      armor: human?.armor ?? 0,
      weaponName: selected ? WEAPONS[selected.id].name : '无武器',
      magazine: selected?.magazine ?? 0,
      reserve: selected?.reserve ?? 0,
      bombState: bomb.state,
      round: match.round,
      paused: this.paused,
      actors: [...this.actors.values()].map(({ state }) => ({
        id: state.id,
        team: state.team,
        position: { ...state.position },
        health: state.health,
        alive: state.alive,
      })),
    };
  }

  private renderFrame(): void {
    const human = this.actors.get('attack-human')?.state;
    if (!human) return;
    this.currentSnapshot = { ...this.currentSnapshot, paused: this.paused };
    this.hud.render(this.currentSnapshot);
    this.world.render({
      position: this.eyePosition(human.position),
      yaw: human.yaw,
      pitch: human.pitch,
    });
  }

  private eyePosition(position: Vec3): Vec3 {
    return { x: position.x, y: position.y + EYE_HEIGHT, z: position.z };
  }

  private readonly resumeFromGesture = (): void => {
    if (this.disposed) return;
    this.hasEntered = true;
    this.paused = true;
    this.startScreen.setLockError('');
    try {
      void this.canvas.requestPointerLock().catch(() => {
        this.pause('无法锁定鼠标，请重试。');
      });
    } catch {
      this.pause('无法锁定鼠标，请重试。');
    }
  };

  private readonly restartFromGesture = (): void => {
    this.restart();
    this.resumeFromGesture();
  };

  private readonly pointerLockChange = (): void => {
    if (document.pointerLockElement === this.canvas) {
      this.paused = false;
      this.lastFrameTime = null;
      this.startScreen.setLockError('');
      this.startScreen.setPaused(false);
    } else if (this.hasEntered) {
      this.pause();
    }
  };

  private readonly keyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Escape' || !this.hasEntered) return;
    this.pause();
  };

  private pause(message = ''): void {
    this.paused = true;
    this.lastFrameTime = null;
    this.input.resetHeldState();
    this.startScreen.setPaused(true);
    if (message) this.startScreen.setLockError(message);
  }

  private installDiagnostics(): void {
    if (new URLSearchParams(window.location.search).get('debug') !== '1') return;
    const game = this;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      get renderer() {
        return game.world.diagnostics().renderer;
      },
      get physics() {
        const { renderer: _renderer, ...physics } = game.world.diagnostics();
        return physics;
      },
      get state() {
        return game.snapshot();
      },
      get loop() {
        return {
          active: game.rafId !== null && !game.disposed,
          fixedHz: 60,
          stepOrder: STEP_ORDER,
        };
      },
      restart() {
        game.restart();
      },
    };
  }

  private installQaDriver(): void {
    if (new URLSearchParams(window.location.search).get('qa') !== '1') return;
    const game = this;
    this.qaCommands = new Map();
    window.__THREE_GAME_QA__ = {
      get state() {
        return game.snapshot();
      },
      get bomb() {
        return game.bomb.snapshot();
      },
      advance(ticks) {
        const count = Math.max(0, Math.min(20_000, Math.floor(ticks)));
        for (let tick = 0; tick < count; tick++) game.fixedUpdate(FIXED_STEP);
        game.renderFrame();
      },
      command(actorId, command) {
        if (!game.actors.has(actorId)) throw new Error(`Unknown QA actor: ${actorId}`);
        game.qaCommands?.set(actorId, { ...idleCommand(), ...command });
      },
      clearCommands() {
        game.qaCommands?.clear();
      },
      place(actorId, position) {
        const actor = game.actors.get(actorId);
        if (!actor) throw new Error(`Unknown QA actor: ${actorId}`);
        actor.body.setTranslation(position, true);
        actor.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      },
      actorWorldStatus(actorId) {
        return game.world.playerStatus(actorId);
      },
      canActorsSee(fromActorId, toActorId) {
        const from = game.actors.get(fromActorId)?.state.position;
        const to = game.actors.get(toActorId)?.state.position;
        return from !== undefined && to !== undefined && game.canSee(from, to);
      },
      isActorSupported(actorId) {
        return game.world.isPlayerSupported(actorId);
      },
      restart() {
        game.restart();
        game.qaCommands = new Map();
      },
    };
  }
}
