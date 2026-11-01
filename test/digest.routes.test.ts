import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

type DigestJson = { night: string; rows: Array<{ job: string }>; badLines: number };

let runsDir: string;
let config: { adapter: string; installed: string; beatEverySeconds: number; runsDir: string };

const line = (job: string, status: 'ok' | 'retry' | 'fail', owner: string | null, minute: number) =>
  JSON.stringify({ at: `2026-01-01T08:${String(minute).padStart(2, '0')}:00+01:00`, job, status, owner });

beforeAll(() => {
  runsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-runs-'));

  // Two jobs; sweep-cache retries three times before it succeeds, so it is marked.
  fs.writeFileSync(
    path.join(runsDir, '2026-01-01.jsonl'),
    [
      line('sweep-cache', 'retry', 'dana', 0),
      line('build-index', 'ok', null, 1),
      line('sweep-cache', 'retry', 'dana', 2),
      line('sweep-cache', 'retry', 'dana', 3),
      line('sweep-cache', 'ok', 'dana', 4),
    ].join('\n') + '\n',
  );
  fs.writeFileSync(path.join(runsDir, '2026-01-02.jsonl'), '');
  fs.writeFileSync(
    path.join(runsDir, '2026-01-03.jsonl'),
    [line('build-index', 'ok', null, 0), 'this is not json {'].join('\n') + '\n',
  );

  config = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  };
});

afterAll(() => {
  fs.rmSync(runsDir, { recursive: true, force: true });
});

describe('digest page and JSON routes', () => {
  it('GET /digest/:night returns 200 with both jobs in sorted order', async () => {
    const res = await createApp(config).request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);

    const buildAt = html.indexOf('build-index');
    const sweepAt = html.indexOf('sweep-cache');
    expect(buildAt).toBeGreaterThan(-1);
    expect(sweepAt).toBeGreaterThan(-1);
    expect(buildAt).toBeLessThan(sweepAt);
  });

  it('GET /api/digest/:night returns 200 with the same jobs in the same order as the page', async () => {
    const pageRes = await createApp(config).request('/digest/2026-01-01');
    const html = await pageRes.text();

    const res = await createApp(config).request('/api/digest/2026-01-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;

    const jobs = body.rows.map((r) => r.job);
    expect(jobs).toEqual(['build-index', 'sweep-cache']);

    const positions = jobs.map((job) => html.indexOf(job));
    expect(positions.every((p) => p > -1)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('404 for a night with no file, on the page and the JSON', async () => {
    const page = await createApp(config).request('/digest/2026-01-09');
    expect(page.status).toBe(404);

    const json = await createApp(config).request('/api/digest/2026-01-09');
    expect(json.status).toBe(404);
  });

  it('empty night renders "nothing ran" on the page and no rows in the JSON', async () => {
    const page = await createApp(config).request('/digest/2026-01-02');
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');

    const json = await createApp(config).request('/api/digest/2026-01-02');
    expect(json.status).toBe(200);
    const body = (await json.json()) as DigestJson;
    expect(body.rows).toEqual([]);
  });

  it('night with a bad line still renders: page 200, JSON counts one bad line and one job', async () => {
    const page = await createApp(config).request('/digest/2026-01-03');
    expect(page.status).toBe(200);

    const json = await createApp(config).request('/api/digest/2026-01-03');
    expect(json.status).toBe(200);
    const body = (await json.json()) as DigestJson;
    expect(body.badLines).toBe(1);
    expect(body.rows).toHaveLength(1);
  });
});
