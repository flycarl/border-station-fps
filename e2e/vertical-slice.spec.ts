import { expect, test } from '@playwright/test';

test('starts a nonblank match and exposes restart', async ({ page }) => {
  await page.goto('/?debug=1');
  await expect(page.getByRole('button', { name: '开始任务' })).toBeVisible();
  await page.getByRole('button', { name: '开始任务' }).click();
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
});
