import { expect, it, vi } from 'vitest';
import { StartScreen } from '../../src/ui/start-screen';

it('renders a deliberate start modal and pause actions', () => {
  const root = document.createElement('div');
  const onStart = vi.fn();
  const onRestart = vi.fn();
  const screen = new StartScreen(root, onStart, onRestart);

  expect(root.querySelector('button')?.textContent).toBe('开始任务');
  expect(root.textContent).toContain('WASD / 鼠标 / E / R');
  root.querySelector<HTMLButtonElement>('button')?.click();
  expect(onStart).toHaveBeenCalledOnce();

  screen.setPaused(true);
  const buttons = [...root.querySelectorAll('button')];
  expect(buttons.map((button) => button.textContent)).toEqual(['继续', '重新开始']);
  buttons[1]?.click();
  expect(onRestart).toHaveBeenCalledOnce();
});

it('removes its modal and listeners on dispose', () => {
  const root = document.createElement('div');
  const screen = new StartScreen(root, () => {}, () => {});

  screen.dispose();

  expect(root.childElementCount).toBe(0);
});
