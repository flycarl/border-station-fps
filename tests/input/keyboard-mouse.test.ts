import { expect, it } from 'vitest';
import { KeyboardMouseInput } from '../../src/input/keyboard-mouse';

it('maps W and D to a normalized command axis', () => {
  const input = new KeyboardMouseInput(document);
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
  expect(input.sample()).toMatchObject({ moveX: 1, moveZ: -1 });
  input.dispose();
});
