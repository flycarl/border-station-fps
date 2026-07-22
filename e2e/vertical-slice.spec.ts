import { expect, test, type Page } from '@playwright/test';

const ADVANCE_TO_LIVE_TICKS = 3 * 60 + 1;

async function advanceToLive(page: Page): Promise<void> {
  await page.evaluate((ticks) => window.__THREE_GAME_QA__!.advance(ticks), ADVANCE_TO_LIVE_TICKS);
}

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
    healthBars: window.__THREE_GAME_DIAGNOSTICS__?.physics.healthBars,
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
    healthBars: window.__THREE_GAME_DIAGNOSTICS__?.physics.healthBars,
  }));
  await page.evaluate(() => {
    window.__THREE_GAME_DIAGNOSTICS__?.restart();
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
  const afterSecondRestart = await page.evaluate(() => ({
    geometries: window.__THREE_GAME_DIAGNOSTICS__?.renderer.geometries,
    bodies: window.__THREE_GAME_DIAGNOSTICS__?.physics.bodies,
    colliders: window.__THREE_GAME_DIAGNOSTICS__?.physics.colliders,
    healthBars: window.__THREE_GAME_DIAGNOSTICS__?.physics.healthBars,
  }));
  expect(afterRestart).toMatchObject({
    bodies: beforeRestart.bodies,
    colliders: beforeRestart.colliders,
    healthBars: 5,
  });
  expect(afterSecondRestart).toEqual(afterRestart);
  expect(audit.consoleErrors).toEqual([]);
  expect(audit.pageErrors).toEqual([]);
  expect(audit.failedRequests).toEqual([]);
});

test('expanded ramps are traversable through real Rapier movement', async ({ page }) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  await advanceToLive(page);
  const routes = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
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

test('L-shaped corner is traversable through its right entry and lower exit', async ({ page }, testInfo) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  await advanceToLive(page);
  const traversal = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    const actor = () => qa.state.actors.find(({ id }) => id === 'attack-human')!;
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
    qa.place('attack-human', { x: 13, y: 1, z: 7 });
    qa.command('attack-human', { yaw: 2.85 });
    qa.advance(1);
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
  await page.locator('.mission-modal').evaluate((element) => {
    element.remove();
  });
  await expect(page.locator('.mission-modal')).toHaveCount(0);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const screenshotPath = process.env.CAPTURE_VERIFICATION === '1'
    ? 'docs/verification/combat-feel-corner-1440x900.png'
    : testInfo.outputPath('combat-feel-corner-1440x900.png');
  await page.screenshot({ path: screenshotPath });
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
    qa.advance(150);
    const frozen = defenders();
    qa.advance(181);
    const live = defenders();
    return { start, frozen, live };
  });

  const planarDistance = (
    left: { x: number; z: number },
    right: { x: number; z: number },
  ): number => Math.hypot(left.x - right.x, left.z - right.z);
  for (const [index, defender] of opening.frozen.entries()) {
    const live = opening.live[index]!;
    expect(defender.id).toBe(opening.start[index]!.id);
    expect(planarDistance(defender.position, opening.start[index]!.position)).toBeLessThan(0.05);
    expect(live.id).toBe(defender.id);
    expect(planarDistance(live.position, defender.position), `${defender.id} live movement`)
      .toBeGreaterThan(1.5);
  }
});

