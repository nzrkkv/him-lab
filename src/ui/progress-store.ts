/**
 * Один прогресс на всё приложение: загрузка один раз, отложенная запись (docs/spec/03-architecture.md, 3.9).
 * В тестовом режиме автора приложение работает с копией в памяти: в хранилище ничего не пишется,
 * поэтому после выключения режима прогресс ребёнка — ровно такой, как был.
 */
import { emptyProgress, loadProgress, type ProgressV1 } from '../core/progress/progress.ts';
import { debouncedWriter, readKey, writeKey } from '../platform/storage.ts';
import { bundle } from './content.ts';
import { testMode } from './test-mode.ts';

const KEY = 'progress';
let current: ProgressV1 | null = null;
let scratch: ProgressV1 | null = null;
let writer: (() => void) | null = null;

/** Прогресс для экранов: настоящий или (в тестовом режиме) его копия. */
export function progress(): ProgressV1 {
  if (!testMode()) return realProgress();
  return (scratch ??= structuredClone(realProgress()));
}

/** Режим включили или выключили: забыть копию, экраны перечитают прогресс. */
export function resetProgressView(): void {
  scratch = null;
}

function realProgress(): ProgressV1 {
  if (current) return current;
  const raw = readKey(KEY);
  const loaded = loadProgress(raw);
  if (!loaded.ok && loaded.reason === 'corrupt' && raw) writeKey(`backup:${Date.now()}`, raw);
  current = loaded.ok ? loaded.progress : emptyProgress();
  return current;
}

export function saveProgress(): void {
  if (testMode()) return;
  (writer ??= debouncedWriter(KEY, () => JSON.stringify(realProgress())))();
}

/** Вещества песочницы: стартовый набор + открытые за пройденные уроки и миссии (в тестовом режиме — все). */
export function availableSubstances(p: ProgressV1 = progress()): string[] {
  // Тестовый режим: открыто всё, в порядке полки.
  if (testMode()) return bundle.substances.map((s) => s.id);
  const done = new Set([
    ...p.missionsCompleted,
    ...Object.entries(p.lessons).flatMap(([id, l]) => (l.completed ? [id] : [])),
  ]);
  return [
    ...bundle.sandbox.starter,
    ...bundle.sandbox.unlocks.flatMap((u) => (done.has(u.by) ? u.substances : [])),
  ];
}
