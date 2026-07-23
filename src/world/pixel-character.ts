import * as THREE from 'three';
import type { Team } from '../core/types';

export interface PixelCharacter {
  group: THREE.Group;
  primaryMaterial: THREE.MeshStandardMaterial;
  diagnostics: { parts: number; geometries: number; materials: number };
  dispose(): void;
}

interface PixelPart {
  name: string;
  position: readonly [number, number, number];
  scale: readonly [number, number, number];
  material: 'primary' | 'secondary' | 'skin' | 'dark' | 'visor' | 'white';
}

const PARTS: readonly PixelPart[] = [
  { name: 'pixel-left-boot', position: [-0.14, -0.72, -0.04], scale: [0.20, 0.16, 0.30], material: 'dark' },
  { name: 'pixel-right-boot', position: [0.14, -0.72, -0.04], scale: [0.20, 0.16, 0.30], material: 'dark' },
  { name: 'pixel-left-leg', position: [-0.14, -0.45, 0], scale: [0.18, 0.40, 0.20], material: 'secondary' },
  { name: 'pixel-right-leg', position: [0.14, -0.45, 0], scale: [0.18, 0.40, 0.20], material: 'secondary' },
  { name: 'pixel-pelvis', position: [0, -0.20, 0], scale: [0.43, 0.18, 0.24], material: 'dark' },
  { name: 'pixel-torso', position: [0, 0.08, 0], scale: [0.48, 0.46, 0.28], material: 'primary' },
  { name: 'pixel-left-arm', position: [-0.32, 0.08, -0.02], scale: [0.16, 0.44, 0.18], material: 'primary' },
  { name: 'pixel-right-arm', position: [0.32, 0.08, -0.02], scale: [0.16, 0.44, 0.18], material: 'primary' },
  { name: 'pixel-left-hand', position: [-0.32, -0.15, -0.02], scale: [0.15, 0.13, 0.16], material: 'skin' },
  { name: 'pixel-right-hand', position: [0.32, -0.15, -0.02], scale: [0.15, 0.13, 0.16], material: 'skin' },
  { name: 'pixel-head', position: [0, 0.52, 0], scale: [0.40, 0.40, 0.38], material: 'skin' },
  { name: 'pixel-helmet', position: [0, 0.71, 0.01], scale: [0.44, 0.11, 0.42], material: 'primary' },
  { name: 'pixel-visor', position: [0, 0.55, -0.20], scale: [0.25, 0.08, 0.035], material: 'visor' },
  { name: 'pixel-rifle', position: [0.20, -0.05, -0.29], scale: [0.13, 0.14, 0.58], material: 'dark' },
  { name: 'pixel-rifle-barrel', position: [0.20, -0.05, -0.67], scale: [0.07, 0.07, 0.28], material: 'dark' },
  { name: 'pixel-muzzle', position: [0.20, -0.05, -0.83], scale: [0.09, 0.09, 0.07], material: 'white' },
];

export function createPixelCharacter(team: Team): PixelCharacter {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const materials = {
    primary: new THREE.MeshStandardMaterial({
      color: team === 'attack' ? 0xe28b34 : 0x39a8d1,
      roughness: 0.78,
      flatShading: true,
    }),
    secondary: new THREE.MeshStandardMaterial({
      color: team === 'attack' ? 0x805024 : 0x245f79,
      roughness: 0.85,
      flatShading: true,
    }),
    skin: new THREE.MeshStandardMaterial({ color: 0xd8aa79, roughness: 0.9 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x18232c, roughness: 0.7, metalness: 0.18 }),
    visor: new THREE.MeshStandardMaterial({
      color: team === 'attack' ? 0xffd27c : 0x9af1ff,
      emissive: team === 'attack' ? 0x5a2b00 : 0x003846,
      emissiveIntensity: 0.45,
      roughness: 0.28,
    }),
    white: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  };
  const group = new THREE.Group();
  group.name = `pixel-character-${team}`;
  for (const part of PARTS) {
    const mesh = new THREE.Mesh(geometry, materials[part.material]);
    mesh.name = part.name;
    mesh.position.set(...part.position);
    mesh.scale.set(...part.scale);
    mesh.castShadow = true;
    group.add(mesh);
  }
  return {
    group,
    primaryMaterial: materials.primary,
    diagnostics: { parts: PARTS.length, geometries: 1, materials: Object.keys(materials).length },
    dispose() {
      group.removeFromParent();
      geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
    },
  };
}