test('bots keep safe spacing in deterministic opening lanes', async ({ page }) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  const opening = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    const bots = () => qa.state.actors
      .filter(({ id }) => id.includes('bot'))
      .map(({ id, team, position }) => ({ id, team, position: { ...position } }));
    const planarDistance = (
      left: { x: number; z: number },
      right: { x: number; z: number },
    ) => Math.hypot(left.x - right.x, left.z - right.z);
    const minimumTeamSpacing = (actors: ReturnType<typeof bots>) => {
      let minimum = { distance: Number.POSITIVE_INFINITY, pair: '' };
      for (const team of ['attack', 'defense']) {
        const teammates = actors.filter((actor) => actor.team === team);
        for (let left = 0; left < teammates.length; left++) {
          for (let right = left + 1; right < teammates.length; right++) {
            const distance = planarDistance(
              teammates[left]!.position,
              teammates[right]!.position,
            );
            if (distance < minimum.distance) {
              minimum = {
                distance,
                pair: `${teammates[left]!.id}/${teammates[right]!.id}`,
              };
            }
          }
        }
      }
      return minimum;
    };

    qa.useLiveCommands();
    qa.advance(181);
    const start = bots();
    let minimumSpacing = minimumTeamSpacing(start);
    for (let sample = 0; sample < 24; sample++) {
      qa.advance(10);
      const sampleSpacing = minimumTeamSpacing(bots());
      if (sampleSpacing.distance < minimumSpacing.distance) minimumSpacing = sampleSpacing;
    }
    const finish = bots();
    return {
      minimumSpacing,
      displacements: finish.map((actor) => {
        const origin = start.find(({ id }) => id === actor.id)!;
        return {
          id: actor.id,
          distance: planarDistance(origin.position, actor.position),
        };
      }),
    };
  });

  expect(opening.minimumSpacing.distance, opening.minimumSpacing.pair).toBeGreaterThan(1.2);
  for (const actor of opening.displacements) {
    expect(actor.distance, `${actor.id} opening progress`).toBeGreaterThan(1.5);
  }
});

test('every bot leaves spawn with sustained forward progress instead of trembling', async ({ page }) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  const trajectories = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    const bots = () => qa.state.actors
      .filter(({ id }) => id.includes('bot'))
      .map(({ id, team, position }) => ({ id, team, position: { ...position } }));
    qa.useLiveCommands();
    qa.advance(181);

    const samples = [bots()];
    for (let sample = 0; sample < 18; sample++) {
      qa.advance(10);
      samples.push(bots());
    }

    return samples[0]!.map((start) => {
      let cumulativeDistance = 0;
      let stationarySamples = 0;
      let reversals = 0;
      let previousDx = 0;
      let previousDz = 0;
      for (let index = 1; index < samples.length; index++) {
        const previous = samples[index - 1]!.find(({ id }) => id === start.id)!;
        const current = samples[index]!.find(({ id }) => id === start.id)!;
        const dx = current.position.x - previous.position.x;
        const dz = current.position.z - previous.position.z;
        const stepDistance = Math.hypot(dx, dz);
        cumulativeDistance += stepDistance;
        if (stepDistance < 0.2) stationarySamples++;
        if (index > 1 && dx * previousDx + dz * previousDz < -0.08) reversals++;
        previousDx = dx;
        previousDz = dz;
      }
      const finish = samples.at(-1)!.find(({ id }) => id === start.id)!;
      const netDistance = Math.hypot(
        finish.position.x - start.position.x,
        finish.position.z - start.position.z,
      );
      return {
        id: start.id,
        team: start.team,
        forwardProgress: start.team === 'attack'
          ? start.position.z - finish.position.z
          : finish.position.z - start.position.z,
        netDistance,
        efficiency: cumulativeDistance > 0 ? netDistance / cumulativeDistance : 0,
        stationarySamples,
        reversals,
      };
    });
  });

  for (const bot of trajectories) {
    expect(bot.forwardProgress, `${bot.id} forward progress`).toBeGreaterThan(4);
    expect(bot.netDistance, `${bot.id} net progress`).toBeGreaterThan(7);
    expect(bot.efficiency, `${bot.id} route efficiency`).toBeGreaterThan(0.55);
    expect(bot.stationarySamples, `${bot.id} stationary samples`).toBeLessThanOrEqual(3);
    expect(bot.reversals, `${bot.id} direction reversals`).toBeLessThanOrEqual(2);
  }
});

