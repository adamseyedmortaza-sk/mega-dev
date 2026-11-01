import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('readNight', () => {
  const night = readNight('runs', '2026-10-28');

  it('reads 2026-10-28 into 5 jobs sorted by job, with 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night!.night).toBe('2026-10-28');
    expect(night!.badLines).toBe(1);
    expect(night!.rows.map((row) => row.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts retries and keeps the last error for fixtures/refresh', () => {
    const row = night!.rows.find((r) => r.job === 'fixtures/refresh')!;
    expect(row.runs).toBe(4);
    expect(row.retries).toBe(3);
    expect(row.lastStatus).toBe('ok');
    expect(row.lastError).toBe('upstream 503');
    expect(row.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(row.lastAt).toBe('2026-10-29T01:37:00+01:00');
  });

  it('reports notes/backup as failed', () => {
    const row = night!.rows.find((r) => r.job === 'notes/backup')!;
    expect(row.lastStatus).toBe('fail');
    expect(row.lastError).toBe('quota exceeded');
  });

  it('keeps digest/render with a null owner', () => {
    const row = night!.rows.find((r) => r.job === 'digest/render')!;
    expect(row.owner).toBeNull();
  });

  it('returns null for a missing night', () => {
    expect(readNight('runs', '1999-01-01')).toBeNull();
  });

  it('returns no rows for an empty file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
    try {
      writeFileSync(join(dir, '2026-01-01.jsonl'), '');
      expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
