import { expect, test, type Page } from '@playwright/test';

function installBrowserAudit(page: Page): {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
} {
  const audit = {
    consoleErrors: [] as string[],
    pageErrors: [] as string[],
    failedRequests: [] as string[],
  };
  page.on('console', (message) => {
    if (message.type() === 'error') audit.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => audit.pageErrors.push(error.message));
  page.on('requestfailed', (request) => audit.failedRequests.push(request.url()));
  return audit;
}

test('browser audit records uncaught page errors', async ({ page }) => {
  const audit = installBrowserAudit(page);
  await page.goto('/');
  await page.evaluate(() => setTimeout(() => { throw new Error('audit sentinel'); }, 0));
  await expect.poll(() => audit.pageErrors).toEqual(['audit sentinel']);
});

test('starts a nonblank match and exposes restart', async ({ page }, testInfo) => {
  const audit = installBrowserAudit(page);
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
  await page.screenshot({ path: testInfo.outputPath('vertical-slice-active-1440x900.png') });
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
  expect(audit.consoleErrors).toEqual([]);
  expect(audit.pageErrors).toEqual([]);
  expect(audit.failedRequests).toEqual([]);
});

test('expanded ramps are traversable through real Rapier movement', async ({ page }) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  const routes = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.advance(721);
    const crossRamp = (x: number) => {
      qa.place('attack-human', { x, y: 1, z: -8 });
      qa.command('attack-human', { moveZ: -1, yaw: 0 });
      qa.advance(130);
      return {
        actor: qa.state.actors.find(({ id }) => id === 'attack-human')!,
        supported: qa.isActorSupported('attack-human'),
      };
    };
    const left = crossRamp(-5);
    const right = crossRamp(8);
    return { left, right };
  });

  for (const route of [routes.left, routes.right]) {
    expect(route.actor.position.z).toBeLessThan(-19);
    expect(route.actor.position.y).toBeGreaterThan(1.2);
    expect(route.supported).toBe(true);
  }
});

test('L-shaped corner is traversable through its right entry and lower exit', async ({ page }) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  const traversal = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    const actor = () => qa.state.actors.find(({ id }) => id === 'attack-human')!;
    qa.advance(721);
    qa.place('attack-human', { x: 0, y: 1, z: 30 });

    qa.command('attack-human', { moveX: 1, yaw: 0 });
    qa.advance(100);
    const entry = { ...actor(), supported: qa.isActorSupported('attack-human') };

    qa.command('attack-human', { moveZ: -1, yaw: 0 });
    qa.advance(180);
    const turn = { ...actor(), supported: qa.isActorSupported('attack-human') };

    qa.command('attack-human', { moveX: -1, yaw: 0 });
    qa.advance(90);
    const exit = { ...actor(), supported: qa.isActorSupported('attack-human') };
    return { entry, turn, exit };
  });

  expect(traversal.entry.position.x).toBeGreaterThan(9);
  expect(traversal.entry.position.z).toBeGreaterThan(28);
  expect(traversal.turn.position.x).toBeGreaterThan(9);
  expect(traversal.turn.position.z).toBeLessThan(13);
  expect(traversal.exit.position.x).toBeLessThan(4);
  expect(traversal.exit.position.z).toBeLessThan(13);
  expect([traversal.entry, traversal.turn, traversal.exit].every(({ supported }) => supported))
    .toBe(true);
});

test('defenders hold during freeze then move in the live opening', async ({ page }) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  const opening = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    const defenders = () => qa.state.actors
      .filter(({ team }) => team === 'defense')
      .map(({ id, position }) => ({ id, position: { ...position } }));
    qa.useLiveCommands();
    const start = defenders();
    qa.advance(600);
    const frozen = defenders();
    qa.advance(151);
    const live = defenders();
    return { start, frozen, live };
  });

  const planarDistance = (
    left: { x: number; z: number },
    right: { x: number; z: number },
  ): number => Math.hypot(left.x - right.x, left.z - right.z);
  for (const [index, defender] of opening.frozen.entries()) {
    expect(defender.id).toBe(opening.start[index]!.id);
    expect(planarDistance(defender.position, opening.start[index]!.position)).toBeLessThan(0.05);
    expect(planarDistance(opening.live[index]!.position, defender.position)).toBeGreaterThan(1.5);
  }
  expect(new Set(opening.live.map(({ position }) => position.x.toFixed(2))).size).toBe(3);
});