test('live bots recover from the site and flank cover traps', async ({ page }) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  await advanceToLive(page);
  const recovery = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    const trapPositions = {
      'defense-bot-1': { x: 4.6, y: 3, z: -29 },
      'attack-bot-1': { x: 13.4, y: 1, z: -9 },
    } as const;
    qa.place('attack-human', { x: -14, y: 1, z: 35 });
    qa.place('attack-bot-2', { x: -13, y: 1, z: 35 });
    qa.place('defense-bot-2', { x: -14, y: 1, z: -40 });
    qa.place('defense-bot-3', { x: -13, y: 1, z: -40 });
    qa.place('defense-bot-1', trapPositions['defense-bot-1']);
    qa.place('attack-bot-1', trapPositions['attack-bot-1']);
    qa.useLiveCommands();
    qa.advance(180);

    return Object.entries(trapPositions).map(([id, start]) => {
      const actor = qa.state.actors.find((candidate) => candidate.id === id)!;
      return {
        id,
        displacement: Math.hypot(
          actor.position.x - start.x,
          actor.position.z - start.z,
        ),
      };
    });
  });

  for (const actor of recovery) {
    expect(actor.displacement, `${actor.id} should escape its cover trap`).toBeGreaterThan(1);
  }
});

test('weakened bots engage inside their reduced range and pause between bursts', async ({ page }) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  await advanceToLive(page);
  const engagement = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.place('attack-human', { x: 14, y: 1, z: 5 });
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
    for (let tick = 0; tick < 100; tick++) {
      qa.advance(1);
      samples.push(qa.actorCommand('defense-bot-1'));
    }
    return { clearLane, samples, separation };
  });

  expect(engagement.clearLane).toBe(true);
  expect(engagement.separation).toBeGreaterThanOrEqual(29);
  expect(engagement.separation).toBeLessThan(34);
  const firstShot = engagement.samples.findIndex((command) => command.fire);
  expect(firstShot).toBeGreaterThanOrEqual(0);
  const firstPause = engagement.samples.findIndex(
    (command, index) => index > firstShot && !command.fire,
  );
  expect(firstPause).toBeGreaterThan(firstShot);
  const secondBurst = engagement.samples.findIndex(
    (command, index) => index > firstPause && command.fire,
  );
  expect(secondBurst).toBeGreaterThan(firstPause);
  expect(engagement.samples.some((command) => Math.abs(command.moveX) > 0)).toBe(true);
  expect(engagement.samples.some((command) => command.moveZ < 0)).toBe(true);
});

test('weapon switching, recoil, reload, and recoil capture use the game bridge', async ({ page }, testInfo) => {
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
  await advanceToLive(page);
  const shotDiagnostics = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape' }));
    qa.command('attack-human', { slot: 2 });
    qa.advance(1);
    const pistol = window.__THREE_GAME_DIAGNOSTICS__!.viewWeapon;
    qa.command('attack-human', { slot: 1, fire: true });
    qa.advance(1);
    const recoil = window.__THREE_GAME_DIAGNOSTICS__!.viewWeapon;
    return { phase: qa.state.phase, pistol, recoil };
  });

  expect(shotDiagnostics.phase).toBe('live');
  expect(shotDiagnostics.pistol?.weaponId).toBe('sidearm-9');
  expect(shotDiagnostics.recoil?.weaponId).toBe('vanguard-rifle');
  expect(shotDiagnostics.recoil?.weaponOffset.z).toBeGreaterThan(0);
  expect(shotDiagnostics.recoil?.weaponRotation.x).toBeGreaterThan(0);
  await page.locator('.mission-modal').evaluate((element) => {
    const modal = element as HTMLElement;
    modal.style.backdropFilter = 'none';
    modal.style.display = 'none';
  });
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await page.locator('.mission-modal').evaluate((element) => element.remove());
  await expect(page.locator('.mission-modal')).toHaveCount(0);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const screenshotPath = process.env.CAPTURE_VERIFICATION === '1'
    ? 'docs/verification/combat-recoil-1440x900.png'
    : testInfo.outputPath('combat-recoil-1440x900.png');
  await page.screenshot({ path: screenshotPath });

  const reload = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.command('attack-human', { slot: 1, fire: false });
    qa.advance(7);
    qa.command('attack-human', { slot: 1, reload: true });
    qa.advance(1);
    return window.__THREE_GAME_DIAGNOSTICS__!.viewWeapon;
  });
  expect(Math.abs(reload?.weaponRotation.z ?? 0)).toBeGreaterThan(0.05);
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
  await advanceToLive(page);
  const activeShot = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
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

