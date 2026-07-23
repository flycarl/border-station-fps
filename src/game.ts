import type RAPIER from '@dimforge/rapier3d-compat';
import { BotSquad } from './ai/bot-squad';
import { NavGraph } from './ai/nav-graph';
import { GameAudio, type GameAudioDiagnostics } from './audio/game-audio';
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
import {
  WeaponSystem,
  type WeaponState,
} from './weapons/weapon-system';
import { createBorderStationGraybox } from './world/border-station-graybox';
import {
  WorldRuntime,
  type CameraPose,
  type PlayerWorldStatus,
  type WorldDiagnostics,
} from './world/world-runtime';

const FIXED_STEP = 1 / 60;
const EYE_HEIGHT = 0.65;

export function applyBotAmmoIntent(
  command: PlayerCommand,
  weapon: Pick<WeaponState, 'magazine' | 'reserve'>,
): PlayerCommand {
  if (weapon.magazine > 0) return command;
  return {
    ...command,
    fire: false,
    reload: weapon.reserve > 0,
  };
}

export function calculateTracerOrigin(eye: Vec3, yaw: number, pitch: number): Vec3 {
  const cosPitch = Math.cos(pitch);
  const forward = {
    x: -Math.sin(yaw) * cosPitch,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cosPitch,
  };
  const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  return {
    x: eye.x + forward.x * 0.42 + right.x * 0.18,
    y: eye.y + forward.y * 0.42 - 0.12,
    z: eye.z + forward.z * 0.42 + right.z * 0.18,
  };
}

export function isPointWithinCameraView(
  cameraPose: CameraPose,
  point: Vec3,
  aspect: number,
  verticalFovRadians = 75 * Math.PI / 180,
): boolean {
  const dx = point.x - cameraPose.position.x;
  const dy = point.y - cameraPose.position.y;
  const dz = point.z - cameraPose.position.z;
  const sinYaw = Math.sin(cameraPose.yaw);
  const cosYaw = Math.cos(cameraPose.yaw);
  const sinPitch = Math.sin(cameraPose.pitch);
  const cosPitch = Math.cos(cameraPose.pitch);
  const forwardDistance = dx * (-sinYaw * cosPitch)
    + dy * sinPitch
    + dz * (-cosYaw * cosPitch);
  if (forwardDistance <= 0) return false;
  const horizontalDistance = dx * cosYaw + dz * -sinYaw;
  const verticalDistance = dx * (sinYaw * sinPitch)
    + dy * cosPitch
    + dz * (cosYaw * sinPitch);
  const verticalLimit = forwardDistance * Math.tan(verticalFovRadians / 2);
  const horizontalLimit = verticalLimit * Math.max(aspect, 0.01);
  return Math.abs(horizontalDistance) <= horizontalLimit
    && Math.abs(verticalDistance) <= verticalLimit;
}

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

