import { expect, it } from 'vitest';
import { KeyboardMouseInput } from '../../src/input/keyboard-mouse';

it('maps W and D to a normalized command axis', () => {
  const input = new KeyboardMouseInput(document);
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
  expect(input.sample()).toMatchObject({ moveX: 1, moveZ: -1 });
  input.dispose();
});

it('clears held controls when the window loses focus', () => {
  const input = new KeyboardMouseInput(document);
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));

  window.dispatchEvent(new Event('blur'));

  expect(input.sample()).toMatchObject({
    moveX: 0,
    moveZ: 0,
    jump: false,
    fire: false,
  });
  input.dispose();
});