test('bots empty their real magazine and wait for the full reload timer', async ({ page }) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  await advanceToLive(page);
  const reloadCycle = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.place('defense-bot-1', { x: 14, y: 1, z: 20 });
    qa.place('attack-human', { x: -14, y: 1, z: 35 });
    qa.place('attack-bot-1', { x: -13, y: 1, z: 35 });
    qa.place('attack-bot-2', { x: -12, y: 1, z: 35 });
    qa.place('defense-bot-2', { x: -14, y: 1, z: -35 });
    qa.place('defense-bot-3', { x: -13, y: 1, z: -35 });
    qa.command('defense-bot-1', { fire: true, slot: 1, yaw: 0, pitch: 0 });

    let ticks = 0;
    while (ticks < 600) {
      qa.advance(1);
      ticks += 1;
      const state = qa.actorWeaponState('defense-bot-1');
      if (state.magazine === 0 && state.reloadEndsAt !== null) break;
    }
    const empty = qa.actorWeaponState('defense-bot-1');
    const emptyCommand = qa.actorCommand('defense-bot-1');
    qa.advance(140);
    const beforeComplete = qa.actorWeaponState('defense-bot-1');
    qa.advance(2);
    const completed = qa.actorWeaponState('defense-bot-1');
    return { ticks, empty, emptyCommand, beforeComplete, completed };
  });

  expect(reloadCycle.ticks).toBeLessThan(600);
  expect(reloadCycle.empty).toMatchObject({ magazine: 0, reserve: 90 });
  expect(reloadCycle.empty.reloadEndsAt).not.toBeNull();
  expect(reloadCycle.emptyCommand).toMatchObject({ fire: false, reload: true });
  expect(reloadCycle.beforeComplete).toMatchObject({ magazine: 0, reserve: 90 });
  expect(reloadCycle.completed).toMatchObject({
    magazine: 29,
    reserve: 60,
    reloadEndsAt: null,
  });
});

test('live bot AI reloads its last reserve round then remains out of ammo', async ({ page }) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  await advanceToLive(page);
  const exhausted = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.place('attack-human', { x: 14, y: 1, z: 10 });
    qa.place('defense-bot-1', { x: 14, y: 1, z: 4 });
    for (const id of ['attack-bot-1', 'attack-bot-2']) qa.place(id, { x: -14, y: 1, z: 35 });
    for (const id of ['defense-bot-2', 'defense-bot-3']) qa.place(id, { x: -14, y: 1, z: -35 });
    qa.command('defense-bot-1', { yaw: Math.PI });
    qa.advance(1);
    qa.setActorWeaponState('defense-bot-1', { magazine: 1, reserve: 1, reloadEndsAt: null });
    qa.useLiveCommands();

    let sawReload = false;
    let ticks = 0;
    while (ticks < 600) {
      qa.advance(1);
      ticks += 1;
      const weapon = qa.actorWeaponState('defense-bot-1');
      if (weapon.reloadEndsAt !== null) sawReload = true;
      if (sawReload && weapon.magazine === 0 && weapon.reserve === 0
        && weapon.reloadEndsAt === null) break;
    }
    qa.advance(30);
    return {
      ticks,
      sawReload,
      weapon: qa.actorWeaponState('defense-bot-1'),
      command: qa.actorCommand('defense-bot-1'),
    };
  });

  expect(exhausted.ticks).toBeLessThan(600);
  expect(exhausted.sawReload).toBe(true);
  expect(exhausted.weapon).toMatchObject({
    magazine: 0,
    reserve: 0,
    reloadEndsAt: null,
  });
  expect(exhausted.command).toMatchObject({ fire: false, reload: false });
});

