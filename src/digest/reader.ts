import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunLine, RunStatus } from './types.js';

const STATUSES: readonly string[] = ['ok', 'retry', 'fail'] satisfies RunStatus[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseRunLine(text: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const { at, job, status, owner, error } = value;
  if (typeof at !== 'string' || typeof job !== 'string') return null;
  if (typeof status !== 'string' || !STATUSES.includes(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;
  const line: RunLine = { at, job, status: status as RunStatus, owner };
  if (error !== undefined) line.error = error;
  return line;
}

function toRow(lines: RunLine[]): DigestRow {
  const first = lines[0]!;
  const last = lines[lines.length - 1]!;
  let lastError: string | null = null;
  for (const line of lines) {
    if (line.error !== undefined) lastError = line.error;
  }
  return {
    job: last.job,
    owner: last.owner,
    runs: lines.length,
    retries: lines.filter((line) => line.status === 'retry').length,
    lastStatus: last.status,
    lastError,
    firstAt: first.at,
    lastAt: last.at,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  const path = join(runsDir, `${night}.jsonl`);
  if (!existsSync(path)) return null;

  const byJob = new Map<string, RunLine[]>();
  let badLines = 0;
  for (const text of readFileSync(path, 'utf8').split(/\r?\n/)) {
    if (text.trim() === '') continue;
    const line = parseRunLine(text);
    if (line === null) {
      badLines++;
      continue;
    }
    const lines = byJob.get(line.job);
    if (lines) lines.push(line);
    else byJob.set(line.job, [line]);
  }

  const rows = [...byJob.values()].map(toRow).sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines };
};
