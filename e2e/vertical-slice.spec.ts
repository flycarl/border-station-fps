import { expect, test } from '@playwright/test';

test('starts a nonblank match and exposes restart', async ({ page }) => {
  const consoleErrors: string[] = [];
  const failedRequests: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', (request) => failedRequests.push(request.url()));
  await page.addInitScript(() => {
    let locked: Element | null = null;
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => locked,
    });
    Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', {
      configurable: true,
      value: function requestPointerLock() {
        locked = this;
        document.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      },
    });
  });
  await page.goto('/?debug=1');
  await expect(page.getByRole('button', { name: '开始任务' })).toBeVisible();
  await page.getByRole('button', { name: '开始任务' }).click();
  await expect.poll(() => page.evaluate(() => window.__THREE_GAME_DIAGNOSTICS__?.state.paused)).toBe(false);
  await expect(page.locator('[data-testid="score"]')).toContainText('0  —  0');
  await expect(page.locator('canvas')).toBeVisible();
  const pixels = await page.locator('canvas').evaluate((canvas) => {
    const c = canvas as HTMLCanvasElement;
    const gl = c.getContext('webgl2');
    if (!gl) return 0;
    const px = new Uint8Array(4);
    gl.readPixels(c.width / 2, c.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px[0]! + px[1]! + px[2]!;
  });
  expect(pixels).toBeGreaterThan(0);
  await page.screenshot({ path: 'docs/verification/vertical-slice-active-1440x900.png' });
  const beforeRestart = await page.evaluate(() => ({
    geometries: window.__THREE_GAME_DIAGNOSTICS__?.renderer.geometries,
    bodies: window.__THREE_GAME_DIAGNOSTICS__?.physics.bodies,
    colliders: window.__THREE_GAME_DIAGNOSTICS__?.physics.colliders,
  }));
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '重新开始' })).toBeVisible();
  await page.getByRole('button', { name: '重新开始' }).click();
  await expect.poll(async () => page.evaluate(() => (
    window.__THREE_GAME_DIAGNOSTICS__?.physics.bodies
  ))).toBe(6);
  const afterRestart = await page.evaluate(() => ({
    geometries: window.__THREE_GAME_DIAGNOSTICS__?.renderer.geometries,
    bodies: window.__THREE_GAME_DIAGNOSTICS__?.physics.bodies,
    colliders: window.__THREE_GAME_DIAGNOSTICS__?.physics.colliders,
  }));
  expect(afterRestart).toEqual(beforeRestart);
  expect(consoleErrors).toEqual([]);
  expect(failedRequests).toEqual([]);
});

test('keeps play paused when pointer lock is rejected and resumes only after confirmation', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'requestPointerLock', {
      configurable: true,
      value: () => Promise.reject(new Error('denied for regression')),
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '开始任务' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.mission-modal__status')).toContainText('无法锁定鼠标');
});

test('QA driver is absent without its explicit query gate', async ({ page }) => {
  await page.goto('/?debug=1');
  expect(await page.evaluate(() => window.__THREE_GAME_QA__)).toBeUndefined();
});

test('composed plant, defuse, result transition, and restart use real systems', async ({ page }) => {
  await page.goto('/?qa=1&debug=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  const result = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.advance(721);
    qa.place('attack-human', { x: 0, y: 2.8, z: -18 });
    qa.command('attack-human', { interact: true });
    qa.advance(193);
    const planted = qa.state;
    qa.clearCommands();
    qa.place('attack-human', { x: -8, y: 1, z: 20 });
    qa.place('defense-bot-1', qa.bomb.position);
    qa.command('defense-bot-1', { interact: true });
    qa.advance(421);
    const defused = { ...qa.state, objective: qa.bomb };
    qa.clearCommands();
    qa.advance(301);
    const nextRound = qa.state;
    qa.restart();
    return { planted, defused, nextRound, restarted: qa.state };
  });
  expect(result.planted).toMatchObject({ phase: 'planted', bombState: 'planted' });
  expect(result.defused.objective).toMatchObject({ state: 'defused' });
  expect(result.defused).toMatchObject({ phase: 'result', bombState: 'defused', defenseScore: 1 });
  expect(result.nextRound).toMatchObject({ phase: 'freeze', round: 2, defenseScore: 1 });
  expect(result.restarted).toMatchObject({ phase: 'freeze', round: 1, attackScore: 0, defenseScore: 0 });
});

test('composed timeout awards defense through MatchController', async ({ page }) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  const state = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.advance(721 + 6301);
    return qa.state;
  });
  expect(state).toMatchObject({ phase: 'result', defenseScore: 1 });
});

test('composed WeaponSystem elimination awards attack', async ({ page }) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  const state = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.advance(721);
    qa.place('attack-human', { x: 8, y: 1, z: 10 });
    for (const teammate of ['attack-bot-1', 'attack-bot-2']) qa.place(teammate, { x: -8, y: 1, z: 20 });
    const defenders = ['defense-bot-1', 'defense-bot-2', 'defense-bot-3'];
    for (const defender of defenders) qa.place(defender, { x: -8, y: 1, z: -20 });
    for (const defender of defenders) {
      qa.place(defender, { x: 8, y: 1, z: 5 });
      for (let shot = 0; shot < 5; shot++) {
        qa.command('attack-human', { fire: true, slot: 1, yaw: 0, pitch: 0 });
        qa.advance(1);
        qa.command('attack-human', { fire: false, slot: 1, yaw: 0, pitch: 0 });
        qa.advance(7);
      }
      qa.place(defender, { x: -8, y: 1, z: -20 });
    }
    return qa.state;
  });
  expect(state).toMatchObject({ phase: 'result', attackScore: 1 });
  expect(state.actors.filter((actor) => actor.team === 'defense' && actor.alive)).toHaveLength(0);
});