test('visible living bots show an authoritative world-space health bar', async ({ page }, testInfo) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  await advanceToLive(page);
  const visibleHealthBar = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.place('attack-human', { x: 14, y: 1, z: 10 });
    qa.place('defense-bot-1', { x: 14, y: 1, z: 4 });
    for (const id of ['attack-bot-1', 'attack-bot-2']) qa.place(id, { x: -14, y: 1, z: 35 });
    for (const id of ['defense-bot-2', 'defense-bot-3']) qa.place(id, { x: -14, y: 1, z: -35 });
    qa.command('attack-human', { fire: true, slot: 1, yaw: 0, pitch: 0 });
    qa.advance(1);
    qa.command('attack-human', { fire: false, slot: 1, yaw: 0, pitch: 0 });
    qa.advance(1);
    const damagedHealth = qa.state.actors.find(({ id }) => id === 'defense-bot-1')!.health;
    const visible = qa.actorWorldStatus('defense-bot-1');
    return { damagedHealth, visible };
  });

  expect(visibleHealthBar.damagedHealth).toBeLessThan(100);
  expect(visibleHealthBar.visible).toMatchObject({
    healthBarVisible: true,
    healthFraction: visibleHealthBar.damagedHealth / 100,
  });
  await page.locator('.mission-modal').evaluate((element) => element.remove());
  await page.screenshot({ path: testInfo.outputPath('visible-bot-health-bar-1440x900.png') });

  const behindCamera = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.command('attack-human', { yaw: Math.PI, fire: false });
    qa.advance(1);
    return {
      lineOfSight: qa.canActorsSee('attack-human', 'defense-bot-1'),
      status: qa.actorWorldStatus('defense-bot-1'),
    };
  });
  expect(behindCamera.lineOfSight).toBe(true);
  expect(behindCamera.status?.healthBarVisible).toBe(false);

  const occludedHealthBar = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.command('attack-human', { yaw: 0, fire: false });
    qa.place('defense-bot-1', { x: -14, y: 1, z: -35 });
    qa.advance(1);
    const lineOfSight = qa.canActorsSee('attack-human', 'defense-bot-1');
    const hidden = qa.actorWorldStatus('defense-bot-1');
    return { lineOfSight, hidden };
  });

  expect(occludedHealthBar.lineOfSight).toBe(false);
  expect(occludedHealthBar.hidden?.healthBarVisible).toBe(false);
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

test('composed plant and defuse immediately begin the next round preparation', async ({ page }) => {
  await page.goto('/?qa=1&debug=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  await advanceToLive(page);
  const result = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.place('attack-human', { x: -1, y: 3, z: -29 });
    qa.command('attack-human', { interact: true });
    qa.advance(193);
    const planted = qa.state;
    qa.clearCommands();
    qa.place('attack-human', { x: -14, y: 1, z: 25 });
    qa.place('defense-bot-1', qa.bomb.position);
    qa.command('defense-bot-1', { interact: true });
    qa.advance(211);
    const nextRound = qa.state;
    qa.clearCommands();
    qa.restart();
    return { planted, nextRound, restarted: qa.state };
  });
  expect(result.planted).toMatchObject({ phase: 'planted', bombState: 'planted' });
  expect(result.nextRound).toMatchObject({ phase: 'freeze', round: 2, defenseScore: 1, bombState: 'carried' });
  expect(result.nextRound.phaseRemaining).toBeGreaterThan(2.9);
  expect(result.nextRound.phaseRemaining).toBeLessThanOrEqual(3);
  expect(result.restarted).toMatchObject({ phase: 'freeze', round: 1, attackScore: 0, defenseScore: 0 });
});

