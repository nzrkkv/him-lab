/** Сопоставление правил с сосудом и применение результата (docs/spec/04-engine-and-content.md, раздел 5). */
import type {
  ActionType,
  Intensity,
  Phase,
  ReactantPattern,
  Rule,
  RuleVariant,
} from '../content-model/types.ts';
import { PHASES } from '../content-model/constants.ts';
import { speciesHasClass, type ContentIndex } from './content-index.ts';
import { computePh } from './ph.ts';
import type { EngineEvent, LabState, VesselState } from './types.ts';
import {
  EPS,
  addGrams,
  consumeGrams,
  dissolveRoom,
  grams,
  heatCapacity,
  isAqueous,
  liquidMl,
  movePhase,
  round6,
  sortedSpecies,
} from './vessel.ts';

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

export interface ApplyResult {
  changed: boolean;
  events: EngineEvent[];
}

const NONE: ApplyResult = { changed: false, events: [] };

function observations(
  m: RuleMatch,
  v: VesselState,
  extra: Partial<Extract<EngineEvent, { type: 'observation' }>> = {},
): EngineEvent[] {
  return m.rule.observe.map((o) => {
    const intensity: Intensity =
      o.intensity === 'from_variant' ? (m.variant?.intensity ?? 'medium') : o.intensity;
    const ev: EngineEvent = {
      type: 'observation',
      vesselId: v.id,
      kind: o.kind,
      intensity,
      ruleId: m.rule.id,
      ...extra,
    };
    if (o.detail) ev.detail = o.detail;
    if (m.variant) ev.variantId = m.variant.id;
    return ev;
  });
}

function patternPhases(m: RuleMatch, bind: string): readonly Phase[] {
  return m.rule.when.reactants.find((r) => r.bind === bind)?.phases ?? NON_GAS;
}

/** Максимальная глубина реакции (моль) по наличию реагентов. */
export function maxExtent(v: VesselState, ix: ContentIndex, m: RuleMatch): number {
  const variant = m.variant;
  if (!variant) return 0;
  let extent = Infinity;
  for (const r of variant.reactants) {
    const sp = m.bindings[r.bind];
    const mm = sp ? ix.species.get(sp)?.molarMass : null;
    if (!sp || !mm) return 0;
    extent = Math.min(extent, grams(v, sp, patternPhases(m, r.bind)) / mm / r.coeff);
  }
  return Number.isFinite(extent) ? extent : 0;
}

/** Проводит реакцию на заданную глубину. Возвращает объём газа и изменение температуры. */
export function applyExtent(
  state: LabState,
  v: VesselState,
  ix: ContentIndex,
  m: RuleMatch,
  extent: number,
): { gasMl: number; deltaC: number; events: EngineEvent[] } {
  const variant = m.variant;
  const events: EngineEvent[] = [];
  if (!variant || extent <= 0) return { gasMl: 0, deltaC: 0, events };
  for (const r of variant.reactants) {
    const sp = m.bindings[r.bind] as string;
    const mm = ix.species.get(sp)?.molarMass ?? 0;
    consumeGrams(v, sp, extent * r.coeff * mm, patternPhases(m, r.bind));
  }
  let gasMl = 0;
  for (const p of variant.products) {
    const sp = ix.species.get(p.species);
    if (p.phase === 'gas') gasMl += extent * p.coeff * ix.bundle.physics.gasMlPerMol;
    else {
      addGrams(v, p.species, p.phase, extent * p.coeff * (sp?.molarMass ?? 0));
      events.push(...discovery(state, v, ix, p.species));
    }
  }
  const deltaC = round6((-variant.heatJPerMol * extent) / heatCapacity(v, ix));
  v.temperatureC = round6(v.temperatureC + deltaC);
  return { gasMl: round6(gasMl), deltaC, events };
}

function discovery(_state: LabState, v: VesselState, ix: ContentIndex, speciesId: string): EngineEvent[] {
  if (!ix.species.get(speciesId)?.discoverable) return [];
  const key = `disc:${speciesId}`;
  if (v.seen.includes(key)) return [];
  v.seen.push(key);
  return [{ type: 'discovery', vesselId: v.id, speciesId }];
}

function setFumeHood(state: LabState): EngineEvent[] {
  if (state.fumeHoodOn) return [];
  state.fumeHoodOn = true;
  return [{ type: 'fume_hood', on: true }];
}

