/** Один прогресс на всё приложение: загрузка один раз, отложенная запись (docs/spec/03-architecture.md, 3.9). */
import { emptyProgress, loadProgress, type ProgressV1 } from '../core/progress/progress.ts';
import { debouncedWriter, readKey, writeKey } from '../platform/storage.ts';
import { bundle } from './content.ts';

const KEY = 'progress';
let current: ProgressV1 | null = null;
let writer: (() => void) | null = null;

export function progress(): ProgressV1 {
  if (current) return current;
  const raw = readKey(KEY);
  const loaded = loadProgress(raw);
  if (!loaded.ok && loaded.reason === 'corrupt' && raw) writeKey(`backup:${Date.now()}`, raw);
  current = loaded.ok ? loaded.progress : emptyProgress();
  return current;
}

export function saveProgress(): void {
  (writer ??= debouncedWriter(KEY, () => JSON.stringify(progress())))();
}

/** Вещества песочницы: стартовый набор + открытые за пройденные уроки и миссии. */
export function availableSubstances(p: ProgressV1 = progress()): string[] {
  const done = new Set([
    ...p.missionsCompleted,
    ...Object.entries(p.lessons).flatMap(([id, l]) => (l.completed ? [id] : [])),
  ]);
  return [
    ...bundle.sandbox.starter,
    ...bundle.sandbox.unlocks.flatMap((u) => (done.has(u.by) ? u.substances : [])),
  ];
}
