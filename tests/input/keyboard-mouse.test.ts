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

it('exposes held-state reset for pause and pointer-lock loss', () => {
  const input = new KeyboardMouseInput(document);
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR' }));
  document.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));

  input.resetHeldState();

  expect(input.sample()).toMatchObject({ moveZ: 0, reload: false, fire: false });
  input.dispose();
});

it('maps number keys to rifle and pistol command slots', () => {
  const input = new KeyboardMouseInput(document);

  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit2' }));
  expect(input.sample().slot).toBe(2);
  document.dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit2' }));
  document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1' }));
  expect(input.sample().slot).toBe(1);

  input.dispose();
});