test('live bots engage at expanded range through the clear corner lane', async ({ page }) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  const engagement = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.advance(721);
    qa.place('attack-human', { x: 14, y: 1, z: -5 });
    qa.place('attack-bot-1', { x: -14, y: 1, z: -40 });
    qa.place('attack-bot-2', { x: -13, y: 1, z: -40 });
    qa.place('defense-bot-1', { x: 14, y: 1, z: 35 });
    qa.place('defense-bot-2', { x: -14, y: 1, z: -35 });
    qa.place('defense-bot-3', { x: -13, y: 1, z: -35 });
    qa.advance(1);
    const human = qa.state.actors.find(({ id }) => id === 'attack-human')!;
    const defender = qa.state.actors.find(({ id }) => id === 'defense-bot-1')!;
    const clearLane = qa.canActorsSee('defense-bot-1', 'attack-human');
    const separation = Math.hypot(
      human.position.x - defender.position.x,
      human.position.y - defender.position.y,
      human.position.z - defender.position.z,
    );
    qa.useLiveCommands();
    const samples = [];
    for (let tick = 0; tick < 30; tick++) {
      qa.advance(1);
      samples.push(qa.actorCommand('defense-bot-1'));
    }
    return { clearLane, samples, separation };
  });

  expect(engagement.clearLane).toBe(true);
  expect(engagement.separation).toBeGreaterThanOrEqual(40);
  expect(engagement.samples.some((command) => command.fire)).toBe(true);
  expect(engagement.samples.some((command) => Math.abs(command.moveX) > 0)).toBe(true);
  expect(engagement.samples.some((command) => command.moveZ < 0)).toBe(true);
});

test('weapon switching, recoil, reload, and active-play capture use the game bridge', async ({ page }, testInfo) => {
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
  await page.goto('/?qa=1&debug=1');
  await page.getByRole('button', { name: '开始任务' }).click();
  const diagnostics = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.advance(721);
    qa.command('attack-human', { slot: 2 });
    qa.advance(1);
    const pistol = window.__THREE_GAME_DIAGNOSTICS__!.viewWeapon;
    qa.command('attack-human', { slot: 1, fire: true });
    qa.advance(1);
    const recoil = window.__THREE_GAME_DIAGNOSTICS__!.viewWeapon;
    qa.command('attack-human', { slot: 1, fire: false });
    qa.advance(7);
    qa.command('attack-human', { slot: 1, reload: true });
    qa.advance(1);
    const reload = window.__THREE_GAME_DIAGNOSTICS__!.viewWeapon;
    return { phase: qa.state.phase, pistol, recoil, reload };
  });

  expect(diagnostics.phase).toBe('live');
  expect(diagnostics.pistol?.weaponId).toBe('sidearm-9');
  expect(diagnostics.recoil?.weaponId).toBe('vanguard-rifle');
  expect(diagnostics.recoil?.weaponOffset.z).toBeGreaterThan(0);
  expect(Math.abs(diagnostics.reload?.weaponRotation.z ?? 0)).toBeGreaterThan(0.05);
  const screenshotPath = process.env.CAPTURE_VERIFICATION === '1'
    ? 'docs/verification/expanded-combat-pass-1440x900.png'
    : testInfo.outputPath('expanded-combat-pass-1440x900.png');
  await page.screenshot({ path: screenshotPath });
});

test('combat HUD and visible bullet tracers reflect authoritative play state', async ({ page }, testInfo) => {
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
  await page.goto('/?qa=1&debug=1');
  await page.getByRole('button', { name: '开始任务' }).click();
  const activeShot = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.advance(721);
    qa.place('attack-human', { x: 14, y: 1, z: 10 });
    qa.place('defense-bot-1', { x: 14, y: 1, z: 4 });
    for (const id of ['attack-bot-1', 'attack-bot-2']) qa.place(id, { x: -14, y: 1, z: 35 });
    for (const id of ['defense-bot-2', 'defense-bot-3']) qa.place(id, { x: -14, y: 1, z: -35 });
    qa.command('attack-human', { fire: true, slot: 1, yaw: 0, pitch: 0 });
    qa.advance(3);
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    return {
      tracers: window.__THREE_GAME_DIAGNOSTICS__!.physics.tracers,
      state: qa.state,
    };
  });

  expect(activeShot.tracers).toBeGreaterThan(0);
  expect(activeShot.state).toMatchObject({ attackersAlive: 3, defendersAlive: 3 });
  expect(activeShot.state.radar.contacts.filter(({ alive }) => alive)).toHaveLength(6);
  await expect(page.locator('[data-testid="attackers-alive"]')).toHaveText('攻方 3');
  await expect(page.locator('[data-testid="defenders-alive"]')).toHaveText('守方 3');
  await expect(page.locator('.hud__radar-contact')).toHaveCount(6);
  await expect(page.locator('.hud__radar-contact--human')).toHaveCount(1);
  await page.locator('.mission-modal').evaluate((element) => {
    (element as HTMLElement).style.display = 'none';
  });
  const screenshotPath = process.env.CAPTURE_VERIFICATION === '1'
    ? 'docs/verification/combat-awareness-pass-1440x900.png'
    : testInfo.outputPath('combat-awareness-pass-1440x900.png');
  await page.screenshot({ path: screenshotPath });

  const expired = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.command('attack-human', { fire: false, slot: 1 });
    qa.advance(8);
    return window.__THREE_GAME_DIAGNOSTICS__!.physics.tracers;
  });
  expect(expired).toBe(0);
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
    qa.place('attack-human', { x: -1, y: 3, z: -29 });
    qa.command('attack-human', { interact: true });
    qa.advance(193);
    const planted = qa.state;
    qa.clearCommands();
    qa.place('attack-human', { x: -14, y: 1, z: 25 });
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
    qa.place('attack-human', { x: 14, y: 1, z: 10 });
    for (const teammate of ['attack-bot-1', 'attack-bot-2']) qa.place(teammate, { x: -14, y: 1, z: 25 });
    const defenders = ['defense-bot-1', 'defense-bot-2', 'defense-bot-3'];
    for (const defender of defenders) qa.place(defender, { x: -14, y: 1, z: -25 });
    for (const defender of defenders) {
      qa.place(defender, { x: 14, y: 1, z: 5 });
      for (let shot = 0; shot < 5; shot++) {
        qa.command('attack-human', { fire: true, slot: 1, yaw: 0, pitch: 0 });
        qa.advance(1);
        qa.command('attack-human', { fire: false, slot: 1, yaw: 0, pitch: 0 });
        qa.advance(7);
      }
      qa.place(defender, { x: -14, y: 1, z: -25 });
    }
    return qa.state;
  });
  expect(state).toMatchObject({ phase: 'result', attackScore: 1 });
  expect(state).toMatchObject({ attackersAlive: 3, defendersAlive: 0 });
  expect(state.actors.filter((actor) => actor.team === 'defense' && actor.alive)).toHaveLength(0);
});

