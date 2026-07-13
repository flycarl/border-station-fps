import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('app shell', () => {
  it('provides a canvas and UI mount point', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).toContain('id="game-canvas"');
    expect(html).toContain('id="ui-root"');
  });
});
