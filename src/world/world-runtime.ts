import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { EntityId, Team, Vec3 } from '../core/types';
import type { SiteBounds } from '../match/bomb-system';
import { BulletTracerSystem } from '../weapons/bullet-tracer-system';
import {
  FirstPersonWeaponRig,
  type FirstPersonWeaponDiagnostics,
  type FirstPersonWeaponState,
} from '../weapons/first-person-weapon';
import {
  BORDER_STATION_RAMP_PITCH,
  createBorderStationGraybox,
  type SolidDef,
} from './border-station-graybox';
import { createPixelCharacter, type PixelCharacter } from './pixel-character';

export interface CameraPose {
  position: Vec3;
  yaw: number;
  pitch: number;
}

export interface RayHit {
  entityId: string | null;
  distance: number;
  point: Vec3;
}

export interface PlayerWorldStatus {
  active: boolean;
  raycastRegistered: boolean;
  meshVisible: boolean;
  healthBarVisible: boolean;
  healthFraction: number;
}

export interface WorldDiagnostics {
  engine: 'rapier';
  timestep: number;
  bodies: number;
  colliders: number;
  healthBars: number;
  sensors: number;
  ccdBodies: number;
  tracers: number;
  renderer: {
    calls: number;
    triangles: number;
    points: number;
    lines: number;
    geometries: number;
    textures: number;
  };
}

const MAX_DEVICE_PIXEL_RATIO = 2;
const PLAYER_HALF_HEIGHT = 0.5;
const PLAYER_RADIUS = 0.35;
const PLAYER_LINEAR_DAMPING = 0.8;
const ACTIVE_COLLISION_GROUPS = 0xffffffff;
const INACTIVE_COLLISION_GROUPS = 0;
const BOMB_SITE_MARKER_Y = 0.012;
const HEALTH_BAR_WIDTH = 0.9;
const PLAYER_NAMEPLATE_COLORS: Record<Team, number> = {
  attack: 0xe69a47,
  defense: 0x36c7e8,
};

export interface PlayerHealthBar {
  group: THREE.Group;
  fill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  fillMaterial: THREE.MeshBasicMaterial;
  nameplateMaterial: THREE.MeshBasicMaterial;
  team: Team;
  healthFraction: number;
  dispose(): void;
}

