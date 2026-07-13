import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { EntityId, Vec3 } from '../core/types';
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

export interface WorldDiagnostics {
  engine: 'rapier';
  timestep: number;
  bodies: number;
  colliders: number;
  sensors: number;
  ccdBodies: number;
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

export function applyCameraPose(camera: THREE.Object3D, cameraPose: CameraPose): void {
  camera.position.set(cameraPose.position.x, cameraPose.position.y, cameraPose.position.z);
  camera.rotation.set(cameraPose.pitch, cameraPose.yaw, 0);
}

export class WorldRuntime {
  private readonly colliderEntityIds = new Map<number, string>();
  private readonly disposableGeometries: THREE.BufferGeometry[] = [];
  private readonly disposableMaterials: THREE.Material[] = [];
  private readonly playerBodies = new Map<EntityId, RAPIER.RigidBody>();
  private readonly playerMeshes = new Map<EntityId, THREE.Mesh>();
  private disposed = false;

  private constructor(
    private readonly canvas: HTMLCanvasElement | null,
    private readonly renderer: THREE.WebGLRenderer | null,
    private readonly scene: THREE.Scene | null,
    private readonly camera: THREE.PerspectiveCamera | null,
    private readonly physicsWorld: RAPIER.World,
  ) {}

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

    runtime.buildGraybox();
    runtime.addLighting();
    runtime.resize();
    window.addEventListener('resize', runtime.resize);

    return runtime;
  }

  static async createHeadless(): Promise<WorldRuntime> {
    await initializeRapier();
    return new WorldRuntime(null, null, null, null, new RAPIER.World({ x: 0, y: -9.81, z: 0 }));
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
    const mesh = this.playerMeshes.get(entityId);
    if (mesh) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) material.dispose();
    }
    this.playerMeshes.delete(entityId);
  }

  step(dt: number): void {
    this.physicsWorld.timestep = dt;
    this.physicsWorld.step();
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
      excludeEntityId === undefined
        ? undefined
        : (collider) => this.colliderEntityIds.get(collider.handle) !== excludeEntityId,
    );
    if (!hit) return null;

    const point = ray.pointAt(hit.timeOfImpact);
    return {
      entityId: this.colliderEntityIds.get(hit.collider.handle) ?? null,
      distance: hit.timeOfImpact,
      point: { x: point.x, y: point.y, z: point.z },
    };
  }

  render(cameraPose: CameraPose): void {
    if (!this.camera || !this.renderer || !this.scene) return;
    for (const [entityId, mesh] of this.playerMeshes) {
      const body = this.playerBodies.get(entityId);
      if (!body) continue;
      const position = body.translation();
      mesh.position.set(position.x, position.y, position.z);
    }
    applyCameraPose(this.camera, cameraPose);
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
      sensors: 0,
      ccdBodies: 0,
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
    if (!this.scene) return;
    const map = createBorderStationGraybox();
    for (const solid of map.solids) {
      const geometry = new THREE.BoxGeometry(solid.size.x, solid.size.y, solid.size.z);
      const material = new THREE.MeshStandardMaterial({ color: colorForSolid(solid) });
      const mesh = new THREE.Mesh(geometry, material);
      const pitch = solid.kind === 'ramp' ? BORDER_STATION_RAMP_PITCH : 0;
      mesh.position.set(solid.center.x, solid.center.y, solid.center.z);
      mesh.rotation.set(pitch, solid.yaw, 0, 'YXZ');
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      const rotation = new THREE.Quaternion().setFromEuler(mesh.rotation);
      const colliderDesc = RAPIER.ColliderDesc.cuboid(
        solid.size.x / 2,
        solid.size.y / 2,
        solid.size.z / 2,
      )
        .setTranslation(solid.center.x, solid.center.y, solid.center.z)
        .setRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
      const collider = this.physicsWorld.createCollider(colliderDesc);
      this.colliderEntityIds.set(collider.handle, solid.id);

      this.disposableGeometries.push(geometry);
      this.disposableMaterials.push(material);
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
