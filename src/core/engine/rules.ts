/**
 * Сопоставление правил с сосудом и цикл до устойчивого состояния (docs/spec/04-engine-and-content.md, раздел 5).
 * Применение совпавшего правила — apply.ts.
 */
import type { ActionType, Phase, ReactantPattern, Rule, RuleVariant } from '../content-model/types.ts';
import { PHASES } from '../content-model/constants.ts';
import { speciesHasClass, type ContentIndex } from './content-index.ts';
import { applyMatch } from './apply.ts';
import type { EngineEvent, LabState, VesselState } from './types.ts';
import { grams, isAqueous, sortedSpecies } from './vessel.ts';

const NON_GAS: readonly Phase[] = PHASES;
const MIN_GRAMS = 1e-4;

type Match = { species?: string | undefined; class?: string | undefined; notClass?: string[] | undefined };

export interface RuleMatch {
  rule: Rule;
  bindings: Record<string, string>;
  variant: RuleVariant | undefined;
  specificity: number;
}

export interface MatchContext {
  action: ActionType;
  /** Время опыта, прошедшее в этом шаге (только для эффектов, зависящих от времени). */
  dt: number;
}

export function speciesMatches(ix: ContentIndex, id: string, m: Match): boolean {
  if (m.species && m.species !== id) return false;
  if (m.class && !speciesHasClass(ix, id, m.class)) return false;
  if (m.notClass?.some((c) => speciesHasClass(ix, id, c))) return false;
  return true;
}

function candidates(v: VesselState, ix: ContentIndex, p: ReactantPattern): string[] {
  const phases = p.phases ?? NON_GAS;
  const min = p.minGrams ?? MIN_GRAMS;
  return sortedSpecies(v).filter((id) => speciesMatches(ix, id, p.match) && grams(v, id, phases) >= min);
}

/** Все привязки шаблонов к разным частицам сосуда, в детерминированном порядке. */
export function findBindings(
  v: VesselState,
  ix: ContentIndex,
  patterns: readonly ReactantPattern[],
): Record<string, string>[] {
  let acc: Record<string, string>[] = [{}];
  for (const p of patterns) {
    const cands = candidates(v, ix, p);
    const next: Record<string, string>[] = [];
    for (const b of acc)
      for (const c of cands) if (!Object.values(b).includes(c)) next.push({ ...b, [p.bind]: c });
    acc = next;
    if (acc.length === 0) break;
  }
  return acc;
}

/** Условия правила, кроме реагентов и стадии (holdS). */
export function conditionsHold(
  v: VesselState,
  ix: ContentIndex,
  when: Pick<Rule['when'], 'trigger' | 'medium' | 'temperature' | 'heating' | 'absent'>,
  action: ActionType,
): boolean {
  if (when.trigger && !when.trigger.includes(action)) return false;
  if (when.medium === 'aqueous' && !isAqueous(v, ix)) return false;
  if (when.medium === 'dry' && isAqueous(v, ix)) return false;
  if (when.temperature?.minC !== undefined && v.temperatureC < when.temperature.minC) return false;
  if (when.temperature?.maxC !== undefined && v.temperatureC >= when.temperature.maxC) return false;
  if (when.heating !== undefined && (v.heat === 'burner') !== when.heating) return false;
  if (
    when.absent?.some((m) =>
      sortedSpecies(v).some((id) => speciesMatches(ix, id, m) && grams(v, id) >= MIN_GRAMS),
    )
  ) {
    return false;
  }
  return true;
}

function specificity(rule: Rule): number {
  const w = rule.when;
  let s = 0;
  for (const r of w.reactants) s += r.match.species ? 3 : 1;
  s += [w.temperature, w.holdS, w.heating, w.absent, w.medium !== 'any' ? true : undefined].filter(
    (x) => x !== undefined,
  ).length;
  return s;
}

export function matchRules(
  v: VesselState,
  ix: ContentIndex,
  rules: readonly Rule[],
  ctx: MatchContext,
): RuleMatch[] {
  const out: RuleMatch[] = [];
  for (const rule of rules) {
    if (!conditionsHold(v, ix, rule.when, ctx.action)) continue;
    if (rule.when.holdS !== undefined && (v.holds[rule.id] ?? 0) < rule.when.holdS) continue;
    for (const bindings of findBindings(v, ix, rule.when.reactants)) {
      const variant = rule.variants?.find((x) =>
        Object.entries(x.bind).every(([k, sp]) => bindings[k] === sp),
      );
      if (rule.effect.type === 'react' && !variant) continue;
      out.push({ rule, bindings, variant, specificity: specificity(rule) });
    }
  }
  out.sort(
    (a, b) =>
      b.rule.priority - a.rule.priority ||
      b.specificity - a.specificity ||
      cmp(a.rule.id, b.rule.id) ||
      cmp(JSON.stringify(a.bindings), JSON.stringify(b.bindings)),
  );
  const groups = new Set<string>();
  return out.filter((m) => {
    if (!m.rule.group) return true;
    if (groups.has(m.rule.group)) return false;
    groups.add(m.rule.group);
    return true;
  });
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export { applyExtent, applyMatch, maxExtent, type ApplyResult } from './apply.ts';

/** Цикл правил до устойчивого состояния. */
export const MAX_SETTLE_PASSES = 10;

export function settle(state: LabState, v: VesselState, ix: ContentIndex, ctx: MatchContext): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (let pass = 0; pass < MAX_SETTLE_PASSES; pass++) {
    let changed = false;
    for (const m of matchRules(v, ix, ix.rules, ctx)) {
      if (m.rule.effect.type === 'settle') continue;
      const r = applyMatch(state, v, ix, m, ctx);
      events.push(...r.events);
      changed ||= r.changed;
    }
    if (!changed) return events;
  }
  throw new Error(
    `Правила не пришли к устойчивому состоянию в сосуде ${v.id}: проверьте самоограничение правил`,
  );
}
