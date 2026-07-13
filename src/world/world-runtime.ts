import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Vec3 } from '../core/types';
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
  private disposed = false;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.PerspectiveCamera,
    private readonly physicsWorld: RAPIER.World,
  ) {}

  static async create(canvas: HTMLCanvasElement): Promise<WorldRuntime> {
    await initializeRapier();

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
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

  spawnPlayer(position: Vec3): RAPIER.RigidBody {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      .lockRotations()
      .setLinearDamping(PLAYER_LINEAR_DAMPING);
    const body = this.physicsWorld.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS);
    this.physicsWorld.createCollider(colliderDesc, body);
    return body;
  }

  raycast(origin: Vec3, direction: Vec3, maxDistance: number): RayHit | null {
    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (length === 0 || maxDistance < 0) return null;

    const normalizedDirection = {
      x: direction.x / length,
      y: direction.y / length,
      z: direction.z / length,
    };
    const ray = new RAPIER.Ray(origin, normalizedDirection);
    const hit = this.physicsWorld.castRay(ray, maxDistance, true);
    if (!hit) return null;

    const point = ray.pointAt(hit.timeOfImpact);
    return {
      entityId: this.colliderEntityIds.get(hit.collider.handle) ?? null,
      distance: hit.timeOfImpact,
      point: { x: point.x, y: point.y, z: point.z },
    };
  }

  render(cameraPose: CameraPose): void {
    applyCameraPose(this.camera, cameraPose);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    window.removeEventListener('resize', this.resize);
    for (const geometry of this.disposableGeometries) geometry.dispose();
    for (const material of this.disposableMaterials) material.dispose();
    this.physicsWorld.free();
    this.renderer.dispose();
  }

  private readonly resize = (): void => {
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
    this.scene.add(new THREE.HemisphereLight(0xbfd9e8, 0x8b6b42, 2.2));
    const sun = new THREE.DirectionalLight(0xfff1d0, 2.6);
    sun.position.set(8, 18, 12);
    this.scene.add(sun);
  }
}