test('authoritative bomb site has a visible red outline during active play', async ({ page }, testInfo) => {
  const audit = installBrowserAudit(page);
  await page.goto('/?qa=1&debug=1');
  await page.waitForFunction(() => Boolean(
    window.__THREE_GAME_QA__ && window.__THREE_BOMB_SITE_MARKER__,
  ));
  await advanceToLive(page);
  const objective = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.place('attack-human', { x: -1, y: 3, z: -29 });
    qa.command('attack-human', { interact: true });
    qa.advance(193);
    qa.command('attack-human', { interact: false, yaw: 0 });
    qa.place('attack-human', { x: -1, y: 2.2, z: -18 });
    qa.place('attack-bot-1', { x: -7, y: 2.5, z: -26 });
    qa.place('defense-bot-1', { x: 7, y: 2.5, z: -27 });
    qa.advance(1);
    return {
      marker: window.__THREE_BOMB_SITE_MARKER__,
      state: qa.state,
      bomb: qa.bomb,
    };
  });

  expect(objective.marker).toEqual({
    visible: true,
    center: { x: -1, z: -29 },
    size: { x: 18, z: 12 },
    fillOpacity: 0,
    outlineColor: 0xff3347,
  });
  expect(objective.state.phase).toBe('planted');
  expect(objective.bomb.state).toBe('planted');
  await page.locator('.mission-modal').evaluate((element) => element.remove());
  await expect(page.locator('.mission-modal')).toHaveCount(0);
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  const screenshotPath = process.env.CAPTURE_VERIFICATION === '1'
    ? 'docs/verification/autonomous-bomb-round-1440x900.png'
    : testInfo.outputPath('autonomous-bomb-round-1440x900.png');
  await page.screenshot({ path: screenshotPath });
  expect(audit.consoleErrors).toEqual([]);
  expect(audit.pageErrors).toEqual([]);
  expect(audit.failedRequests).toEqual([]);
});

test('composed timeout awards defense through MatchController', async ({ page }) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  await advanceToLive(page);
  const state = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.advance(6301);
    return qa.state;
  });
  expect(state).toMatchObject({ phase: 'freeze', round: 2, defenseScore: 1 });
  expect(state.phaseRemaining).toBeGreaterThan(2.9);
  expect(state.phaseRemaining).toBeLessThanOrEqual(3);
});

