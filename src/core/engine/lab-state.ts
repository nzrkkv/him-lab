/**
 * Состояние лабы и мелкие помощники шага движка: новый сосуд, доза, добавление, перемешивание,
 * стоп-правила, «почему ничего не произошло», лупа и запах.
 */
import type { ActionType, MagnifierView } from '../content-model/types.ts';
import type { ContentIndex } from './content-index.ts';
import { conditionsHold, findBindings, type RuleMatch } from './rules.ts';
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
import { EPS, addGrams, grams, liquidMl, round6, sortedSpecies } from './vessel.ts';

/** Сколько сосудов помещается на столе (фильтрат требует ещё одного). */
export const MAX_VESSELS = 5;

/** Убрать из списка «что налили» вещества, от которых в сосуде ничего не осталось. */
export function pruneOrigins(v: VesselState, ix: ContentIndex): void {
  v.origins = v.origins.filter((o) =>
    ix.substances.get(o)?.composition.some((c) => grams(v, c.species) > 1e-6),
  );
}

export function createLab(): LabState {
  return { timeS: 0, vessels: {}, order: [], fumeHoodOn: false, nextVesselNo: 1 };
}

export function newVessel(ix: ContentIndex, equipmentId: string, no: number): VesselState {
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
    indicatorBand: {},
    seen: [],
    heatSeen: [],
    heatObserved: false,
    overflowed: false,
  };
}

export const blocked = (state: LabState, reason: BlockReason, vesselId?: VesselId): StepResult => ({
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

export function addSubstance(v: VesselState, ix: ContentIndex, substanceId: string, g: number): void {
  const sub = ix.substances.get(substanceId);
  if (!sub) return;
  for (const c of sub.composition) addGrams(v, c.species, c.phase, g * c.massFraction);
  if (!v.origins.includes(substanceId)) v.origins.push(substanceId);
  v.stirsSinceAdd = 0;
  v.seen = v.seen.filter((k) => !k.startsWith('sat:'));
}

export function stirVessel(v: VesselState, ix: ContentIndex): void {
  v.stirsSinceAdd += 1;
  for (const sp of sortedSpecies(v)) {
    const sol = ix.species.get(sp)?.solubility;
    const solid = grams(v, sp, ['solid']);
    if (!sol || solid <= EPS) continue;
    const remaining = Math.max(1, sol.stirsToDissolve - (v.stirsSinceAdd - 1));
    v.dissolveBudget[sp] = round6((v.dissolveBudget[sp] ?? 0) + solid / remaining);
  }
}

export function hazardFor(v: VesselState, ix: ContentIndex, action: ActionType): RuleMatch | null {
  for (const rule of ix.hazards) {
    if (!conditionsHold(v, ix, rule.when, action)) continue;
    const b = findBindings(v, ix, rule.when.reactants)[0];
    if (b) return { rule, bindings: b, variant: undefined, specificity: 0 };
  }
  return null;
}

/** Нужны ли интерфейсу тики времени. */
export function needsTicks(state: LabState, ix: ContentIndex | null): boolean {
  return state.order.some((id) => {
    const v = state.vessels[id] as VesselState;
    if (v.heat !== 'none' || v.processes.length > 0) return true;
    if (Object.values(v.contents).some((p) => (p.suspended ?? 0) > 1e-4)) return true;
    return ix ? Math.abs(v.temperatureC - ix.bundle.physics.ambientC) > 0.5 : false;
  });
}

export function observedIn(events: readonly EngineEvent[], vesselId: string): boolean {
  return events.some((e) => e.type === 'observation' && e.vesselId === vesselId);
}

export function nothingEvent(v: VesselState, ix: ContentIndex, action: LabAction['type']): EngineEvent {
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

export function magnifyView(v: VesselState, ix: ContentIndex): MagnifierView | 'liquid' | 'mixed' {
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

export function smellOf(v: VesselState, ix: ContentIndex): string | null {
  for (const sp of ODOR_ORDER) if (grams(v, sp) > 1e-4) return sp;
  for (const sp of sortedSpecies(v)) {
    if (ix.species.get(sp)?.odor && grams(v, sp, ['liquid', 'dissolved']) > 1e-4) return sp;
  }
  return null;
}
