/**
 * Разделение смесей: фильтр, магнит, выдох через трубочку, выпаривание досуха.
 * Вызывается из step() с рабочей копией состояния; возвращает события или причину блокировки.
 */
import type { Phase } from '../content-model/types.ts';
import { speciesHasClass, type ContentIndex } from './content-index.ts';
import { MAX_VESSELS, blocked, newVessel, nothingEvent, observedIn, pruneOrigins } from './lab-state.ts';
import { settle } from './rules.ts';
import { advanceTime } from './time.ts';
import type { EngineEvent, LabAction, LabState, StepResult, VesselState } from './types.ts';
import { EPS, addGrams, grams, liquidMl, sortedSpecies, waterGrams } from './vessel.ts';

export type SeparationAction = Extract<LabAction, { type: 'filter' | 'magnet' | 'blow' | 'evaporate' }>;

export function separate(
  input: LabState,
  state: LabState,
  v: VesselState,
  action: SeparationAction,
  ix: ContentIndex,
  finish: (events: EngineEvent[]) => StepResult,
): StepResult {
  const events: EngineEvent[] = [];
  switch (action.type) {
    case 'filter': {
      if (liquidMl(v, ix) < 0.5) return blocked(input, 'needs_liquid', v.id);
      if (state.order.length >= MAX_VESSELS) return blocked(input, 'bench_full', v.id);
      // Через фильтр проходят жидкость и растворённое (и молоко — оно коллоид); крупинки остаются на фильтре.
      const to = newVessel(ix, 'beaker', state.nextVesselNo);
      state.nextVesselNo += 1;
      state.vessels[to.id] = to;
      state.order.push(to.id);
      to.temperatureC = v.temperatureC;
      const kept: string[] = [];
      for (const sp of sortedSpecies(v)) {
        const passes = speciesHasClass(ix, sp, 'milk_protein');
        for (const [phase, g] of Object.entries(v.contents[sp] ?? {}) as [Phase, number][]) {
          if (phase === 'liquid' || phase === 'dissolved' || passes) {
            addGrams(to, sp, phase, g);
            addGrams(v, sp, phase, -g);
          } else if (!kept.includes(sp)) kept.push(sp);
        }
      }
      to.origins = [...v.origins];
      pruneOrigins(to, ix);
      pruneOrigins(v, ix);
      v.processes = [];
      return finish([
        { type: 'separated', vesselId: v.id, method: 'filter', toVesselId: to.id, speciesIds: kept },
      ]);
    }
    case 'magnet': {
      const pulled = sortedSpecies(v).filter(
        (sp) => speciesHasClass(ix, sp, 'magnetic') && grams(v, sp) > 1e-6,
      );
      if (pulled.length === 0) return finish([nothingEvent(v, ix, 'magnet')]);
      for (const sp of pulled) delete v.contents[sp];
      pruneOrigins(v, ix);
      return finish([{ type: 'separated', vesselId: v.id, method: 'magnet', speciesIds: pulled }]);
    }
    case 'blow': {
      if (liquidMl(v, ix) < 0.5) return blocked(input, 'needs_liquid', v.id);
      // Выдыхаем через трубочку: немного углекислого газа растворяется, остальное уходит.
      addGrams(v, 'carbon_dioxide', 'dissolved', 0.01);
      events.push(...settle(state, v, ix, { action: 'blow', dt: 0 }));
      delete v.contents['carbon_dioxide'];
      if (!observedIn(events, v.id)) events.push(nothingEvent(v, ix, 'blow'));
      return finish(events);
    }
    case 'evaporate': {
      if (liquidMl(v, ix) < 0.5) return blocked(input, 'needs_liquid', v.id);
      if (state.order.some((id) => id !== v.id && state.vessels[id]?.heat === 'burner'))
        return blocked(input, 'station_busy', v.id);
      // Макрос: перелить в выпарительную чашку (если помещается) и греть до сухого остатка.
      let dish = v;
      if (
        v.equipmentId !== 'evaporating_dish' &&
        liquidMl(v, ix) <= (ix.equipment.get('evaporating_dish')?.capacityMl ?? 30)
      ) {
        dish = newVessel(ix, 'evaporating_dish', v.no);
        dish.id = v.id;
        dish.contents = v.contents;
        dish.origins = v.origins;
        dish.temperatureC = v.temperatureC;
        state.vessels[v.id] = dish;
      }
      dish.heat = 'burner';
      dish.inHolder = false;
      dish.heatSeen = [];
      for (let t = 0; t < 3600 && waterGrams(dish) > EPS; t += 30)
        events.push(...advanceTime(state, ix, 30, 'tick'));
      dish.heat = 'none';
      pruneOrigins(dish, ix);
      const seen = new Set<string>();
      const unique = events.filter((e) => {
        const key = JSON.stringify(e.type === 'observation' ? [e.vesselId, e.kind, e.detail, e.ruleId] : e);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      unique.push({
        type: 'separated',
        vesselId: dish.id,
        method: 'evaporate',
        speciesIds: sortedSpecies(dish),
      });
      return finish(unique);
    }
  }
}