test('surviving attackers recover and plant the human carrier bomb after human death', async ({ page }) => {
  await page.goto('/?qa=1&debug=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  await advanceToLive(page);
  const result = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    const actor = (id: string) => qa.state.actors.find((candidate) => candidate.id === id)!;
    qa.place('attack-human', { x: -1, y: 3, z: -29 });
    qa.place('attack-bot-1', { x: -5, y: 3, z: -29 });
    qa.place('attack-bot-2', { x: -14, y: 1, z: 35 });
    qa.place('defense-bot-1', { x: -1, y: 3, z: -24 });
    qa.place('defense-bot-2', { x: 14, y: 1, z: 40 });
    qa.place('defense-bot-3', { x: 13, y: 1, z: 40 });

    for (let shot = 0; shot < 5 && actor('attack-human').alive; shot++) {
      qa.command('defense-bot-1', { fire: true, slot: 1, yaw: 0, pitch: 0 });
      qa.advance(1);
      qa.command('defense-bot-1', { fire: false, slot: 1, yaw: 0, pitch: 0 });
      qa.advance(7);
    }
    qa.advance(1);
    const deadHuman = { ...actor('attack-human') };
    const dropped = qa.bomb;

    const safeDefenderPositions = [
      { x: -20, y: 80, z: 80 },
      { x: 0, y: 80, z: 80 },
      { x: 20, y: 80, z: 80 },
    ];
    ['defense-bot-1', 'defense-bot-2', 'defense-bot-3'].forEach((defender, index) => {
      qa.place(defender, safeDefenderPositions[index]!);
    });
    const botStart = { ...actor('attack-bot-1').position };
    qa.useLiveCommands();
    const observedBombStates = new Set<string>([qa.bomb.state]);
    let maximumBotDisplacement = 0;
    for (let tick = 0; tick < 900 && qa.bomb.state !== 'planted'; tick++) {
      qa.advance(1);
      observedBombStates.add(qa.bomb.state);
      const position = actor('attack-bot-1').position;
      maximumBotDisplacement = Math.max(maximumBotDisplacement, Math.hypot(
        position.x - botStart.x,
        position.z - botStart.z,
      ));
    }

    const overheadCameraPose = qa.cameraPose;
    const overheadViewActorId = qa.viewActorId;
    const overheadWeaponVisible =
      window.__THREE_GAME_DIAGNOSTICS__!.viewWeapon?.visible ?? null;
    const planted = qa.bomb;
    qa.advance(2101);

    return {
      deadHuman,
      dropped,
      planted,
      observedBombStates: [...observedBombStates],
      maximumBotDisplacement,
      viewActorId: overheadViewActorId,
      cameraPose: overheadCameraPose,
      nextRound: {
        round: qa.state.round,
        human: { ...actor('attack-human') },
        viewActorId: qa.viewActorId,
        cameraPose: qa.cameraPose,
        weaponVisible: window.__THREE_GAME_DIAGNOSTICS__!.viewWeapon?.visible ?? null,
      },
      viewWeaponVisible: overheadWeaponVisible,
    };
  });

  expect(result.deadHuman.alive).toBe(false);
  expect(result.dropped).toMatchObject({ state: 'dropped', carrierId: null });
  expect(result.maximumBotDisplacement).toBeGreaterThan(1);
  expect(result.observedBombStates).toContain('carried');
  expect(result.planted.state).toBe('planted');
  expect(result.viewActorId).toBeNull();
  expect(result.cameraPose).toEqual({
    position: { x: 0, y: 72, z: 0 },
    yaw: 0,
    pitch: -Math.PI / 2,
  });
  expect(result.nextRound).toMatchObject({
    round: 2,
    human: { alive: true },
    viewActorId: 'attack-human',
    cameraPose: {
      position: { x: -4, z: 39 },
      yaw: 0,
      pitch: 0,
    },
    weaponVisible: true,
  });
  expect(result.nextRound.cameraPose.position.y)
    .toBeCloseTo(result.nextRound.human.position.y + 0.65, 2);
  expect(result.viewWeaponVisible).toBe(false);
});

