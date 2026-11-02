/**
 * Ядро миссии: раскладка банок по зерну, детективная доска, надписи, подсказки трёх уровней, проверка.
 * Чистые функции: состояние не мутируется (docs/spec/03-architecture.md, раздел 4.3).
 */
import type { Mission, MissionChip, MissionTest, Predicate } from '../content-model/types.ts';
import type { EngineEvent, LabAction, LabState } from '../engine/types.ts';
import { shuffle } from '../util/rng.ts';

export type MissionStatus = 'briefing' | 'experimenting' | 'wrap_up' | 'completed';

export interface BoardEntry {
  id: number;
  jar: string;
  test: string;
  chip: string;
  ruleId?: string;
  reasonId?: string;
}

export interface MissionState {
  missionId: string;
  status: MissionStatus;
  seed: number;
  /** Банка → вещество (скрыто от ребёнка). */
  jarSubstance: Record<string, string>;
  labels: Record<string, string | null>;
  /** Банка → проверка → чип наблюдения. */
  board: Record<string, Record<string, string>>;
  journal: BoardEntry[];
  hintLevels: Record<string, number>;
  checks: number;
  lastCheckLabels: string | null;
  sameAgain: number;
  twistsShown: string[];
}

export type CheckStatus = 'correct' | 'contradiction' | 'no_data' | 'no_label';
export interface JarCheck {
  jar: string;
  status: CheckStatus;
  test?: string;
  chip?: string;
}

export function startMission(def: Mission, seed: number): MissionState {
  const order = shuffle(def.unknowns, seed);
  const jarSubstance: Record<string, string> = {};
  def.jars.forEach((jar, i) => (jarSubstance[jar] = order[i] as string));
  return {
    missionId: def.id,
    status: 'briefing',
    seed,
    jarSubstance,
    labels: Object.fromEntries(def.jars.map((j) => [j, null])),
    board: Object.fromEntries(def.jars.map((j) => [j, {}])),
    journal: [],
    hintLevels: {},
    checks: 0,
    lastCheckLabels: null,
    sameAgain: 0,
    twistsShown: [],
  };
}

export function beginExperiments(m: MissionState): MissionState {
  return m.status === 'briefing' ? { ...m, status: 'experimenting' } : m;
}

export function jarOfSubstance(m: MissionState, substanceId: string): string | null {
  return Object.entries(m.jarSubstance).find(([, s]) => s === substanceId)?.[0] ?? null;
}

/** Какая банка в сосуде: одна, смесь или ни одной. */
export function jarOfVessel(m: MissionState, origins: readonly string[]): string | 'mixed' | null {
  const jars = origins.map((o) => jarOfSubstance(m, o)).filter((j): j is string => j !== null);
  if (jars.length === 0) return null;
  return jars.length === 1 ? (jars[0] as string) : 'mixed';
}

function chipMatches(chip: MissionChip, e: EngineEvent): boolean {
  return chip.match.some((mm) => {
    if (mm.event !== e.type) return false;
    if (e.type === 'observation') {
      if (mm.kind && mm.kind !== e.kind) return false;
      if ((mm.detail ?? null) !== (e.detail ?? null)) return false;
      if (mm.intensity && mm.intensity !== e.intensity) return false;
      if (mm.ruleId && mm.ruleId !== e.ruleId) return false;
      return true;
    }
    if (e.type === 'nothing_happened') return !mm.reasonIds || mm.reasonIds.includes(e.reasonId);
    if (e.type === 'magnified') return !mm.view || mm.view === e.view;
    return false;
  });
}

function testsFor(
  def: Mission,
  origins: readonly string[],
  heating: boolean,
  magnify: boolean,
): MissionTest[] {
  return def.tests.filter((t) => {
    if (t.action === 'magnify') return magnify;
    if (t.action === 'heat') return heating;
    return t.reagent ? origins.includes(t.reagent) : false;
  });
}

export interface RecordResult {
  mission: MissionState;
  added: BoardEntry[];
  mixed: boolean;
  twistLine: string | null;
}

