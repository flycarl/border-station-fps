import { expect, it } from 'vitest';
import { createPixelCharacter } from '../../src/world/pixel-character';

it('builds a readable voxel character from named pixel-box body parts', () => {
  const character = createPixelCharacter('attack');
  try {
    expect(character.group.name).toBe('pixel-character-attack');
    expect(character.group.getObjectByName('pixel-head')).toBeDefined();
    expect(character.group.getObjectByName('pixel-torso')).toBeDefined();
    expect(character.group.getObjectByName('pixel-left-leg')).toBeDefined();
    expect(character.group.getObjectByName('pixel-right-leg')).toBeDefined();
    expect(character.group.getObjectByName('pixel-rifle')).toBeDefined();
    expect(character.diagnostics.parts).toBeGreaterThanOrEqual(12);
    expect(character.diagnostics.geometries).toBe(1);
  } finally {
    character.dispose();
  }
});

it('uses distinct team palettes while keeping the same pixel silhouette', () => {
  const attack = createPixelCharacter('attack');
  const defense = createPixelCharacter('defense');
  try {
    expect(attack.diagnostics.parts).toBe(defense.diagnostics.parts);
    expect(attack.primaryMaterial.color.getHex())
      .not.toBe(defense.primaryMaterial.color.getHex());
  } finally {
    attack.dispose();
    defense.dispose();
  }
});
