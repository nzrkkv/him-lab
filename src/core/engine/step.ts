/**
 * Шаг движка: step(state, action, index) → { state', events }.
 * Чистая функция: входное состояние не меняется, время и случайность не используются.
 * Алгоритм — docs/spec/04-engine-and-content.md, раздел 5.2.
 * Помощники — lab-state.ts, ход времени — time.ts, разделение смесей — separation.ts.
 */
import type { ContentIndex } from './content-index.ts';
import {
  addSubstance,
  blocked,
  doseAmount,
  hazardFor,
  magnifyView,
  needsTicks,
  newVessel,
  nothingEvent,
  observedIn,
  smellOf,
  stirVessel,
} from './lab-state.ts';
import { computePh } from './ph.ts';
import { settle } from './rules.ts';
import { separate } from './separation.ts';
import { advanceTime } from './time.ts';
import type { EngineEvent, LabAction, LabState, StepResult, VesselId, VesselState } from './types.ts';
import { EPS, addGrams, liquidMl, round6, sortedSpecies, totalGrams } from './vessel.ts';

export { MAX_VESSELS, createLab, doseAmount } from './lab-state.ts';

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
      stirVessel(v, ix);
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
    case 'filter':
    case 'magnet':
    case 'blow':
    case 'evaporate':
      return separate(input, state, v, action, ix, finish);
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
