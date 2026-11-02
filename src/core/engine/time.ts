/** Ход времени: температура, растворение без перемешивания, процессы, оседание, выдержка условий. */
import type { ActionType } from '../content-model/types.ts';
import type { ContentIndex } from './content-index.ts';
import { hazardFor, observedIn } from './lab-state.ts';
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
import type { EngineEvent, LabState, VesselState } from './types.ts';
import { EPS, grams, round6, sortedSpecies, stepTemperature, waterGrams } from './vessel.ts';

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

export function advanceTime(
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
