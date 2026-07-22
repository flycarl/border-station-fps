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

export interface PlayerHealthBar {
  group: THREE.Group;
  fill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  fillMaterial: THREE.MeshBasicMaterial;
  healthFraction: number;
  dispose(): void;
}

export function createPlayerHealthBar(): PlayerHealthBar {
  const group = new THREE.Group();
  group.name = 'player-health-bar';
  group.visible = false;
  group.renderOrder = 20;
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
  group.add(background, fill);
  const bar: PlayerHealthBar = {
    group,
    fill,
    fillMaterial,
    healthFraction: 1,
    dispose() {
      group.removeFromParent();
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
  private readonly playerBodies = new Map<EntityId, RAPIER.RigidBody>();
  private readonly inactivePlayers = new Set<EntityId>();
  private readonly playerMeshes = new Map<EntityId, THREE.Mesh>();
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
    renderer.setClearColor(0x172733);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 300);
    camera.rotation.order = 'YXZ';
    const physicsWorld = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const runtime = new WorldRuntime(canvas, renderer, scene, camera, physicsWorld);

    runtime.firstPersonWeapon = new FirstPersonWeaponRig();
    camera.add(runtime.firstPersonWeapon.root);
    scene.add(camera);

    runtime.buildGraybox();
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
      const geometry = new THREE.CapsuleGeometry(PLAYER_RADIUS, PLAYER_HALF_HEIGHT * 2, 4, 8);
      const material = new THREE.MeshStandardMaterial({
        color: entityId.startsWith('attack') ? 0xd89042 : 0x55a7c4,
        roughness: 0.72,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = true;
      mesh.visible = entityId !== 'attack-human';
      mesh.position.set(position.x, position.y, position.z);
      this.scene.add(mesh);
      this.playerMeshes.set(entityId, mesh);
      if (entityId !== 'attack-human') {
        const healthBar = createPlayerHealthBar();
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
    const mesh = this.playerMeshes.get(entityId);
    if (mesh) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    }
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
    if (mesh) mesh.visible = active && entityId !== 'attack-human';
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
      meshVisible: this.playerMeshes.get(entityId)?.visible ?? false,
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
    for (const [entityId, mesh] of this.playerMeshes) {
      const body = this.playerBodies.get(entityId);
      if (!body) continue;
      const position = body.translation();
      mesh.position.set(position.x, position.y, position.z);
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
    this.scene.add(new THREE.HemisphereLight(0xbfd9e8, 0x8b6b42, 2.2));
    const sun = new THREE.DirectionalLight(0xfff1d0, 2.6);
    sun.position.set(8, 18, 12);
    this.scene.add(sun);
  }
}
