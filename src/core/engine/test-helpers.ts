/**
 * Помощники для тестов движка: загрузка контента и краткая запись действий.
 * Используются только в тестах (Node), в сборку сайта не попадают.
 */
import { compileContent } from '../../../scripts/content/compile.ts';
import { buildIndex, type ContentIndex } from './content-index.ts';
import { createLab, step } from './step.ts';
import type { EngineEvent, LabAction, LabState } from './types.ts';

let cached: ContentIndex | null = null;

export function testIndex(): ContentIndex {
  if (cached) return cached;
  const { bundle, issues } = compileContent('ru');
  if (!bundle) throw new Error(issues.map((i) => `${i.where}: ${i.message}`).join('\n'));
  cached = buildIndex(bundle);
  return cached;
}

/** Краткая запись действия в табличных тестах. */
export type ShortAction =
  | { place: string }
  | { add: { v: string; s: string; n: number } }
  | { stir: string | { v: string; times: number } }
  | { holder: string }
  | { heat_start: string }
  | { heat_stop: string }
  | { cool_start: string }
  | { cool_stop: string }
  | { tick: number }
  | { wait: number }
  | { smell: string }
  | { magnify: string }
  | { magnify_substance: string }
  | { measure_ph: string }
  | { measure_temperature: string }
  | { return_to_jar: { v: string; s: string } }
  | { clear: string };

export function expand(ix: ContentIndex, a: ShortAction): LabAction[] {
  if ('place' in a) return [{ type: 'place', equipmentId: a.place }];
  if ('add' in a) {
    const unit = ix.substances.get(a.add.s)?.dosing ?? 'portion_solid';
    return [{ type: 'add', vesselId: a.add.v, substanceId: a.add.s, dose: { unit, count: a.add.n } }];
  }
  if ('stir' in a) {
    const { v, times } = typeof a.stir === 'string' ? { v: a.stir, times: 1 } : a.stir;
    return Array.from({ length: times }, () => ({ type: 'stir', vesselId: v }) as const);
  }
  if ('holder' in a) return [{ type: 'attach_holder', vesselId: a.holder }];
  if ('heat_start' in a) return [{ type: 'heat_start', vesselId: a.heat_start }];
  if ('heat_stop' in a) return [{ type: 'heat_stop', vesselId: a.heat_stop }];
  if ('cool_start' in a) return [{ type: 'cool_start', vesselId: a.cool_start }];
  if ('cool_stop' in a) return [{ type: 'cool_stop', vesselId: a.cool_stop }];
  if ('tick' in a) {
    // Как интерфейс: тики по 0,5 с времени опыта.
    const n = Math.round(a.tick / 0.5);
    return Array.from({ length: n }, () => ({ type: 'tick', seconds: 0.5 }) as const);
  }
  if ('wait' in a) return [{ type: 'wait', seconds: a.wait }];
  if ('smell' in a) return [{ type: 'smell', vesselId: a.smell }];
  if ('magnify' in a) return [{ type: 'magnify', vesselId: a.magnify }];
  if ('magnify_substance' in a) return [{ type: 'magnify', substanceId: a.magnify_substance }];
  if ('measure_ph' in a) return [{ type: 'measure_ph', vesselId: a.measure_ph }];
  if ('measure_temperature' in a) return [{ type: 'measure_temperature', vesselId: a.measure_temperature }];
  if ('return_to_jar' in a)
    return [{ type: 'return_to_jar', vesselId: a.return_to_jar.v, substanceId: a.return_to_jar.s }];
  return [{ type: 'clear', vesselId: a.clear }];
}

export function run(
  actions: readonly ShortAction[],
  ix = testIndex(),
  start: LabState = createLab(),
): { state: LabState; events: EngineEvent[] } {
  let state = start;
  const events: EngineEvent[] = [];
  for (const a of actions) {
    for (const action of expand(ix, a)) {
      const r = step(state, action, ix);
      state = r.state;
      events.push(...r.events);
    }
  }
  return { state, events };
}
