import * as THREE from 'three';
import type { WeaponId } from './weapon-data';

export interface FirstPersonWeaponState {
  weaponId: WeaponId;
  movement: number;
  fired: boolean;
  reloading: boolean;
  alive: boolean;
  paused: boolean;
}

export interface FirstPersonWeaponDiagnostics {
  visible: boolean;
  weaponId: WeaponId;
  rootPosition: { x: number; y: number; z: number };
  weaponOffset: { x: number; y: number; z: number };
  weaponRotation: { x: number; y: number; z: number };
}

const BASE_POSITION = new THREE.Vector3(0.36, -0.32, -0.68);

function prepareMaterial(material: THREE.Material): THREE.Material {
  material.depthTest = false;
  material.depthWrite = false;
  return material;
}

function addMesh(
  parent: THREE.Object3D,
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.renderOrder = 100;
  mesh.frustumCulled = false;
  parent.add(mesh);
  return mesh;
}

function createRifle(materials: WeaponMaterials): THREE.Group {
  const rifle = new THREE.Group();
  rifle.name = 'rifle';

  addMesh(rifle, 'rifle-receiver', new THREE.BoxGeometry(0.18, 0.14, 0.36), materials.body,
    [0, 0, -0.18], [-0.03, 0, 0]);
  addMesh(rifle, 'rifle-upper', new THREE.BoxGeometry(0.15, 0.055, 0.42), materials.trim,
    [0, 0.09, -0.19]);
  addMesh(rifle, 'rifle-handguard', new THREE.BoxGeometry(0.13, 0.12, 0.42), materials.body,
    [0, 0.005, -0.55], [0.02, 0, 0]);
  addMesh(rifle, 'rifle-barrel', new THREE.CylinderGeometry(0.022, 0.028, 0.38, 10), materials.metal,
    [0, 0.025, -0.92], [Math.PI / 2, 0, 0]);
  addMesh(rifle, 'rifle-muzzle', new THREE.CylinderGeometry(0.038, 0.032, 0.12, 10), materials.dark,
    [0, 0.025, -1.12], [Math.PI / 2, 0, 0]);
  addMesh(rifle, 'rifle-magazine', new THREE.BoxGeometry(0.11, 0.27, 0.13), materials.dark,
    [0, -0.19, -0.25], [-0.16, 0, 0]);
  addMesh(rifle, 'rifle-grip', new THREE.BoxGeometry(0.1, 0.23, 0.11), materials.grip,
    [0, -0.18, -0.04], [-0.25, 0, 0]);
  addMesh(rifle, 'rifle-stock', new THREE.BoxGeometry(0.15, 0.14, 0.32), materials.body,
    [0, -0.015, 0.18], [0.1, 0, 0]);
  addMesh(rifle, 'rifle-optic', new THREE.BoxGeometry(0.1, 0.085, 0.17), materials.dark,
    [0, 0.155, -0.22]);
  addMesh(rifle, 'rifle-sight', new THREE.BoxGeometry(0.022, 0.025, 0.025), materials.signal,
    [0, 0.168, -0.315]);
  addMesh(rifle, 'rifle-side-rail', new THREE.BoxGeometry(0.018, 0.045, 0.34), materials.trim,
    [0.075, 0.02, -0.54]);

  const firingHand = addMesh(rifle, 'firing-hand', new THREE.CapsuleGeometry(0.075, 0.16, 4, 8), materials.skin,
    [0.04, -0.26, 0.04], [0.45, 0, -0.18]);
  firingHand.scale.set(0.9, 1, 0.85);
  const supportHand = addMesh(rifle, 'support-hand', new THREE.CapsuleGeometry(0.075, 0.17, 4, 8), materials.skin,
    [-0.02, -0.12, -0.53], [Math.PI / 2, 0, 0.3]);
  supportHand.scale.set(0.9, 1, 0.85);
  return rifle;
}

function createPistol(materials: WeaponMaterials): THREE.Group {
  const pistol = new THREE.Group();
  pistol.name = 'pistol';
  pistol.position.set(0.02, -0.02, -0.06);

  addMesh(pistol, 'pistol-slide', new THREE.BoxGeometry(0.13, 0.105, 0.42), materials.metal,
    [0, 0.06, -0.32]);
  addMesh(pistol, 'pistol-frame', new THREE.BoxGeometry(0.12, 0.1, 0.3), materials.body,
    [0, -0.025, -0.25]);
  addMesh(pistol, 'pistol-barrel', new THREE.CylinderGeometry(0.022, 0.022, 0.16, 10), materials.dark,
    [0, 0.067, -0.6], [Math.PI / 2, 0, 0]);
  addMesh(pistol, 'pistol-grip', new THREE.BoxGeometry(0.11, 0.27, 0.14), materials.grip,
    [0, -0.18, -0.14], [-0.2, 0, 0]);
  addMesh(pistol, 'pistol-sight', new THREE.BoxGeometry(0.025, 0.025, 0.035), materials.signal,
    [0, 0.13, -0.48]);
  addMesh(pistol, 'pistol-hand', new THREE.CapsuleGeometry(0.08, 0.18, 4, 8), materials.skin,
    [0.035, -0.25, -0.06], [0.35, 0, -0.12]);
  return pistol;
}