/** Применяет совпавшее правило к сосуду (черновик состояния меняется на месте). */
export function applyMatch(
  state: LabState,
  v: VesselState,
  ix: ContentIndex,
  m: RuleMatch,
  ctx: MatchContext,
): ApplyResult {
  const e = m.rule.effect;
  const bound = (b: string): string => m.bindings[b] as string;
  switch (e.type) {
    case 'react': {
      const variant = m.variant as RuleVariant;
      const extent = maxExtent(v, ix, m);
      if (extent < 1e-9) return NONE;
      if (variant.kinetics.mode === 'over_time') {
        if (v.processes.some((p) => p.ruleId === m.rule.id && p.variantId === variant.id)) return NONE;
        v.processes.push({
          ruleId: m.rule.id,
          variantId: variant.id,
          ratePerS: extent / (variant.kinetics.durationS ?? 10),
        });
        return {
          changed: true,
          events: [
            ...observations(m, v),
            { type: 'process', vesselId: v.id, ruleId: m.rule.id, phase: 'started' },
          ],
        };
      }
      const r = applyExtent(state, v, ix, m, extent);
      const events = [...observations(m, v, { gasMl: r.gasMl }), ...r.events];
      if (variant.foamMlPerMlGas > 0 && r.gasMl > 0) {
        const foamMl = r.gasMl * variant.foamMlPerMlGas;
        const overflow = foamMl > v.capacityMl - liquidMl(v, ix);
        if (overflow) v.overflowed = true;
        const ev: EngineEvent = {
          type: 'observation',
          vesselId: v.id,
          kind: 'foam',
          intensity: variant.intensity,
          ruleId: m.rule.id,
          variantId: variant.id,
        };
        if (overflow) ev.detail = 'overflow';
        events.push(ev);
      }
      if (r.deltaC <= -1)
        events.push({
          type: 'observation',
          vesselId: v.id,
          kind: 'cold',
          intensity: 'weak',
          ruleId: m.rule.id,
          deltaC: r.deltaC,
        });
      if (r.deltaC >= 1)
        events.push({
          type: 'observation',
          vesselId: v.id,
          kind: 'warm',
          intensity: 'weak',
          ruleId: m.rule.id,
          deltaC: r.deltaC,
        });
      return { changed: true, events };
    }
    case 'dissolve': {
      const sp = bound(e.bind);
      const amount = Math.min(v.dissolveBudget[sp] ?? 0, dissolveRoom(v, ix, sp), grams(v, sp, ['solid']));
      if (amount < 1e-5) return NONE;
      movePhase(v, sp, ['solid'], 'dissolved', amount);
      v.dissolveBudget[sp] = round6((v.dissolveBudget[sp] ?? 0) - amount);
      return { changed: true, events: observations(m, v) };
    }
    case 'saturation': {
      const sp = bound(e.bind);
      const key = `sat:${sp}`;
      if (v.seen.includes(key) || grams(v, sp, ['solid']) < MIN_GRAMS || dissolveRoom(v, ix, sp) > 1e-5)
        return NONE;
      if ((v.dissolveBudget[sp] ?? 0) < 1e-5) return NONE;
      v.seen.push(key);
      return { changed: true, events: observations(m, v) };
    }
    case 'suspend': {
      const sp = bound(e.bind);
      const form = ix.species.get(sp)?.insoluble?.form ?? 'suspension';
      const moved =
        form === 'suspension'
          ? movePhase(v, sp, ['solid', 'sediment'], 'suspended')
          : movePhase(v, sp, ['solid'], 'sediment');
      return moved > EPS ? { changed: true, events: observations(m, v) } : NONE;
    }
    case 'settle': {
      if (ctx.dt <= 0) return NONE;
      const sp = bound(e.bind);
      const settleTime = ix.species.get(sp)?.insoluble?.settleTimeS ?? 30;
      const have = grams(v, sp, ['suspended']);
      const frac = 1 - Math.exp((-3 * ctx.dt) / settleTime);
      const amount = have < 1e-3 ? have : have * frac;
      if (amount < 1e-7) return NONE;
      movePhase(v, sp, ['suspended'], 'sediment', amount);
      return { changed: true, events: ctx.action === 'wait' ? observations(m, v) : [] };
    }
    case 'phase_change': {
      const moved = movePhase(v, bound(e.bind), patternPhases(m, e.bind), e.to);
      return moved > EPS ? { changed: true, events: observations(m, v) } : NONE;
    }
    case 'transform': {
      const sp = bound(e.bind);
      const events: EngineEvent[] = [];
      let moved = 0;
      for (const phase of patternPhases(m, e.bind)) {
        const g = v.contents[sp]?.[phase] ?? 0;
        if (g <= EPS) continue;
        addGrams(v, sp, phase, -g);
        addGrams(v, e.to, e.toPhase ?? phase, g);
        moved += g;
      }
      if (moved <= EPS) return NONE;
      events.push(...observations(m, v), ...discovery(state, v, ix, e.to));
      if (e.fumeHood) events.push(...setFumeHood(state));
      return { changed: true, events };
    }
    case 'crystallize': {
      let moved = 0;
      for (const sp of sortedSpecies(v)) moved += movePhase(v, sp, ['dissolved'], 'solid');
      return moved > EPS ? { changed: true, events: observations(m, v) } : NONE;
    }
    case 'indicator': {
      const ind = ix.species.get(bound(e.bind))?.indicator;
      const ph = computePh(v, ix);
      if (!ind || ph === null) return NONE;
      const band = Math.max(
        0,
        ind.colors.findIndex((c) => ph <= c.phMax),
      );
      if (v.indicatorBand === band) return NONE;
      const neutralBand = ind.colors.findIndex((c) => 7 <= c.phMax);
      const silent = v.indicatorBand === null && band === neutralBand;
      v.indicatorBand = band;
      if (silent) return { changed: true, events: [] };
      const colorName = ind.colors[band]?.name;
      return { changed: true, events: observations(m, v, colorName ? { colorName } : {}) };
    }
    case 'observe_only': {
      const list = e.once === 'vessel' ? v.seen : v.heatSeen;
      if (list.includes(m.rule.id)) return NONE;
      list.push(m.rule.id);
      return { changed: true, events: [...observations(m, v), ...(e.fumeHood ? setFumeHood(state) : [])] };
    }
    case 'stop':
      return NONE;
  }
}

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