test('bots keep moving and fighting when pointer lock is released after human death', async ({ page }, testInfo) => {
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
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value: function exitPointerLock() {
        locked = null;
        document.dispatchEvent(new Event('pointerlockchange'));
      },
    });
  });
  await page.goto('/?qa=1&debug=1');
  await page.getByRole('button', { name: '开始任务' }).click();
  await advanceToLive(page);

  const start = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    const actor = (id: string) => qa.state.actors.find((candidate) => candidate.id === id)!;
    qa.place('attack-human', { x: -1, y: 3, z: -29 });
    qa.place('defense-bot-1', { x: -1, y: 3, z: -24 });
    for (let shot = 0; shot < 5 && actor('attack-human').alive; shot++) {
      qa.command('defense-bot-1', { fire: true, slot: 1, yaw: 0, pitch: 0 });
      qa.advance(1);
      qa.command('defense-bot-1', { fire: false, slot: 1, yaw: 0, pitch: 0 });
      qa.advance(7);
    }
    qa.place('attack-bot-1', { x: 0, y: 1, z: 5 });
    qa.place('defense-bot-1', { x: 0, y: 1, z: 0 });
    qa.place('attack-bot-2', { x: -8, y: 1, z: 20 });
    qa.useLiveCommands();
    document.exitPointerLock();
    return {
      humanAlive: actor('attack-human').alive,
      attackBotPosition: { ...actor('attack-bot-2').position },
      combatHealth: actor('attack-bot-1').health + actor('defense-bot-1').health,
    };
  });
  expect(start.humanAlive).toBe(false);

  await expect.poll(async () => page.evaluate((initial) => {
    const state = window.__THREE_GAME_DIAGNOSTICS__!.state;
    const mover = state.actors.find(({ id }) => id === 'attack-bot-2')!;
    const attackBot = state.actors.find(({ id }) => id === 'attack-bot-1')!;
    const defenseBot = state.actors.find(({ id }) => id === 'defense-bot-1')!;
    return {
      paused: state.paused,
      moved: Math.hypot(
        mover.position.x - initial.attackBotPosition.x,
        mover.position.z - initial.attackBotPosition.z,
      ) > 1,
      damageDealt: attackBot.health + defenseBot.health < initial.combatHealth,
    };
  }, start), { timeout: 5_000 }).toMatchObject({
    paused: false,
    moved: true,
    damageDealt: true,
  });
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  await expect.poll(() => page.evaluate(() => (
    window.__THREE_GAME_DIAGNOSTICS__!.state.paused
  ))).toBe(false);

  const result = await page.evaluate((initial) => {
    const state = window.__THREE_GAME_DIAGNOSTICS__!.state;
    const mover = state.actors.find(({ id }) => id === 'attack-bot-2')!;
    const attackBot = state.actors.find(({ id }) => id === 'attack-bot-1')!;
    const defenseBot = state.actors.find(({ id }) => id === 'defense-bot-1')!;
    return {
      movement: Math.hypot(
        mover.position.x - initial.attackBotPosition.x,
        mover.position.z - initial.attackBotPosition.z,
      ),
      combatHealth: attackBot.health + defenseBot.health,
    };
  }, start);
  expect(result.movement).toBeGreaterThan(1);
  expect(result.combatHealth).toBeLessThan(start.combatHealth);

  const nextRound = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.advanceUntilRoundChanges(10_000);
    return qa.state;
  });
  expect(nextRound).toMatchObject({ round: 2, phase: 'freeze', paused: true });
  expect(nextRound.phaseRemaining).toBeGreaterThan(2.9);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('death-spectator-live-combat-1440x900.png') });
  expect(audit.consoleErrors).toEqual([]);
  expect(audit.pageErrors).toEqual([]);
  expect(audit.failedRequests).toEqual([]);
});

test('composed WeaponSystem elimination awards attack and begins the next preparation', async ({ page }) => {
  await page.goto('/?qa=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  await advanceToLive(page);
  const state = await page.evaluate(() => {
    const qa = window.__THREE_GAME_QA__!;
    qa.place('attack-human', { x: 14, y: 1, z: 10 });
    for (const teammate of ['attack-bot-1', 'attack-bot-2']) qa.place(teammate, { x: -14, y: 1, z: 25 });
    const defenders = ['defense-bot-1', 'defense-bot-2', 'defense-bot-3'];
    for (const defender of defenders) qa.place(defender, { x: -14, y: 1, z: -25 });
    for (const defender of defenders) {
      qa.place(defender, { x: 14, y: 1, z: 5 });
      for (let shot = 0; shot < 5 && qa.state.round === 1; shot++) {
        qa.command('attack-human', { fire: true, slot: 1, yaw: 0, pitch: 0 });
        qa.advance(1);
        if (qa.state.round !== 1) break;
        qa.command('attack-human', { fire: false, slot: 1, yaw: 0, pitch: 0 });
        qa.advance(7);
      }
      if (qa.state.round !== 1) break;
      qa.place(defender, { x: -14, y: 1, z: -25 });
    }
    return qa.state;
  });
  expect(state).toMatchObject({ phase: 'freeze', round: 2, attackScore: 1 });
  expect(state.phaseRemaining).toBeGreaterThan(2.9);
  expect(state.phaseRemaining).toBeLessThanOrEqual(3);
  expect(state).toMatchObject({ attackersAlive: 3, defendersAlive: 3 });
});

test('death reconciliation clears combat, navigation, support, and render participation until restart', async ({ page }) => {
  await page.goto('/?qa=1&debug=1');
  await page.waitForFunction(() => Boolean(window.__THREE_GAME_QA__));
  await advanceToLive(page);
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