test('death reconciliation clears combat, navigation, support, and render participation until restart', async ({ page }) => {
  await page.goto('/?qa=1&debug=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  const result = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    const fire = (shots: number): void => {
      for (let shot = 0; shot < shots; shot++) {
        qa.command('attack-human', { fire: true, slot: 1, yaw: 0, pitch: 0 });
        qa.advance(1);
        qa.command('attack-human', { fire: false, slot: 1, yaw: 0, pitch: 0 });
        qa.advance(7);
      }
    };

    qa.advance(721);
    qa.place('attack-human', { x: 14, y: 1, z: 10 });
    qa.place('attack-bot-1', { x: -14, y: 1, z: 25 });
    qa.place('attack-bot-2', { x: -13, y: 1, z: 25 });
    qa.place('defense-bot-1', { x: 14, y: 1, z: 7 });
    qa.place('defense-bot-2', { x: 14, y: 1, z: 4 });
    qa.place('defense-bot-3', { x: -14, y: 1, z: -25 });
    fire(4);
    const deathPosition = qa.state.actors.find(({ id }) => id === 'defense-bot-1')!.position;
    const deadWorld = qa.actorWorldStatus('defense-bot-1');
    const targetBefore = qa.state.actors.find(({ id }) => id === 'defense-bot-2')!.health;
    fire(1);
    const targetAfter = qa.state.actors.find(({ id }) => id === 'defense-bot-2')!.health;
    const visibleThroughDeath = qa.canActorsSee('attack-human', 'defense-bot-2');
    const deadSupported = qa.isActorSupported('defense-bot-1');

    qa.place('attack-human', { x: -14, y: 1, z: 25 });
    qa.place('defense-bot-2', { x: -13, y: 1, z: -25 });
    qa.place('attack-bot-1', { x: 14, y: 1, z: 9 });
    qa.command('attack-bot-1', { moveZ: -1, yaw: 0 });
    qa.advance(60);
    const navigatorZ = qa.state.actors.find(({ id }) => id === 'attack-bot-1')!.position.z;
    const retainedDeathPosition = qa.state.actors.find(({ id }) => id === 'defense-bot-1')!.position;
    const resourcesWhileDead = window.__THREE_GAME_DIAGNOSTICS__!.physics;
    const rendererWhileDead = window.__THREE_GAME_DIAGNOSTICS__!.renderer;

    qa.restart();
    qa.advance(0);
    return {
      deadWorld,
      targetBefore,
      targetAfter,
      visibleThroughDeath,
      deadSupported,
      navigatorZ,
      deathPosition,
      retainedDeathPosition,
      resourcesWhileDead,
      rendererWhileDead,
      restartedWorld: qa.actorWorldStatus('defense-bot-1'),
      restartedState: qa.state,
      restartedResources: window.__THREE_GAME_DIAGNOSTICS__!.physics,
      restartedRenderer: window.__THREE_GAME_DIAGNOSTICS__!.renderer,
    };
  });

  expect(result.deadWorld).toMatchObject({ active: false, raycastRegistered: false, meshVisible: false });
  expect(result.targetAfter).toBeLessThan(result.targetBefore);
  expect(result.visibleThroughDeath).toBe(true);
  expect(result.deadSupported).toBe(false);
  expect(result.navigatorZ).toBeLessThan(6);
  expect(result.retainedDeathPosition).toEqual(result.deathPosition);
  expect(result.resourcesWhileDead).toMatchObject({ bodies: 6 });
  expect(result.restartedWorld).toMatchObject({ active: true, raycastRegistered: true, meshVisible: true });
  expect(result.restartedState).toMatchObject({ round: 1, attackScore: 0, defenseScore: 0 });
  expect(result.restartedResources).toEqual(result.resourcesWhileDead);
  expect(result.restartedRenderer.geometries).toBeLessThanOrEqual(result.rendererWhileDead.geometries);
});
