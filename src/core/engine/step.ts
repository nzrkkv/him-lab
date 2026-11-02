/**
 * Шаг движка: step(state, action, index) → { state', events }.
 * Чистая функция: входное состояние не меняется, время и случайность не используются.
 * Алгоритм — docs/spec/04-engine-and-content.md, раздел 5.2.
 */
import type { ActionType, MagnifierView } from '../content-model/types.ts';
import type { ContentIndex } from './content-index.ts';
import { computePh } from './ph.ts';
import {
  applyExtent,
  applyMatch,
  conditionsHold,
  findBindings,
  matchRules,
  maxExtent,
  settle,
  type RuleMatch,
} from './rules.ts';
import type {
  BlockReason,
  Dose,
  EngineEvent,
  LabAction,
  LabState,
  StepResult,
  VesselId,
  VesselState,
} from './types.ts';
import {
  EPS,
  addGrams,
  grams,
  liquidMl,
  round6,
  sortedSpecies,
  stepTemperature,
  totalGrams,
  waterGrams,
} from './vessel.ts';

export function createLab(): LabState {
  return { timeS: 0, vessels: {}, order: [], fumeHoodOn: false, nextVesselNo: 1 };
}

function newVessel(ix: ContentIndex, equipmentId: string, no: number): VesselState {
  const eq = ix.equipment.get(equipmentId);
  return {
    id: `v${no}`,
    no,
    equipmentId,
    capacityMl: eq?.capacityMl ?? 100,
    heatCapacityJPerK: eq?.heatCapacityJPerK ?? 20,
    contents: {},
    temperatureC: ix.bundle.physics.ambientC,
    heat: 'none',
    inHolder: false,
    stirsSinceAdd: 0,
    dissolveBudget: {},
    holds: {},
    processes: [],
    origins: [],
    indicatorBand: null,
    seen: [],
    heatSeen: [],
    heatObserved: false,
    overflowed: false,
  };
}

const blocked = (state: LabState, reason: BlockReason, vesselId?: VesselId): StepResult => ({
  state,
  events: [vesselId ? { type: 'blocked', reason, vesselId } : { type: 'blocked', reason }],
  needsTicks: needsTicks(state, null),
});

/** Граммы и миллилитры одной дозы вещества. */
export function doseAmount(ix: ContentIndex, substanceId: string, dose: Dose): { grams: number; ml: number } {
  const sub = ix.substances.get(substanceId);
  const d = ix.bundle.dosing;
  if (!sub) return { grams: 0, ml: 0 };
  if (dose.unit === 'portion_solid') return { grams: round6(dose.count * d.portion_solid_g), ml: 0 };
  const ml = dose.count * (dose.unit === 'drop' ? d.drop_ml : d.portion_liquid_ml);
  return { grams: round6(ml * (sub.density ?? 1)), ml };
}

function addSubstance(v: VesselState, ix: ContentIndex, substanceId: string, g: number): void {
  const sub = ix.substances.get(substanceId);
  if (!sub) return;
  for (const c of sub.composition) addGrams(v, c.species, c.phase, g * c.massFraction);
  if (!v.origins.includes(substanceId)) v.origins.push(substanceId);
  v.stirsSinceAdd = 0;
  v.seen = v.seen.filter((k) => !k.startsWith('sat:'));
}

function stir(v: VesselState, ix: ContentIndex): void {
  v.stirsSinceAdd += 1;
  for (const sp of sortedSpecies(v)) {
    const sol = ix.species.get(sp)?.solubility;
    const solid = grams(v, sp, ['solid']);
    if (!sol || solid <= EPS) continue;
    const remaining = Math.max(1, sol.stirsToDissolve - (v.stirsSinceAdd - 1));
    v.dissolveBudget[sp] = round6((v.dissolveBudget[sp] ?? 0) + solid / remaining);
  }
}

function hazardFor(v: VesselState, ix: ContentIndex, action: ActionType): RuleMatch | null {
  for (const rule of ix.hazards) {
    if (!conditionsHold(v, ix, rule.when, action)) continue;
    const b = findBindings(v, ix, rule.when.reactants)[0];
    if (b) return { rule, bindings: b, variant: undefined, specificity: 0 };
  }
  return null;
}

