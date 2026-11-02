/** Применение совпавшего правила к сосуду: реакция, растворение, взвесь, индикатор и т. д. */
import type { Intensity, Phase, RuleVariant } from '../content-model/types.ts';
import { PHASES } from '../content-model/constants.ts';
import { speciesHasClass, type ContentIndex } from './content-index.ts';
import { computePh } from './ph.ts';
import type { MatchContext, RuleMatch } from './rules.ts';
import type { EngineEvent, LabState, VesselState } from './types.ts';
import {
  EPS,
  addGrams,
  consumeGrams,
  dissolveExcess,
  dissolveRoom,
  grams,
  heatCapacity,
  liquidMl,
  movePhase,
  round6,
  sortedSpecies,
} from './vessel.ts';

const NON_GAS: readonly Phase[] = PHASES;
const MIN_GRAMS = 1e-4;

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
            ...foamEvents(v, ix, m, gasOf(ix, variant, extent)),
            { type: 'process', vesselId: v.id, ruleId: m.rule.id, phase: 'started' },
          ],
        };
      }
      const r = applyExtent(state, v, ix, m, extent);
      const events = [
        ...observations(m, v, { gasMl: r.gasMl }),
        ...r.events,
        ...foamEvents(v, ix, m, r.gasMl),
      ];
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
    case 'crystallize_cooling': {
      // Насыщенный раствор остыл или выпарился: лишнее выпадает кристаллами.
      const sp = bound(e.bind);
      const excess = dissolveExcess(v, ix, sp);
      if (excess < 1e-3) return NONE;
      movePhase(v, sp, ['dissolved'], 'solid', excess);
      // О кристаллах сообщаем один раз на сосуд, а не на каждом тике выпаривания.
      const key = `cryst:${sp}`;
      if (v.seen.includes(key)) return { changed: true, events: [] };
      v.seen.push(key);
      return { changed: true, events: observations(m, v) };
    }
    case 'crystallize': {
      let moved = 0;
      for (const sp of sortedSpecies(v)) moved += movePhase(v, sp, ['dissolved'], 'solid');
      return moved > EPS ? { changed: true, events: observations(m, v) } : NONE;
    }
    case 'indicator': {
      const indId = bound(e.bind);
      const ind = ix.species.get(indId)?.indicator;
      const ph = computePh(v, ix);
      if (!ind || ph === null) return NONE;
      const band = Math.max(
        0,
        ind.colors.findIndex((c) => ph <= c.phMax),
      );
      const prev = v.indicatorBand[indId];
      if (prev === band) return NONE;
      const neutralBand = ind.colors.findIndex((c) => 7 <= c.phMax);
      const silent = prev === undefined && band === neutralBand;
      v.indicatorBand = { ...v.indicatorBand, [indId]: band };
      if (silent) return { changed: true, events: [] };
      const colorName = ind.colors[band]?.name;
      return { changed: true, events: observations(m, v, colorName ? { colorName } : {}) };
    }
    case 'observe_only': {
      const list = e.once === 'vessel' ? v.seen : v.heatSeen;
      if (list.includes(m.rule.id)) return NONE;
      list.push(m.rule.id);
      if (e.coolToC !== undefined && v.temperatureC > e.coolToC) v.temperatureC = e.coolToC;
      return { changed: true, events: [...observations(m, v), ...(e.fumeHood ? setFumeHood(state) : [])] };
    }
    case 'stop':
      return NONE;
  }
}

function gasOf(ix: ContentIndex, variant: RuleVariant, extent: number): number {
  return variant.products
    .filter((p) => p.phase === 'gas')
    .reduce((a, p) => a + extent * p.coeff * ix.bundle.physics.gasMlPerMol, 0);
}

/** Пена: от газа реакции; мыло в сосуде делает пены впятеро больше (так устроена «слоновья зубная паста»). */
function foamEvents(v: VesselState, ix: ContentIndex, m: RuleMatch, gasMl: number): EngineEvent[] {
  const variant = m.variant;
  if (!variant || gasMl <= 0) return [];
  const soapy = sortedSpecies(v).some((id) => speciesHasClass(ix, id, 'surfactant') && grams(v, id) > 1e-4);
  const perMl = (variant.foamMlPerMlGas || (soapy ? 0.05 : 0)) * (soapy ? 5 : 1);
  if (perMl <= 0) return [];
  const overflow = gasMl * perMl > v.capacityMl - liquidMl(v, ix);
  if (overflow) v.overflowed = true;
  const ev: EngineEvent = {
    type: 'observation',
    vesselId: v.id,
    kind: 'foam',
    intensity: soapy ? 'strong' : variant.intensity,
    ruleId: m.rule.id,
    variantId: variant.id,
  };
  if (overflow) ev.detail = 'overflow';
  return [ev];
}