function createPlayerNameTexture(label: string): THREE.CanvasTexture | null {
  if (!label || typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#ffffff';
  context.font = '900 30px Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function actorDisplayName(entityId: EntityId, team: Team): string {
  const number = entityId.match(/(\d+)$/)?.[1] ?? '';
  return team === 'attack' ? `队友 A${number}` : `敌方 D${number}`;
}

export function createPlayerHealthBar(
  team: Team = 'defense',
  label = '',
): PlayerHealthBar {
  const group = new THREE.Group();
  group.name = 'player-health-bar';
  group.visible = false;
  group.renderOrder = 20;
  const nameplateGeometry = new THREE.PlaneGeometry(1.14, 0.25);
  const nameplateMaterial = new THREE.MeshBasicMaterial({
    color: PLAYER_NAMEPLATE_COLORS[team],
    transparent: true,
    opacity: 0.92,
    depthTest: false,
    depthWrite: false,
  });
  const nameplate = new THREE.Mesh(nameplateGeometry, nameplateMaterial);
  nameplate.position.set(0, 0.23, 0);
  const nameTexture = createPlayerNameTexture(label);
  const nameGeometry = nameTexture ? new THREE.PlaneGeometry(1.06, 0.22) : null;
  const nameMaterial = nameTexture
    ? new THREE.MeshBasicMaterial({
      map: nameTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    : null;
  if (nameGeometry && nameMaterial) {
    const name = new THREE.Mesh(nameGeometry, nameMaterial);
    name.position.set(0, 0.23, 0.003);
    group.add(name);
  }
  const backgroundGeometry = new THREE.PlaneGeometry(0.98, 0.13);
  const backgroundMaterial = new THREE.MeshBasicMaterial({
    color: 0x101820,
    transparent: true,
    opacity: 0.86,
    depthTest: false,
    depthWrite: false,
  });
  const background = new THREE.Mesh(backgroundGeometry, backgroundMaterial);
  const fillGeometry = new THREE.PlaneGeometry(HEALTH_BAR_WIDTH, 0.075);
  const fillMaterial = new THREE.MeshBasicMaterial({
    color: 0x58d68d,
    depthTest: false,
    depthWrite: false,
  });
  const fill = new THREE.Mesh(fillGeometry, fillMaterial);
  fill.position.z = 0.002;
  group.add(nameplate, background, fill);
  const bar: PlayerHealthBar = {
    group,
    fill,
    fillMaterial,
    nameplateMaterial,
    team,
    healthFraction: 1,
    dispose() {
      group.removeFromParent();
      nameplateGeometry.dispose();
      nameplateMaterial.dispose();
      nameGeometry?.dispose();
      nameMaterial?.dispose();
      nameTexture?.dispose();
      backgroundGeometry.dispose();
      backgroundMaterial.dispose();
      fillGeometry.dispose();
      fillMaterial.dispose();
    },
  };
  return bar;
}

export function updatePlayerHealthBarVisual(
  bar: PlayerHealthBar,
  health: number,
  visible: boolean,
): void {
  const fraction = Math.max(0, Math.min(1, health / 100));
  bar.healthFraction = fraction;
  bar.group.visible = visible && fraction > 0;
  bar.fill.scale.x = fraction;
  bar.fill.position.x = -HEALTH_BAR_WIDTH * (1 - fraction) / 2;
  bar.fillMaterial.color.setHex(
    fraction > 0.6 ? 0x58d68d : fraction > 0.3 ? 0xffc247 : 0xff4d5e,
  );
}

export interface BombSiteMarkerDiagnostics {
  visible: boolean;
  center: { x: number; z: number };
  size: { x: number; z: number };
  fillOpacity: number;
  outlineColor: number;
}

declare global {
  interface Window {
    __THREE_BOMB_SITE_MARKER__?: BombSiteMarkerDiagnostics;
  }
}

let rapierInitialization: Promise<void> | null = null;

function initializeRapier(): Promise<void> {
  rapierInitialization ??= RAPIER.init();
  return rapierInitialization;
}

function colorForSolid(solid: SolidDef): number {
  if (solid.kind === 'cover') return 0x263b48;
  if (solid.kind === 'wall') return 0x425a68;
  return 0xb08b59;
}

function solidRampVertices(solid: SolidDef): Float32Array {
  const halfX = solid.size.x / 2;
  const halfZ = solid.size.z / 2;
  const height = Math.tan(BORDER_STATION_RAMP_PITCH) * solid.size.z;
  return new Float32Array([
    -halfX, 0, -halfZ,
    halfX, 0, -halfZ,
    -halfX, height, -halfZ,
    halfX, height, -halfZ,
    -halfX, 0, halfZ,
    halfX, 0, halfZ,
  ]);
}

export function createSolidRampGeometry(solid: SolidDef): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(solidRampVertices(solid), 3));
  geometry.setIndex([
    0, 4, 2,
    1, 3, 5,
    0, 1, 5, 0, 5, 4,
    2, 4, 5, 2, 5, 3,
    0, 2, 3, 0, 3, 1,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

export function createBombSiteMarkerGeometry(
  site: SiteBounds,
): { outline: THREE.BufferGeometry } {
  const minX = site.center.x - site.halfExtents.x;
  const maxX = site.center.x + site.halfExtents.x;
  const minZ = site.center.z - site.halfExtents.z;
  const maxZ = site.center.z + site.halfExtents.z;
  const y = BOMB_SITE_MARKER_Y;

  const outlineVertices = [
    minX, y, minZ, maxX, y, minZ,
    maxX, y, minZ, maxX, y, maxZ,
    maxX, y, maxZ, minX, y, maxZ,
    minX, y, maxZ, minX, y, minZ,
  ];
  const accentLength = Math.min(1.5, site.halfExtents.x * 0.35, site.halfExtents.z * 0.35);
  for (const [x, z, xDirection, zDirection] of [
    [minX, minZ, 1, 1],
    [maxX, minZ, -1, 1],
    [maxX, maxZ, -1, -1],
    [minX, maxZ, 1, -1],
  ] as const) {
    const insetX = x + xDirection * 0.24;
    const insetZ = z + zDirection * 0.24;
    outlineVertices.push(
      insetX, y, insetZ, insetX + xDirection * accentLength, y, insetZ,
      insetX, y, insetZ, insetX, y, insetZ + zDirection * accentLength,
    );
  }
  const outline = new THREE.BufferGeometry();
  outline.setAttribute('position', new THREE.Float32BufferAttribute(outlineVertices, 3));

  return { outline };
}

export function applyCameraPose(camera: THREE.Object3D, cameraPose: CameraPose): void {
  camera.position.set(cameraPose.position.x, cameraPose.position.y, cameraPose.position.z);
  camera.rotation.set(cameraPose.pitch, cameraPose.yaw, 0);
}

export class WorldRuntime {
  private readonly colliderEntityIds = new Map<number, string>();
  private readonly disposableGeometries: THREE.BufferGeometry[] = [];
  private readonly disposableMaterials: THREE.Material[] = [];
  private readonly disposableTextures: THREE.Texture[] = [];
  private readonly playerBodies = new Map<EntityId, RAPIER.RigidBody>();
  private readonly inactivePlayers = new Set<EntityId>();
  private readonly playerMeshes = new Map<EntityId, PixelCharacter>();
  private readonly playerHealthBars = new Map<EntityId, PlayerHealthBar>();
  private readonly supportColliderHandles = new Set<number>();
  private bombSiteMarker: THREE.Group | null = null;
  private firstPersonWeapon: FirstPersonWeaponRig | null = null;
  private readonly bulletTracers: BulletTracerSystem;
  private disposed = false;

  private constructor(
    private readonly canvas: HTMLCanvasElement | null,
    private readonly renderer: THREE.WebGLRenderer | null,
    private readonly scene: THREE.Scene | null,
    private readonly camera: THREE.PerspectiveCamera | null,
    private readonly physicsWorld: RAPIER.World,
  ) {
    this.bulletTracers = new BulletTracerSystem(scene);
  }

  static async create(canvas: HTMLCanvasElement): Promise<WorldRuntime> {
    await initializeRapier();

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DEVICE_PIXEL_RATIO));
    renderer.setClearColor(0x77c9f2);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x77c9f2);
    scene.fog = new THREE.Fog(0x96d5f2, 105, 230);
    const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 300);
    camera.rotation.order = 'YXZ';
    const physicsWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const runtime = new WorldRuntime(canvas, renderer, scene, camera, physicsWorld);

    runtime.firstPersonWeapon = new FirstPersonWeaponRig();
    camera.add(runtime.firstPersonWeapon.root);
    scene.add(camera);

    runtime.buildGraybox();
    runtime.addEnvironmentArt();
    runtime.addLighting();
    runtime.resize();
    window.addEventListener('resize', runtime.resize);

    return runtime;
  }

  static async createHeadless(withGraybox = false): Promise<WorldRuntime> {
    await initializeRapier();
    const runtime = new WorldRuntime(null, null, null, null, new RAPIER.World({ x: 0, y: -9.81, z: 0 }));
    if (withGraybox) runtime.buildGraybox();
    return runtime;
  }

  spawnPlayer(position: Vec3, entityId: EntityId): RAPIER.RigidBody {
    if (this.playerBodies.has(entityId)) {
      throw new Error(`Player already exists: ${entityId}`);
    }
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .lockRotations()
      .setLinearDamping(PLAYER_LINEAR_DAMPING);
    const body = this.physicsWorld.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS);
    const collider = this.physicsWorld.createCollider(colliderDesc, body);
    this.colliderEntityIds.set(collider.handle, entityId);
    this.playerBodies.set(entityId, body);
    this.inactivePlayers.delete(entityId);

    if (this.scene) {
      const team: Team = entityId.startsWith('attack') ? 'attack' : 'defense';
      const character = createPixelCharacter(team);
      character.group.visible = entityId !== 'attack-human';
      character.group.position.set(position.x, position.y, position.z);
      this.scene.add(character.group);
      this.playerMeshes.set(entityId, character);
      if (entityId !== 'attack-human') {
        const healthBar = createPlayerHealthBar(
          team,
          actorDisplayName(entityId, team),
        );
        this.scene.add(healthBar.group);
        this.playerHealthBars.set(entityId, healthBar);
      }
    }
    return body;
  }

  removePlayer(entityId: EntityId): void {
    const body = this.playerBodies.get(entityId);
    if (!body) return;
    for (let index = 0; index < body.numColliders(); index++) {
      this.colliderEntityIds.delete(body.collider(index).handle);
    }
    this.physicsWorld.removeRigidBody(body);
    this.playerBodies.delete(entityId);
    this.inactivePlayers.delete(entityId);
    this.playerMeshes.get(entityId)?.dispose();
    this.playerMeshes.delete(entityId);
    this.playerHealthBars.get(entityId)?.dispose();
    this.playerHealthBars.delete(entityId);
  }

  setPlayerActive(entityId: EntityId, active: boolean): void {
    const body = this.playerBodies.get(entityId);
    if (!body) return;
    if (active === !this.inactivePlayers.has(entityId)) return;
    if (active) this.inactivePlayers.delete(entityId);
    else this.inactivePlayers.add(entityId);
    body.setBodyType(
      active ? RAPIER.RigidBodyType.Dynamic : RAPIER.RigidBodyType.Fixed,
      true,
    );
    for (let index = 0; index < body.numColliders(); index++) {
      const collider = body.collider(index);
      collider.setCollisionGroups(
        active ? ACTIVE_COLLISION_GROUPS : INACTIVE_COLLISION_GROUPS,
      );
      if (active) this.colliderEntityIds.set(collider.handle, entityId);
      else this.colliderEntityIds.delete(collider.handle);
    }
    const mesh = this.playerMeshes.get(entityId);
    if (mesh) mesh.group.visible = active && entityId !== 'attack-human';
    if (!active) {
      const healthBar = this.playerHealthBars.get(entityId);
      if (healthBar) healthBar.group.visible = false;
    }
  }

  updatePlayerHealthBar(entityId: EntityId, health: number, visible: boolean): void {
    const healthBar = this.playerHealthBars.get(entityId);
    if (!healthBar) return;
    updatePlayerHealthBarVisual(
      healthBar,
      health,
      visible && !this.inactivePlayers.has(entityId),
    );
  }

  setPlayerFacing(entityId: EntityId, yaw: number): void {
    const character = this.playerMeshes.get(entityId);
    if (character) character.group.rotation.y = yaw;
  }

  playerStatus(entityId: EntityId): PlayerWorldStatus | null {
    const body = this.playerBodies.get(entityId);
    if (!body) return null;
    let raycastRegistered = body.numColliders() > 0;
    for (let index = 0; index < body.numColliders(); index++) {
      if (this.colliderEntityIds.get(body.collider(index).handle) !== entityId) {
        raycastRegistered = false;
      }
    }
    return {
      active: !this.inactivePlayers.has(entityId),
      raycastRegistered,
      meshVisible: this.playerMeshes.get(entityId)?.group.visible ?? false,
      healthBarVisible: this.playerHealthBars.get(entityId)?.group.visible ?? false,
      healthFraction: this.playerHealthBars.get(entityId)?.healthFraction ?? 0,
    };
  }

  step(dt: number): void {
    this.physicsWorld.timestep = dt;
    this.physicsWorld.step();
    this.bulletTracers.update(dt);
  }

  spawnBulletTracer(start: Vec3, end: Vec3, team: Team): void {
    this.bulletTracers.spawn(start, end, team);
  }

  updateFirstPersonWeapon(state: FirstPersonWeaponState, dt: number): void {
    this.firstPersonWeapon?.update(state, dt);
  }

  firstPersonWeaponDiagnostics(): FirstPersonWeaponDiagnostics | null {
    return this.firstPersonWeapon?.diagnostics() ?? null;
  }

  raycast(
    origin: Vec3,
    direction: Vec3,
    maxDistance: number,
    excludeEntityId?: EntityId,
  ): RayHit | null {
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (length === 0 || maxDistance < 0) return null;

    const normalizedDirection = {
      x: direction.x / length,
      y: direction.y / length,
      z: direction.z / length,
    };
    const ray = new RAPIER.Ray(origin, normalizedDirection);
    const hit = this.physicsWorld.castRay(
      ray,
      maxDistance,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (collider) => {
        const entityId = this.colliderEntityIds.get(collider.handle);
        return entityId !== undefined && entityId !== excludeEntityId;
      },
    );
    if (!hit) return null;

    const point = ray.pointAt(hit.timeOfImpact);
    return {
      entityId: this.colliderEntityIds.get(hit.collider.handle) ?? null,
      distance: hit.timeOfImpact,
      point: { x: point.x, y: point.y, z: point.z },
    };
  }

  isPlayerSupported(entityId: EntityId): boolean {
    const body = this.playerBodies.get(entityId);
    if (!body || this.inactivePlayers.has(entityId)) return false;
    const hit = this.physicsWorld.castRayAndGetNormal(
      new RAPIER.Ray(body.translation(), { x: 0, y: -1, z: 0 }),
      PLAYER_HALF_HEIGHT + PLAYER_RADIUS + 0.08,
      true,
      undefined,
      undefined,
      undefined,
      body,
      (collider) => this.supportColliderHandles.has(collider.handle),
    );
    return hit !== null && hit.normal.y >= 0.65;
  }

  render(cameraPose: CameraPose): void {
    if (!this.camera || !this.renderer || !this.scene) return;
    applyCameraPose(this.camera, cameraPose);
    for (const [entityId, character] of this.playerMeshes) {
      const body = this.playerBodies.get(entityId);
      if (!body) continue;
      const position = body.translation();
      character.group.position.set(position.x, position.y, position.z);
      const healthBar = this.playerHealthBars.get(entityId);
      if (healthBar && this.camera) {
        healthBar.group.position.set(position.x, position.y + 1.15, position.z);
        healthBar.group.quaternion.copy(this.camera.quaternion);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  diagnostics(): WorldDiagnostics {
    const render = this.renderer?.info.render;
    const memory = this.renderer?.info.memory;
    return {
      engine: 'rapier',
      timestep: this.physicsWorld.timestep,
      bodies: this.physicsWorld.bodies.len(),
      colliders: this.physicsWorld.colliders.len(),
      healthBars: this.playerHealthBars.size,
      sensors: 0,
      ccdBodies: 0,
      tracers: this.bulletTracers.diagnostics().active,
      renderer: {
        calls: render?.calls ?? 0,
        triangles: render?.triangles ?? 0,
        points: render?.points ?? 0,
        lines: render?.lines ?? 0,
        geometries: memory?.geometries ?? 0,
        textures: memory?.textures ?? 0,
      },
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    window.removeEventListener('resize', this.resize);
    for (const entityId of [...this.playerBodies.keys()]) this.removePlayer(entityId);
    for (const geometry of this.disposableGeometries) geometry.dispose();
    for (const material of this.disposableMaterials) material.dispose();
    for (const texture of this.disposableTextures) texture.dispose();
    this.firstPersonWeapon?.dispose();
    this.firstPersonWeapon = null;
    this.bulletTracers.dispose();
    this.bombSiteMarker?.removeFromParent();
    this.bombSiteMarker = null;
    delete window.__THREE_BOMB_SITE_MARKER__;
    this.physicsWorld.free();
    this.renderer?.dispose();
  }

  private readonly resize = (): void => {
    if (!this.canvas || !this.renderer || !this.camera) return;
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_DEVICE_PIXEL_RATIO));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
  };

  private buildGraybox(): void {
    const map = createBorderStationGraybox();
    for (const solid of map.solids) {
      const rotation = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0, solid.yaw, 0, 'YXZ'),
      );
      const colliderDesc = solid.kind === 'ramp'
        ? RAPIER.ColliderDesc.convexHull(solidRampVertices(solid))
        : RAPIER.ColliderDesc.cuboid(
          solid.size.x / 2,
          solid.size.y / 2,
          solid.size.z / 2,
        );
      if (!colliderDesc) throw new Error(`Cannot build collider for ${solid.id}`);
      colliderDesc
        .setTranslation(
          solid.center.x,
          solid.kind === 'ramp' ? 0 : solid.center.y,
          solid.center.z,
        )
        .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
      const collider = this.physicsWorld.createCollider(colliderDesc);
      this.colliderEntityIds.set(collider.handle, solid.id);
      if (solid.kind === 'floor' || solid.kind === 'ramp') {
        this.supportColliderHandles.add(collider.handle);
      }

      if (this.scene) {
        const geometry = solid.kind === 'ramp'
          ? createSolidRampGeometry(solid)
          : new THREE.BoxGeometry(solid.size.x, solid.size.y, solid.size.z);
        const material = new THREE.MeshStandardMaterial({ color: colorForSolid(solid) });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(
          solid.center.x,
          solid.kind === 'ramp' ? 0 : solid.center.y,
          solid.center.z,
        );
        mesh.rotation.set(0, solid.yaw, 0, 'YXZ');
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.disposableGeometries.push(geometry);
        this.disposableMaterials.push(material);
      }
    }
    this.addBombSiteMarker(map.bombSite);
  }

  private addBombSiteMarker(site: SiteBounds): void {
    if (!this.scene) return;
    const geometry = createBombSiteMarkerGeometry(site);
    const outlineMaterial = new THREE.LineBasicMaterial({
      color: 0xff3347,
      transparent: true,
      opacity: 0.98,
    });
    const marker = new THREE.Group();
    marker.name = 'bomb-site-marker';
    marker.add(new THREE.LineSegments(geometry.outline, outlineMaterial));
    this.scene.add(marker);
    this.bombSiteMarker = marker;
    this.disposableGeometries.push(geometry.outline);
    this.disposableMaterials.push(outlineMaterial);

    if (new URLSearchParams(window.location.search).get('qa') === '1') {
      window.__THREE_BOMB_SITE_MARKER__ = {
        visible: marker.visible,
        center: { x: site.center.x, z: site.center.z },
        size: { x: site.halfExtents.x * 2, z: site.halfExtents.z * 2 },
        fillOpacity: 0,
        outlineColor: outlineMaterial.color.getHex(),
      };
    }
  }

  private addLighting(): void {
    if (!this.scene) return;
    this.scene.add(new THREE.HemisphereLight(0xdaf5ff, 0x80654b, 2.35));
    const sun = new THREE.DirectionalLight(0xfff0c2, 3);
    sun.position.set(28, 34, 18);
    this.scene.add(sun);
  }

  private addEnvironmentArt(): void {
    if (!this.scene) return;
    this.addSkyArt();
    this.addGraffitiArt();
  }

  private addSkyArt(): void {
    if (!this.scene) return;
    const sunGeometry = new THREE.SphereGeometry(5.8, 18, 12);
    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffe584, fog: false });
    const sunDisc = new THREE.Mesh(sunGeometry, sunMaterial);
    sunDisc.name = 'sky-sun';
    sunDisc.position.set(48, 42, -122);
    this.scene.add(sunDisc);
    this.disposableGeometries.push(sunGeometry);
    this.disposableMaterials.push(sunMaterial);

    const cloudGeometry = new THREE.IcosahedronGeometry(1, 1);
    const cloudMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      fog: false,
    });
    const cloudShadowMaterial = new THREE.MeshBasicMaterial({
      color: 0xd8eef7,
      transparent: true,
      opacity: 0.78,
      fog: false,
    });
    const cloudPlans = [
      { x: -42, y: 24, z: -96, scale: 1.2 },
      { x: 10, y: 31, z: -145, scale: 1.45 },
      { x: 54, y: 20, z: -88, scale: 1.05 },
      { x: -58, y: 27, z: 105, scale: 1.3 },
    ];
    for (const [cloudIndex, plan] of cloudPlans.entries()) {
      const cloud = new THREE.Group();
      cloud.name = `sky-cloud-${cloudIndex + 1}`;
      for (const [partIndex, part] of ([
        { x: -3.2, y: 0, scale: [3.9, 1.35, 1.3] },
        { x: 0, y: 0.7, scale: [4.8, 2.05, 1.55] },
        { x: 3.7, y: -0.05, scale: [3.5, 1.25, 1.2] },
        { x: 0.9, y: -0.72, scale: [5.4, 0.85, 1.35] },
      ] as const).entries()) {
        const puff = new THREE.Mesh(
          cloudGeometry,
          partIndex === 3 ? cloudShadowMaterial : cloudMaterial,
        );
        puff.position.set(part.x, part.y, partIndex === 3 ? 0.25 : 0);
        puff.scale.set(part.scale[0], part.scale[1], part.scale[2]);
        cloud.add(puff);
      }
      cloud.position.set(plan.x, plan.y, plan.z);
      cloud.scale.setScalar(plan.scale);
      this.scene.add(cloud);
    }
    this.disposableGeometries.push(cloudGeometry);
    this.disposableMaterials.push(cloudMaterial, cloudShadowMaterial);
  }

  private addGraffitiArt(): void {
    if (!this.scene) return;
    const panels = [
      { x: -16.47, y: 2.45, z: 19, rotationY: Math.PI / 2, label: 'BORDER', colors: ['#ffcf4a', '#ff4f79'] },
      { x: -16.47, y: 2.35, z: -16, rotationY: Math.PI / 2, label: 'A  ←', colors: ['#4ff1d0', '#ffe266'] },
      { x: 16.47, y: 2.45, z: 8, rotationY: -Math.PI / 2, label: 'NO FEAR', colors: ['#69d7ff', '#ff6d3d'] },
      { x: 16.47, y: 2.35, z: -25, rotationY: -Math.PI / 2, label: 'RUSH', colors: ['#ff75d8', '#75ff79'] },
      { x: -7.2, y: 2.4, z: -46.47, rotationY: 0, label: 'STATION', colors: ['#ffd75f', '#70d9ff'] },
      { x: 7.5, y: 2.35, z: 46.47, rotationY: Math.PI, label: 'GO!', colors: ['#ff5b5b', '#ffe781'] },
    ] as const;
    const geometry = new THREE.PlaneGeometry(7.8, 3.35);
    this.disposableGeometries.push(geometry);
    for (const [index, panel] of panels.entries()) {
      const texture = this.createGraffitiTexture(panel.label, panel.colors[0], panel.colors[1]);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `wall-graffiti-${index + 1}`;
      mesh.position.set(panel.x, panel.y, panel.z);
      mesh.rotation.y = panel.rotationY;
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      this.disposableTextures.push(texture);
      this.disposableMaterials.push(material);
    }
  }

  private createGraffitiTexture(label: string, primary: string, secondary: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to create graffiti canvas');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.globalAlpha = 0.88;
    context.fillStyle = 'rgba(14, 24, 30, 0.42)';
    context.fillRect(10, 35, 492, 185);
    context.globalAlpha = 1;
    context.strokeStyle = secondary;
    context.lineWidth = 20;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(35, 198);
    context.bezierCurveTo(138, 80, 338, 244, 476, 74);
    context.stroke();
    context.strokeStyle = 'rgba(255,255,255,0.82)';
    context.lineWidth = 13;
    context.font = '900 72px Arial Black, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.strokeText(label, 256, 130);
    context.fillStyle = primary;
    context.fillText(label, 256, 130);
    context.fillStyle = secondary;
    for (const [x, y, radius] of ([
      [44, 54, 9], [86, 219, 6], [438, 205, 8], [474, 42, 5], [386, 61, 4],
    ] as const)) {
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, this.renderer?.capabilities.getMaxAnisotropy() ?? 1);
    texture.needsUpdate = true;
    return texture;
  }
}