/** Нужны ли интерфейсу тики времени. */
function needsTicks(state: LabState, ix: ContentIndex | null): boolean {
  return state.order.some((id) => {
    const v = state.vessels[id] as VesselState;
    if (v.heat !== 'none' || v.processes.length > 0) return true;
    if (Object.values(v.contents).some((p) => (p.suspended ?? 0) > 1e-4)) return true;
    return ix ? Math.abs(v.temperatureC - ix.bundle.physics.ambientC) > 0.5 : false;
  });
}

function observedIn(events: readonly EngineEvent[], vesselId: string): boolean {
  return events.some((e) => e.type === 'observation' && e.vesselId === vesselId);
}

function nothingEvent(v: VesselState, ix: ContentIndex, action: LabAction['type']): EngineEvent {
  for (const nr of ix.noReactions) {
    if (!nr.when.trigger.includes(action)) continue;
    if (!conditionsHold(v, ix, { medium: nr.when.medium }, action)) continue;
    if (findBindings(v, ix, nr.when.reactants).length === 0) continue;
    return {
      type: 'nothing_happened',
      vesselId: v.id,
      action,
      reasonId: nr.id,
      showsColor: nr.observe.some((o) => o.kind === 'color'),
    };
  }
  return {
    type: 'nothing_happened',
    vesselId: v.id,
    action,
    reasonId: `generic_${action}`,
    showsColor: false,
  };
}

/** Время для одного сосуда: температура, растворение без перемешивания, процессы, оседание, стадии. */
function advanceVessel(
  state: LabState,
  v: VesselState,
  ix: ContentIndex,
  dt: number,
  action: ActionType,
): EngineEvent[] {
  const events: EngineEvent[] = [];
  stepTemperature(v, ix, dt);
  for (const sp of sortedSpecies(v)) {
    const sol = ix.species.get(sp)?.solubility;
    const solid = grams(v, sp, ['solid']);
    if (sol && solid > EPS && waterGrams(v) > EPS) {
      v.dissolveBudget[sp] = round6(
        (v.dissolveBudget[sp] ?? 0) + (solid * sol.noStirFractionPerMin * dt) / 60,
      );
    }
  }
  for (const p of [...v.processes]) {
    const rule = ix.rules.find((r) => r.id === p.ruleId);
    const variant = rule?.variants?.find((x) => x.id === p.variantId);
    const bindings = rule
      ? findBindings(v, ix, rule.when.reactants).find(
          (b) => variant && Object.entries(variant.bind).every(([k, s]) => b[k] === s),
        )
      : undefined;
    const m: RuleMatch | null =
      rule && variant && bindings ? { rule, bindings, variant, specificity: 0 } : null;
    const max = m ? maxExtent(v, ix, m) : 0;
    if (!m || max < 1e-9) {
      v.processes = v.processes.filter((x) => x !== p);
      events.push({ type: 'process', vesselId: v.id, ruleId: p.ruleId, phase: 'finished' });
      continue;
    }
    events.push(...applyExtent(state, v, ix, m, Math.min(max, p.ratePerS * dt)).events);
  }
  const ctx = { action, dt };
  for (const m of matchRules(v, ix, ix.rules, ctx))
    if (m.rule.effect.type === 'settle') events.push(...applyMatch(state, v, ix, m, ctx).events);
  for (const rule of ix.holdRules) {
    const ok =
      conditionsHold(v, ix, rule.when, action) && findBindings(v, ix, rule.when.reactants).length > 0;
    if (ok) v.holds[rule.id] = round6((v.holds[rule.id] ?? 0) + dt);
    else delete v.holds[rule.id];
  }
  return events;
}

function advanceTime(
  state: LabState,
  ix: ContentIndex,
  seconds: number,
  action: 'tick' | 'wait',
): EngineEvent[] {
  const events: EngineEvent[] = [];
  const tickS = ix.bundle.physics.tickS;
  const n = Math.max(1, Math.ceil(seconds / tickS - 1e-9));
  const dt = seconds / n;
  for (let i = 0; i < n; i++) {
    for (const id of state.order) {
      const v = state.vessels[id] as VesselState;
      const before = events.length;
      events.push(...advanceVessel(state, v, ix, dt, action));
      events.push(...settle(state, v, ix, { action, dt: 0 }));
      if (v.heat === 'burner') {
        const hz = hazardFor(v, ix, 'tick');
        if (hz) {
          v.heat = 'none';
          events.push({ type: 'safety_stop', vesselId: v.id, ruleId: hz.rule.id });
        }
        if (observedIn(events.slice(before), v.id)) v.heatObserved = true;
      }
    }
    state.timeS = round6(state.timeS + dt);
  }
  return events;
}