export function selectRoundBombCarrier(
  roster: readonly RosterEntry[],
  round: number,
): EntityId {
  const attackers = roster.filter(({ team }) => team === 'attack');
  if (attackers.length === 0) throw new Error('Cannot assign bomb without an attacker');
  const seeded = (Math.imul(Math.max(1, Math.trunc(round)), 1_664_525)
    + 1_013_904_223) >>> 0;
  return attackers[seeded % attackers.length]!.id;
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

export function selectViewActor(
  actors: readonly ActorSnapshot[],
  humanId: EntityId,
): EntityId | null {
  const human = actors.find(({ id }) => id === humanId);
  return human?.alive ? human.id : null;
}

export function selectCameraPose(
  human: Pick<PlayerState, 'position' | 'yaw' | 'pitch' | 'alive'>,
): CameraPose {
  if (!human.alive) {
    return {
      position: { x: 0, y: 72, z: 0 },
      yaw: 0,
      pitch: -Math.PI / 2,
    };
  }
  return {
    position: {
      x: human.position.x,
      y: human.position.y + EYE_HEIGHT,
      z: human.position.z,
    },
    yaw: human.yaw,
    pitch: human.pitch,
  };
}

export function shouldAdvanceSimulation({
  paused,
  hasEntered,
  humanAlive,
}: {
  paused: boolean;
  hasEntered: boolean;
  humanAlive: boolean | undefined;
}): boolean {
  return !paused || (hasEntered && humanAlive === false);
}

export interface GameSnapshot extends HudSnapshot {
  round: number;
  paused: boolean;
  actors: ActorSnapshot[];
}

export function cloneGameSnapshot(snapshot: GameSnapshot): GameSnapshot {
  return {
    ...snapshot,
    radar: {
      bounds: { ...snapshot.radar.bounds },
      bombSite: { ...snapshot.radar.bombSite },
      contacts: snapshot.radar.contacts.map((contact) => ({ ...contact })),
    },
    actors: snapshot.actors.map((actor) => ({
      ...actor,
      position: { ...actor.position },
    })),
  };
}

interface GameDiagnostics {
  readonly renderer: WorldDiagnostics['renderer'];
  readonly physics: Omit<WorldDiagnostics, 'renderer'>;
  readonly viewWeapon: ReturnType<WorldRuntime['firstPersonWeaponDiagnostics']>;
  readonly audio: GameAudioDiagnostics;
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
  readonly viewActorId: EntityId | null;
  readonly cameraPose: CameraPose;
  advance(ticks: number): void;
  advanceUntilRoundChanges(maxTicks: number): void;
  command(actorId: EntityId, command: Partial<PlayerCommand>): void;
  clearCommands(): void;
  place(actorId: EntityId, position: Vec3): void;
  actorWorldStatus(actorId: EntityId): PlayerWorldStatus | null;
  canActorsSee(fromActorId: EntityId, toActorId: EntityId): boolean;
  isActorSupported(actorId: EntityId): boolean;
  actorCommand(actorId: EntityId): PlayerCommand;
  actorWeaponState(actorId: EntityId, slot?: 1 | 2): WeaponState;
  setActorWeaponState(
    actorId: EntityId,
    patch: Partial<Pick<WeaponState, 'magazine' | 'reserve' | 'reloadEndsAt'>>,
    slot?: 1 | 2,
  ): void;
  useLiveCommands(): void;
  restart(): void;
}

declare global {
  interface Window {
    __THREE_GAME_DIAGNOSTICS__?: GameDiagnostics;
    __THREE_GAME_QA__?: GameQaDriver;
  }
}

const MATCH_CONFIG = {
  freeze: 3,
  live: 105,
  result: 0,
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
  private readonly audio = new GameAudio();
  private readonly roster = createGameRoster();
  private readonly map = createBorderStationGraybox();
  private readonly nav: NavGraph;
  private readonly botSquad: BotSquad;
  private actors = new Map<EntityId, ActorRuntime>();
  private match = new MatchController(MATCH_CONFIG);
  private bomb = this.createBombForRound(1);
  private weaponSystem: WeaponSystem;
  private commands = new Map<EntityId, PlayerCommand>();
  private currentSnapshot: GameSnapshot;
  private rafId: number | null = null;
  private lastFrameTime: number | null = null;
  private paused = true;
  private hasEntered = false;
  private disposed = false;
  private qaCommands: Map<EntityId, PlayerCommand> | null = null;
  private humanWeaponFired = false;

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
    this.humanWeaponFired = false;
    this.spawnActors();
    this.currentSnapshot = this.composeSnapshot();
    this.startScreen = new StartScreen(
      uiRoot,
      this.resumeFromGesture,
      this.restartFromGesture,
    );
    this.audio.setPaused(true);
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
    this.bomb = this.createBombForRound(this.match.snapshot().round);
    this.weaponSystem = this.createWeaponSystem();
    this.humanWeaponFired = false;
    this.audio.resetRound();
    this.botSquad.reset(1);
    this.spawnActors();
    this.clock.reset();
    this.lastFrameTime = null;
    this.currentSnapshot = this.composeSnapshot();
    this.hud.render(this.currentSnapshot);
  }

  snapshot(): GameSnapshot {
    return cloneGameSnapshot(this.currentSnapshot);
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
    this.audio.dispose();
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
    const humanAlive = this.actors.get('attack-human')?.state.alive;
    if (shouldAdvanceSimulation({
      paused: this.paused,
      hasEntered: this.hasEntered,
      humanAlive,
    })) {
      this.clock.advance(frameSeconds, (dt) => {
        this.fixedUpdate(dt);
        return shouldAdvanceSimulation({
          paused: this.paused,
          hasEntered: this.hasEntered,
          humanAlive: this.actors.get('attack-human')?.state.alive,
        });
      });
    }
    this.renderFrame();
    this.rafId = requestAnimationFrame(this.frame);
  };

  private readonly fixedUpdate = (dt: number): void => {
    this.updatePerception();
    this.sampleCommands(dt);
    this.updateMovement(dt);
    this.world.step(dt);
    this.updatePerception();
    this.updateFootstepAudio();
    this.updateWeapons(dt);
    this.updateFirstPersonWeapon(dt);

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
    this.humanWeaponFired = false;
    for (const actor of this.actors.values()) {
      let command = this.commands.get(actor.state.id) ?? idleCommand();
      if (!actor.definition.human) {
        const selected = command.slot === 2
          ? actor.state.sidearm
          : actor.state.primary;
        command = applyBotAmmoIntent(command, selected);
        this.commands.set(actor.state.id, command);
      }
      const events = this.weaponSystem.update(actor.state.id, command, {
        origin: this.eyePosition(actor.state.position),
      }, dt);
      this.audio.playWeaponEvents(
        events,
        this.audioListenerPosition(),
        actor.state.position,
      );
      const shot = events.find((event) => event.type === 'shot');
      if (shot) {
        this.world.spawnBulletTracer(
          calculateTracerOrigin(
            this.eyePosition(actor.state.position),
            actor.state.yaw,
            actor.state.pitch,
          ),
          shot.point,
          actor.state.team,
        );
      }
      if (actor.state.id === 'attack-human'
        && events.some((event) => event.type === 'shot')) {
        this.humanWeaponFired = true;
      }
    }
    this.reconcileActorParticipation();
  }

  private updateFirstPersonWeapon(dt: number): void {
    const human = this.actors.get('attack-human')?.state;
    if (!human) return;
    const command = this.commands.get(human.id) ?? idleCommand();
    const selected = command.slot === 2 ? human.sidearm : human.primary;
    this.world.updateFirstPersonWeapon({
      weaponId: selected.id,
      movement: Math.min(1, Math.hypot(command.moveX, command.moveZ)),
      fired: this.humanWeaponFired,
      reloading: selected.reloadEndsAt !== null,
      alive: human.alive,
      paused: this.paused,
    }, dt);
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
    this.bomb = this.createBombForRound(this.match.snapshot().round);
    this.weaponSystem = this.createWeaponSystem();
    this.humanWeaponFired = false;
    this.audio.resetRound();
    this.botSquad.reset(this.match.snapshot().round);
    this.spawnActors();
    if (this.hasEntered && document.pointerLockElement !== this.canvas) this.pause();
  }

  private createWeaponSystem(): WeaponSystem {
    return new WeaponSystem(this.world, (id) => this.actors.get(id)?.state);
  }

  private createBombForRound(round: number): BombSystem {
    return new BombSystem(BOMB_CONFIG, selectRoundBombCarrier(this.roster, round));
  }

  private composeSnapshot(): GameSnapshot {
    const match = this.match.snapshot();
    const bomb = this.bomb.snapshot();
    const human = this.actors.get('attack-human')?.state;
    const selected = this.commands.get('attack-human')?.slot === 2
      ? human?.sidearm
      : human?.primary;
    const actorStates = [...this.actors.values()];
    const floor = this.map.solids.find(({ id }) => id === 'floor');
    const radarBounds = floor ? {
      minX: floor.center.x - floor.size.x / 2,
      maxX: floor.center.x + floor.size.x / 2,
      minZ: floor.center.z - floor.size.z / 2,
      maxZ: floor.center.z + floor.size.z / 2,
    } : { minX: -17, maxX: 17, minZ: -47, maxZ: 47 };
    return {
      attackScore: match.attackScore,
      defenseScore: match.defenseScore,
      attackersAlive: actorStates.filter(({ state }) => state.team === 'attack' && state.alive).length,
      defendersAlive: actorStates.filter(({ state }) => state.team === 'defense' && state.alive).length,
      phase: match.phase,
      phaseRemaining: match.phase === 'planted' ? bomb.remaining : match.phaseRemaining,
      health: human?.health ?? 0,
      armor: human?.armor ?? 0,
      weaponName: selected ? WEAPONS[selected.id].name : '无武器',
      magazine: selected?.magazine ?? 0,
      reserve: selected?.reserve ?? 0,
      bombState: bomb.state,
      radar: {
        bounds: radarBounds,
        bombSite: { x: this.map.bombSite.center.x, z: this.map.bombSite.center.z },
        contacts: actorStates.map(({ definition, state }) => ({
          id: state.id,
          team: state.team,
          x: state.position.x,
          z: state.position.z,
          yaw: state.yaw,
          human: definition.human,
          alive: state.alive,
        })),
      },
      round: match.round,
      paused: this.paused,
      actors: actorStates.map(({ state }) => ({
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
    const cameraPose = selectCameraPose(human);
    this.currentSnapshot = { ...this.currentSnapshot, paused: this.paused };
    this.hud.render(this.currentSnapshot);
    this.updateFirstPersonWeapon(0);
    this.updateBotHealthBars(cameraPose, human.id);
    this.world.render(cameraPose);
  }

  private updateBotHealthBars(cameraPose: CameraPose, viewerId: EntityId): void {
    const aspect = this.canvas.clientWidth / Math.max(this.canvas.clientHeight, 1);
    for (const { definition, state } of this.actors.values()) {
      if (definition.human) continue;
      const target = { x: state.position.x, y: state.position.y + 1.15, z: state.position.z };
      const direction = {
        x: target.x - cameraPose.position.x,
        y: target.y - cameraPose.position.y,
        z: target.z - cameraPose.position.z,
      };
      const distance = Math.hypot(direction.x, direction.y, direction.z);
      const insideView = isPointWithinCameraView(cameraPose, target, aspect);
      const hit = insideView && distance > 0.01
        ? this.world.raycast(
          cameraPose.position,
          direction,
          Math.max(0, distance - 0.05),
          viewerId,
        )
        : null;
      this.world.updatePlayerHealthBar(
        state.id,
        state.health,
        state.alive && insideView && (hit === null || hit.entityId === state.id),
      );
    }
  }

  private eyePosition(position: Vec3): Vec3 {
    return { x: position.x, y: position.y + EYE_HEIGHT, z: position.z };
  }

  private audioListenerPosition(): Vec3 {
    const states = [...this.actors.values()].map(({ state }) => state);
    const viewId = selectViewActor(states, 'attack-human') ?? 'attack-human';
    return this.actors.get(viewId)?.state.position
      ?? this.actors.get('attack-human')?.state.position
      ?? { x: 0, y: 0, z: 0 };
  }

  private updateFootstepAudio(): void {
    const listener = this.audioListenerPosition();
    for (const { state } of this.actors.values()) {
      this.audio.updateFootstep(
        state.id,
        state.position,
        state.alive,
        state.grounded,
        listener,
      );
    }
  }

  private readonly resumeFromGesture = (): void => {
    if (this.disposed) return;
    this.hasEntered = true;
    this.paused = true;
    this.startScreen.setLockError('');
    void this.audio.unlock();
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
      this.audio.setPaused(false);
      this.lastFrameTime = null;
      this.startScreen.setLockError('');
      this.startScreen.setPaused(false);
    } else if (this.hasEntered) {
      const humanAlive = this.actors.get('attack-human')?.state.alive;
      if (humanAlive !== false) {
        this.pause();
      } else {
        this.continueSpectating();
      }
    }
  };

  private readonly keyDown = (event: KeyboardEvent): void => {
    if (event.code !== 'Escape' || !this.hasEntered) return;
    if (this.actors.get('attack-human')?.state.alive === false) {
      this.continueSpectating();
      return;
    }
    this.pause();
  };

  private continueSpectating(): void {
    this.paused = false;
    this.audio.setPaused(false);
    this.lastFrameTime = null;
    this.input.resetHeldState();
    this.startScreen.setPaused(false);
  }

  private pause(message = ''): void {
    this.paused = true;
    this.audio.setPaused(true);
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
      get viewWeapon() {
        return game.world.firstPersonWeaponDiagnostics();
      },
      get audio() {
        return game.audio.diagnostics();
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
      get viewActorId() {
        return selectViewActor(game.currentSnapshot.actors, 'attack-human');
      },
      get cameraPose() {
        const human = game.actors.get('attack-human')?.state;
        if (!human) throw new Error('Missing human actor');
        return selectCameraPose(human);
      },
      advance(ticks) {
        const count = Math.max(0, Math.min(20_000, Math.floor(ticks)));
        for (let tick = 0; tick < count; tick++) game.fixedUpdate(FIXED_STEP);
        game.renderFrame();
      },
      advanceUntilRoundChanges(maxTicks) {
        const count = Math.max(0, Math.min(20_000, Math.floor(maxTicks)));
        const startingRound = game.match.snapshot().round;
        for (let tick = 0; tick < count; tick++) {
          game.fixedUpdate(FIXED_STEP);
          if (game.match.snapshot().round !== startingRound) break;
        }
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
      actorCommand(actorId) {
        if (!game.actors.has(actorId)) throw new Error(`Unknown QA actor: ${actorId}`);
        return { ...(game.commands.get(actorId) ?? idleCommand()) };
      },
      actorWeaponState(actorId, slot = 1) {
        const actor = game.actors.get(actorId)?.state;
        if (!actor) throw new Error(`Unknown QA actor: ${actorId}`);
        return { ...(slot === 2 ? actor.sidearm : actor.primary) };
      },
      setActorWeaponState(actorId, patch, slot = 1) {
        const actor = game.actors.get(actorId)?.state;
        if (!actor) throw new Error(`Unknown QA actor: ${actorId}`);
        Object.assign(slot === 2 ? actor.sidearm : actor.primary, patch);
      },
      useLiveCommands() {
        game.qaCommands = null;
      },
      restart() {
        game.restart();
        game.qaCommands = new Map();
      },
    };
  }
}