interface WeaponMaterials {
  body: THREE.MeshStandardMaterial;
  trim: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  grip: THREE.MeshStandardMaterial;
  signal: THREE.MeshStandardMaterial;
  skin: THREE.MeshStandardMaterial;
}

function createMaterials(): WeaponMaterials {
  return {
    body: prepareMaterial(new THREE.MeshStandardMaterial({ color: 0x314754, roughness: 0.48, metalness: 0.62 })) as THREE.MeshStandardMaterial,
    trim: prepareMaterial(new THREE.MeshStandardMaterial({ color: 0x728a92, roughness: 0.32, metalness: 0.78 })) as THREE.MeshStandardMaterial,
    metal: prepareMaterial(new THREE.MeshStandardMaterial({ color: 0x171d21, roughness: 0.24, metalness: 0.9 })) as THREE.MeshStandardMaterial,
    dark: prepareMaterial(new THREE.MeshStandardMaterial({ color: 0x10161a, roughness: 0.4, metalness: 0.72 })) as THREE.MeshStandardMaterial,
    grip: prepareMaterial(new THREE.MeshStandardMaterial({ color: 0x202a2f, roughness: 0.92, metalness: 0.08 })) as THREE.MeshStandardMaterial,
    signal: prepareMaterial(new THREE.MeshStandardMaterial({ color: 0x8fe8ff, emissive: 0x2b91a8, emissiveIntensity: 2.2 })) as THREE.MeshStandardMaterial,
    skin: prepareMaterial(new THREE.MeshStandardMaterial({ color: 0xb78361, roughness: 0.86 })) as THREE.MeshStandardMaterial,
  };
}

export class FirstPersonWeaponRig {
  readonly root = new THREE.Group();
  private readonly rifle: THREE.Group;
  private readonly pistol: THREE.Group;
  private time = 0;
  private recoil = 0;
  private reloadBlend = 0;
  private weaponId: WeaponId = 'vanguard-rifle';

  constructor() {
    const materials = createMaterials();
    this.root.name = 'first-person-weapon';
    this.root.position.copy(BASE_POSITION);
    this.root.rotation.order = 'YXZ';
    this.rifle = createRifle(materials);
    this.pistol = createPistol(materials);
    this.root.add(this.rifle, this.pistol);
    this.pistol.visible = false;
  }

  update(state: FirstPersonWeaponState, dt: number): void {
    const step = Math.max(0, Math.min(dt, 0.1));
    this.root.visible = state.alive;
    this.weaponId = state.weaponId;
    this.rifle.visible = state.weaponId === 'vanguard-rifle';
    this.pistol.visible = state.weaponId === 'sidearm-9';
    if (!state.alive) return;

    this.time += step * (state.movement > 0.05 ? 10 : 2);
    if (state.fired) this.recoil = 1;
    else this.recoil = Math.max(0, this.recoil - step * 9);
    const reloadTarget = state.reloading ? 1 : 0;
    this.reloadBlend += (reloadTarget - this.reloadBlend) * (1 - Math.exp(-step * 10));

    const motionScale = state.paused ? 0 : Math.min(1, Math.max(0, state.movement));
    const swayX = Math.sin(this.time * 8) * 0.02 * motionScale;
    const swayY = Math.abs(Math.cos(this.time * 8)) * 0.013 * motionScale;
    this.root.position.set(
      BASE_POSITION.x + swayX,
      BASE_POSITION.y - swayY - this.reloadBlend * 0.08,
      BASE_POSITION.z,
    );
    this.root.rotation.set(
      -0.035 - this.recoil * 0.07 + this.reloadBlend * 0.18,
      -0.045 + swayX * 0.8,
      -0.025 - this.reloadBlend * 0.18,
    );

    for (const weapon of [this.rifle, this.pistol]) {
      weapon.position.z = this.recoil * 0.09;
      weapon.position.y = this.recoil * -0.025;
      weapon.rotation.x = this.recoil * -0.08;
      weapon.rotation.z = -this.reloadBlend * 0.65;
    }
    this.pistol.position.x = 0.02;
    this.pistol.position.y += -0.02;
    this.pistol.position.z += -0.06;
  }

  diagnostics(): FirstPersonWeaponDiagnostics {
    const weapon = this.weaponId === 'sidearm-9' ? this.pistol : this.rifle;
    return {
      visible: this.root.visible,
      weaponId: this.weaponId,
      rootPosition: {
        x: this.root.position.x,
        y: this.root.position.y,
        z: this.root.position.z,
      },
      weaponOffset: {
        x: weapon.position.x,
        y: weapon.position.y,
        z: weapon.position.z,
      },
      weaponRotation: {
        x: weapon.rotation.x,
        y: weapon.rotation.y,
        z: weapon.rotation.z,
      },
    };
  }

  dispose(): void {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const ownedMaterials = Array.isArray(object.material) ? object.material : [object.material];
      ownedMaterials.forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }
}