function magnifyView(v: VesselState, ix: ContentIndex): MagnifierView | 'liquid' | 'mixed' {
  if (liquidMl(v, ix) > 0.5) return 'liquid';
  const views = new Set<MagnifierView>();
  for (const sp of sortedSpecies(v)) {
    if (grams(v, sp, ['solid', 'sediment']) < 1e-4) continue;
    const view = ix.species.get(sp)?.magnifierView;
    if (view) views.add(view);
  }
  return views.size === 1 ? ([...views][0] as MagnifierView) : 'mixed';
}

const ODOR_ORDER = ['carbon', 'caramel', 'dextrin'];

function smellOf(v: VesselState, ix: ContentIndex): string | null {
  for (const sp of ODOR_ORDER) if (grams(v, sp) > 1e-4) return sp;
  for (const sp of sortedSpecies(v)) {
    if (ix.species.get(sp)?.odor && grams(v, sp, ['liquid', 'dissolved']) > 1e-4) return sp;
  }
  return null;
}

/** Главная функция движка. */
export function step(input: LabState, action: LabAction, ix: ContentIndex): StepResult {
  const state = structuredClone(input);
  const vesselOf = (id: VesselId): VesselState | undefined => state.vessels[id];
  const finish = (events: EngineEvent[]): StepResult => ({
    state,
    events,
    needsTicks: needsTicks(state, ix),
  });

  switch (action.type) {
    case 'tick':
      return finish(advanceTime(state, ix, action.seconds, 'tick'));
    case 'wait': {
      const events = advanceTime(state, ix, action.seconds ?? ix.bundle.physics.waitStepS, 'wait');
      if (!events.some((e) => e.type === 'observation'))
        events.push({
          type: 'nothing_happened',
          vesselId: '',
          action: 'wait',
          reasonId: 'generic_wait',
          showsColor: false,
        });
      return finish(events);
    }
    case 'place': {
      if (!ix.equipment.has(action.equipmentId)) return blocked(input, 'not_available');
      const v = newVessel(ix, action.equipmentId, state.nextVesselNo);
      state.nextVesselNo += 1;
      state.vessels[v.id] = v;
      state.order.push(v.id);
      return finish([{ type: 'placed', vesselId: v.id }]);
    }
    case 'magnify': {
      if (action.substanceId) {
        const sp = ix.substances.get(action.substanceId)?.composition[0]?.species;
        const view = (sp && ix.species.get(sp)?.magnifierView) || 'liquid';
        return finish([{ type: 'magnified', view, substanceId: action.substanceId }]);
      }
      const v = action.vesselId ? vesselOf(action.vesselId) : undefined;
      if (!v) return blocked(input, 'unknown_vessel');
      if (totalGrams(v) <= EPS) return blocked(input, 'empty_vessel', v.id);
      return finish([{ type: 'magnified', view: magnifyView(v, ix), vesselId: v.id }]);
    }
    default:
      break;
  }

  const v = vesselOf(action.type === 'pour' ? action.from : action.vesselId);
  if (!v) return blocked(input, 'unknown_vessel');
  const events: EngineEvent[] = [];
  const wasEmpty = totalGrams(v) <= EPS;

  switch (action.type) {
    case 'remove':
      if (v.heat === 'burner') return blocked(input, 'station_busy', v.id);
      delete state.vessels[v.id];
      state.order = state.order.filter((x) => x !== v.id);
      return finish([]);
    case 'return_to_jar':
      return blocked(input, 'no_return_to_jar', v.id);
    case 'add': {
      const amount = doseAmount(ix, action.substanceId, action.dose);
      if (amount.grams <= 0) return blocked(input, 'not_available', v.id);
      if (liquidMl(v, ix) + amount.ml > v.capacityMl + 1e-9) return blocked(input, 'capacity', v.id);
      addSubstance(v, ix, action.substanceId, amount.grams);
      break;
    }
    case 'pour': {
      const to = vesselOf(action.to);
      if (!to) return blocked(input, 'unknown_vessel');
      if (totalGrams(v) <= EPS) return blocked(input, 'empty_vessel', v.id);
      if (liquidMl(to, ix) + liquidMl(v, ix) > to.capacityMl + 1e-9) return blocked(input, 'capacity', to.id);
      const cFrom = v.heatCapacityJPerK;
      const cTo = to.heatCapacityJPerK;
      to.temperatureC = round6((to.temperatureC * cTo + v.temperatureC * cFrom) / (cTo + cFrom));
      for (const sp of sortedSpecies(v))
        for (const [phase, g] of Object.entries(v.contents[sp] ?? {})) addGrams(to, sp, phase as never, g);
      for (const o of v.origins) if (!to.origins.includes(o)) to.origins.push(o);
      to.stirsSinceAdd = 0;
      v.contents = {};
      v.origins = [];
      v.processes = [];
      events.push(...settle(state, to, ix, { action: 'pour', dt: 0 }));
      if (!observedIn(events, to.id)) events.push(nothingEvent(to, ix, 'pour'));
      return finish(events);
    }
    case 'stir':
      if (totalGrams(v) <= EPS) return blocked(input, 'empty_vessel', v.id);
      stir(v, ix);
      break;
    case 'attach_holder':
      v.inHolder = true;
      return finish([]);
    case 'detach_holder':
      if (v.heat === 'burner') return blocked(input, 'station_busy', v.id);
      v.inHolder = false;
      return finish([]);
    case 'heat_start': {
      if (ix.equipment.get(v.equipmentId)?.needsHolderForHeat && !v.inHolder)
        return blocked(input, 'needs_holder', v.id);
      if (state.order.some((id) => id !== v.id && state.vessels[id]?.heat === 'burner'))
        return blocked(input, 'station_busy', v.id);
      v.heat = 'burner';
      v.heatSeen = [];
      v.heatObserved = false;
      break;
    }
    case 'heat_stop':
      if (v.heat !== 'burner') return finish([]);
      v.heat = 'none';
      if (!v.heatObserved) events.push(nothingEvent(v, ix, 'heat_stop'));
      return finish(events);
    case 'cool_start':
      if (v.heat === 'burner') return blocked(input, 'station_busy', v.id);
      v.heat = 'ice_bath';
      return finish([]);
    case 'cool_stop':
      if (v.heat === 'ice_bath') v.heat = 'none';
      return finish([]);
    case 'smell':
      return finish([{ type: 'smelled', vesselId: v.id, odor: smellOf(v, ix) }]);
    case 'measure_temperature':
      return finish([
        { type: 'measurement', vesselId: v.id, quantity: 'temperature', value: Math.round(v.temperatureC) },
      ]);
    case 'measure_ph': {
      const ph = computePh(v, ix);
      if (ph === null) return blocked(input, 'needs_liquid', v.id);
      return finish([
        { type: 'measurement', vesselId: v.id, quantity: 'ph', value: Math.round(ph * 10) / 10 },
      ]);
    }
    case 'weigh':
      return finish([
        {
          type: 'measurement',
          vesselId: v.id,
          quantity: 'mass',
          value: Math.round(totalGrams(v) * 100) / 100,
        },
      ]);
    case 'clear': {
      const fresh = newVessel(ix, v.equipmentId, v.no);
      fresh.inHolder = v.inHolder;
      state.vessels[v.id] = fresh;
      return finish([]);
    }
  }

  // Стоп-правила проверяются до применения: если сработало — возвращаем исходное состояние.
  const hz = hazardFor(v, ix, action.type);
  if (hz)
    return {
      state: input,
      events: [{ type: 'safety_stop', vesselId: v.id, ruleId: hz.rule.id }],
      needsTicks: needsTicks(input, ix),
    };

  events.push(...settle(state, v, ix, { action: action.type, dt: 0 }));
  if (v.heat === 'burner' && observedIn(events, v.id)) v.heatObserved = true;
  // В пустой сосуд просто насыпали или налили — это ещё не опыт.
  const experiment = action.type === 'stir' || (action.type === 'add' && !wasEmpty);
  if (experiment && !observedIn(events, v.id)) events.push(nothingEvent(v, ix, action.type));
  return finish(events);
}
