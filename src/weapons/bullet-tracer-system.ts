import * as THREE from 'three';
import type { Team, Vec3 } from '../core/types';

const TRACER_LIFETIME = 0.12;
const TRAIL_LENGTH = 3.5;

interface ActiveTracer {
  group: THREE.Group;
  head: THREE.Mesh;
  trail: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  start: THREE.Vector3;
  end: THREE.Vector3;
  team: Team;
  age: number;
}

export interface BulletTracerDiagnostics {
  active: number;
  bullets: Array<{ team: Team; progress: number }>;
}

export class BulletTracerSystem {
  private readonly active: ActiveTracer[] = [];
  private readonly headGeometry = new THREE.BoxGeometry(0.04, 0.04, 0.04);
  private readonly headMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.98,
  });
  private readonly trailMaterials: Record<Team, THREE.LineBasicMaterial> = {
    attack: new THREE.LineBasicMaterial({ color: 0xffc46f, transparent: true, opacity: 0.9 }),
    defense: new THREE.LineBasicMaterial({ color: 0x8deeff, transparent: true, opacity: 0.9 }),
  };
  private disposed = false;

  constructor(private readonly scene: THREE.Scene | null) {}

  spawn(start: Vec3, end: Vec3, team: Team): void {
    if (this.disposed) return;
    const group = new THREE.Group();
    group.name = `bullet-tracer-${team}`;
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute('position', new THREE.Float32BufferAttribute(6, 3));
    const trail = new THREE.Line(trailGeometry, this.trailMaterials[team]);
    const head = new THREE.Mesh(this.headGeometry, this.headMaterial);
    trail.frustumCulled = false;
    head.frustumCulled = false;
    group.add(trail, head);
    this.scene?.add(group);
    const tracer: ActiveTracer = {
      group,
      head,
      trail,
      start: new THREE.Vector3(start.x, start.y, start.z),
      end: new THREE.Vector3(end.x, end.y, end.z),
      team,
      age: 0,
    };
    this.active.push(tracer);
    this.positionTracer(tracer, 0);
  }

  update(dt: number): void {
    for (let index = this.active.length - 1; index >= 0; index--) {
      const tracer = this.active[index];
      if (!tracer) continue;
      tracer.age += Math.max(0, dt);
      if (tracer.age >= TRACER_LIFETIME) {
        tracer.group.removeFromParent();
        tracer.trail.geometry.dispose();
        this.active.splice(index, 1);
        continue;
      }
      this.positionTracer(tracer, tracer.age / TRACER_LIFETIME);
    }
  }

  diagnostics(): BulletTracerDiagnostics {
    return {
      active: this.active.length,
      bullets: this.active.map(({ team, age }) => ({
        team,
        progress: Math.min(1, age / TRACER_LIFETIME),
      })),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const tracer of this.active) {
      tracer.group.removeFromParent();
      tracer.trail.geometry.dispose();
    }
    this.active.length = 0;
    this.headGeometry.dispose();
    this.headMaterial.dispose();
    this.trailMaterials.attack.dispose();
    this.trailMaterials.defense.dispose();
  }

  private positionTracer(tracer: ActiveTracer, progress: number): void {
    const travel = tracer.start.distanceTo(tracer.end);
    const headPosition = tracer.start.clone().lerp(tracer.end, progress);
    const tailProgress = Math.max(0, progress - TRAIL_LENGTH / Math.max(travel, 0.001));
    const tailPosition = tracer.start.clone().lerp(tracer.end, tailProgress);
    tracer.head.position.copy(headPosition);
    const positions = tracer.trail.geometry.getAttribute('position') as THREE.BufferAttribute;
    positions.setXYZ(0, tailPosition.x, tailPosition.y, tailPosition.z);
    positions.setXYZ(1, headPosition.x, headPosition.y, headPosition.z);
    positions.needsUpdate = true;
    tracer.trail.geometry.computeBoundingSphere();
  }
}