/** Переносит результаты опыта на детективную доску. */
export function recordEvents(
  def: Mission,
  m: MissionState,
  lab: LabState,
  action: LabAction,
  events: readonly EngineEvent[],
): RecordResult {
  let board = m.board;
  let journal = m.journal;
  const added: BoardEntry[] = [];
  let mixed = false;
  for (const e of events) {
    if (e.type !== 'observation' && e.type !== 'nothing_happened' && e.type !== 'magnified') continue;
    let jar: string | 'mixed' | null = null;
    let tests: MissionTest[] = [];
    if (e.type === 'magnified' && e.substanceId) {
      jar = jarOfSubstance(m, e.substanceId);
      tests = testsFor(def, [], false, true);
    } else {
      const vesselId = 'vesselId' in e ? e.vesselId : undefined;
      const v = vesselId ? lab.vessels[vesselId] : undefined;
      if (!v) continue;
      jar = jarOfVessel(m, v.origins);
      const heating = v.heat === 'burner' || action.type === 'heat_stop';
      tests = testsFor(def, v.origins, heating, e.type === 'magnified');
    }
    if (jar === 'mixed') {
      mixed = true;
      continue;
    }
    if (!jar) continue;
    for (const t of tests) {
      const chip = t.chips.find((c) => chipMatches(c, e));
      if (!chip) continue;
      board = { ...board, [jar]: { ...board[jar], [t.id]: chip.id } };
      const entry: BoardEntry = { id: journal.length + added.length + 1, jar, test: t.id, chip: chip.id };
      if (e.type === 'observation') entry.ruleId = e.ruleId;
      if (e.type === 'nothing_happened') entry.reasonId = e.reasonId;
      added.push(entry);
      break;
    }
  }
  journal = added.length ? [...journal, ...added] : journal;
  let next: MissionState = { ...m, board, journal };
  let twistLine: string | null = null;
  for (const t of def.twists) {
    if (next.twistsShown.includes(t.id) || !evaluate(t.when, def, next)) continue;
    next = { ...next, twistsShown: [...next.twistsShown, t.id] };
    twistLine = t.line;
    break;
  }
  return { mission: next, added, mixed, twistLine };
}

export function placeLabel(m: MissionState, jar: string, substanceId: string | null): MissionState {
  return { ...m, labels: { ...m.labels, [jar]: substanceId } };
}

function wrongLabels(m: MissionState): number {
  return Object.entries(m.labels).filter(([jar, s]) => s !== null && s !== m.jarSubstance[jar]).length;
}

export function evaluate(p: Predicate, def: Mission, m: MissionState): boolean {
  if ('all' in p) return p.all.every((x) => evaluate(x, def, m));
  if ('any' in p) return p.any.some((x) => evaluate(x, def, m));
  if ('not' in p) return !evaluate(p.not, def, m);
  const inRange = (n: number, r: { gte?: number | undefined; lte?: number | undefined }): boolean =>
    (r.gte === undefined || n >= r.gte) && (r.lte === undefined || n <= r.lte);
  if ('experimentsDone' in p) return inRange(m.journal.length, p.experimentsDone);
  if ('jarsWith' in p) {
    const count = def.jars.filter((jar) =>
      Object.entries(p.jarsWith.where).every(([test, chips]) => chips.includes(m.board[jar]?.[test] ?? '')),
    ).length;
    return inRange(count, p.jarsWith);
  }
  if ('labelsAllPlaced' in p) return def.jars.every((j) => m.labels[j] !== null) === p.labelsAllPlaced;
  return wrongLabels(m) >= p.labelsWrong.gte;
}

export interface HintView {
  situation: string;
  level: number;
  text: string;
}

/** Текущая ситуация и уже показанный уровень подсказки (0 — ещё не просили). */
export function currentSituation(def: Mission, m: MissionState): Mission['hints'][number] {
  return (
    def.hints.find((h) => evaluate(h.when, def, m)) ??
    (def.hints[def.hints.length - 1] as Mission['hints'][number])
  );
}

/** «Пипа, помоги»: следующий уровень подсказки для текущей ситуации (не выше третьего). */
export function requestHint(def: Mission, m: MissionState): { mission: MissionState; hint: HintView } {
  const h = currentSituation(def, m);
  const level = Math.min(3, (m.hintLevels[h.situation] ?? 0) + 1);
  return {
    mission: { ...m, hintLevels: { ...m.hintLevels, [h.situation]: level } },
    hint: { situation: h.situation, level, text: h.levels[level - 1] as string },
  };
}

export function checkLabels(
  def: Mission,
  m: MissionState,
): { mission: MissionState; results: JarCheck[]; allCorrect: boolean; sameAgain: boolean } {
  const results: JarCheck[] = def.jars.map((jar) => {
    const label = m.labels[jar] ?? null;
    if (label === null) return { jar, status: 'no_label' };
    if (label === m.jarSubstance[jar]) return { jar, status: 'correct' };
    const sig = def.signatures[label] ?? {};
    for (const t of def.tests) {
      const seen = m.board[jar]?.[t.id];
      if (seen && sig[t.id] && sig[t.id] !== seen)
        return { jar, status: 'contradiction', test: t.id, chip: seen };
    }
    return { jar, status: 'no_data' };
  });
  const key = JSON.stringify(m.labels);
  const repeated = m.lastCheckLabels === key;
  const sameAgainCount = repeated ? m.sameAgain + 1 : 0;
  const allCorrect = results.every((r) => r.status === 'correct');
  return {
    mission: {
      ...m,
      checks: m.checks + 1,
      lastCheckLabels: key,
      sameAgain: sameAgainCount,
      status: allCorrect ? 'wrap_up' : m.status,
    },
    results,
    allCorrect,
    sameAgain: sameAgainCount >= 2,
  };
}

export function washHands(m: MissionState): MissionState {
  return m.status === 'wrap_up' ? { ...m, status: 'completed' } : m;
}

export function labeledCount(m: MissionState): number {
  return Object.values(m.labels).filter((x) => x !== null).length;
}
