/**
 * Сохранённый прогресс: версионированная схема и миграции (docs/spec/04-engine-and-content.md, раздел 8.7).
 * Прототип хранит настройки, текущую миссию, пройденные миссии, открытия и журнал песочницы.
 */
import type { MissionState } from '../mission/mission.ts';

export const CURRENT_VERSION = 1;

export interface Settings {
  hints: boolean;
  deeper: boolean;
  calm: boolean;
  sound: boolean;
}

export interface SandboxLogLine {
  id: number;
  icon: string;
  title: string;
  detail: string;
  tone: 'change' | 'nothing' | 'caution' | 'discovery';
}

export interface LessonProgress {
  screen: number;
  answers: Record<string, unknown>;
  /** Вопрос теста → верно ли с первой попытки. */
  testFirst: Record<string, boolean>;
  completed: boolean;
}

export interface ProgressV1 {
  schemaVersion: 1;
  settings: Settings;
  mission: MissionState | null;
  missionsCompleted: string[];
  discoveries: string[];
  sandboxLog: SandboxLogLine[];
  lessons: Record<string, LessonProgress>;
  badges: string[];
}

export const DEFAULT_SETTINGS: Settings = { hints: true, deeper: false, calm: false, sound: false };

export function emptyProgress(): ProgressV1 {
  return {
    schemaVersion: 1,
    settings: { ...DEFAULT_SETTINGS },
    mission: null,
    missionsCompleted: [],
    discoveries: [],
    sandboxLog: [],
    lessons: {},
    badges: [],
  };
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const strings = (x: unknown): string[] =>
  Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : [];

/** Миграции по версиям: vN → vN+1. Сейчас одна версия; новые добавляются в этот список. */
const MIGRATIONS: Record<number, (old: Record<string, unknown>) => Record<string, unknown>> = {};

export type LoadResult = { ok: true; progress: ProgressV1 } | { ok: false; reason: 'empty' | 'corrupt' };

/** Разбирает сохранение: проверяет форму, применяет миграции, отбрасывает лишнее. */
export function loadProgress(raw: string | null): LoadResult {
  if (!raw) return { ok: false, reason: 'empty' };
  let data: unknown;
  try {
    data = JSON.parse(raw, (k, v: unknown) =>
      k === '__proto__' || k === 'constructor' || k === 'prototype' ? undefined : v,
    );
  } catch {
    return { ok: false, reason: 'corrupt' };
  }
  if (!isObj(data) || typeof data['schemaVersion'] !== 'number') return { ok: false, reason: 'corrupt' };
  let version = data['schemaVersion'];
  while (version < CURRENT_VERSION) {
    const m = MIGRATIONS[version];
    if (!m) return { ok: false, reason: 'corrupt' };
    data = m(data as Record<string, unknown>);
    version += 1;
  }
  if (version !== CURRENT_VERSION || !isObj(data)) return { ok: false, reason: 'corrupt' };
  const s = isObj(data['settings']) ? data['settings'] : {};
  const bool = (x: unknown, d: boolean): boolean => (typeof x === 'boolean' ? x : d);
  const mission =
    isObj(data['mission']) && typeof data['mission']['missionId'] === 'string'
      ? (data['mission'] as unknown as MissionState)
      : null;
  return {
    ok: true,
    progress: {
      schemaVersion: 1,
      settings: {
        hints: bool(s['hints'], DEFAULT_SETTINGS.hints),
        deeper: bool(s['deeper'], DEFAULT_SETTINGS.deeper),
        calm: bool(s['calm'], DEFAULT_SETTINGS.calm),
        sound: bool(s['sound'], DEFAULT_SETTINGS.sound),
      },
      mission,
      missionsCompleted: strings(data['missionsCompleted']),
      discoveries: strings(data['discoveries']),
      lessons: lessonsOf(data['lessons']),
      badges: strings(data['badges']),
      sandboxLog: Array.isArray(data['sandboxLog'])
        ? (data['sandboxLog'] as SandboxLogLine[]).slice(-50)
        : [],
    },
  };
}

/** Поля, добавленные после первого релиза v1, читаются с безопасными значениями по умолчанию. */
function lessonsOf(x: unknown): Record<string, LessonProgress> {
  const out: Record<string, LessonProgress> = {};
  if (!isObj(x)) return out;
  for (const [id, v] of Object.entries(x)) {
    if (!isObj(v)) continue;
    out[id] = {
      screen: typeof v['screen'] === 'number' && v['screen'] >= 0 ? Math.floor(v['screen']) : 0,
      answers: isObj(v['answers']) ? v['answers'] : {},
      testFirst: isObj(v['testFirst'])
        ? (Object.fromEntries(
            Object.entries(v['testFirst']).filter(([, b]) => typeof b === 'boolean'),
          ) as Record<string, boolean>)
        : {},
      completed: v['completed'] === true,
    };
  }
  return out;
}

export function lessonProgress(p: ProgressV1, lessonId: string): LessonProgress {
  return (p.lessons[lessonId] ??= { screen: 0, answers: {}, testFirst: {}, completed: false });
}

export function awardBadge(p: ProgressV1, badge: string): boolean {
  if (p.badges.includes(badge)) return false;
  p.badges.push(badge);
  return true;
}
