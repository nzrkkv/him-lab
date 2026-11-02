/** Работа с содержимым сосуда: граммы по фазам, вода, среда, объём, растворимость, нагрев. */
import type { Phase } from '../content-model/types.ts';
import type { ContentIndex } from './content-index.ts';
import type { VesselState } from './types.ts';

export const EPS = 1e-6;
/** Округление, чтобы накопление ошибок не меняло ветвление (детерминированность). */
export const round6 = (x: number): number => Math.round(x * 1e6) / 1e6;

export function sortedSpecies(v: VesselState): string[] {
  return Object.keys(v.contents).sort();
}

export function grams(v: VesselState, species: string, phases?: readonly Phase[]): number {
  const p = v.contents[species];
  if (!p) return 0;
  let sum = 0;
  for (const [phase, g] of Object.entries(p) as [Phase, number][]) {
    if (!phases || phases.includes(phase)) sum += g;
  }
  return sum;
}

export function addGrams(v: VesselState, species: string, phase: Phase, g: number): void {
  const p = (v.contents[species] ??= {});
  const next = round6((p[phase] ?? 0) + g);
  if (next <= EPS) delete p[phase];
  else p[phase] = next;
  if (Object.keys(p).length === 0) delete v.contents[species];
}

/** Порядок расхода фаз при реакции: сначала растворённое, потом остальное. */
const CONSUME_ORDER: Phase[] = ['dissolved', 'liquid', 'suspended', 'solid', 'sediment', 'gel', 'melt'];

export function consumeGrams(v: VesselState, species: string, g: number, phases?: readonly Phase[]): void {
  let left = g;
  for (const phase of CONSUME_ORDER) {
    if (left <= EPS) break;
    if (phases && !phases.includes(phase)) continue;
    const have = v.contents[species]?.[phase] ?? 0;
    const take = Math.min(have, left);
    if (take > 0) {
      addGrams(v, species, phase, -take);
      left -= take;
    }
  }
}

export function movePhase(
  v: VesselState,
  species: string,
  from: readonly Phase[],
  to: Phase,
  g?: number,
): number {
  let left = g ?? Infinity;
  let moved = 0;
  for (const phase of from) {
    const have = v.contents[species]?.[phase] ?? 0;
    const take = Math.min(have, left);
    if (take > EPS) {
      addGrams(v, species, phase, -take);
      addGrams(v, species, to, take);
      left -= take;
      moved += take;
    }
  }
  return moved;
}

export function waterGrams(v: VesselState): number {
  return grams(v, 'water', ['liquid']);
}

export function isAqueous(v: VesselState, ix: ContentIndex): boolean {
  return waterGrams(v) >= ix.bundle.physics.aqueousMinWaterG;
}

/** Объём жидкости, мл: жидкие частицы по плотности; растворённое объёма почти не добавляет. */
export function liquidMl(v: VesselState, ix: ContentIndex): number {
  let ml = 0;
  for (const id of sortedSpecies(v)) {
    const g = grams(v, id, ['liquid']);
    if (g > 0) ml += g / (ix.species.get(id)?.density ?? 1);
  }
  return ml;
}

export function totalGrams(v: VesselState): number {
  let sum = 0;
  for (const id of sortedSpecies(v)) sum += grams(v, id);
  return round6(sum);
}

export function solubilityGPer100g(table: readonly (readonly [number, number])[], tC: number): number {
  const first = table[0];
  if (!first) return 0;
  if (tC <= first[0]) return first[1];
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1] as readonly [number, number];
    const b = table[i] as readonly [number, number];
    if (tC <= b[0]) return a[1] + ((b[1] - a[1]) * (tC - a[0])) / (b[0] - a[0]);
  }
  return (table[table.length - 1] as readonly [number, number])[1];
}

/** Сколько ещё граммов частицы может раствориться в воде сосуда. */
export function dissolveRoom(v: VesselState, ix: ContentIndex, species: string): number {
  const sol = ix.species.get(species)?.solubility;
  if (!sol) return 0;
  const max = (solubilityGPer100g(sol.table, v.temperatureC) * waterGrams(v)) / 100;
  return Math.max(0, max - grams(v, species, ['dissolved']));
}

/** Сколько растворённого «лишнее» при текущей температуре (пересыщенный раствор), г. */
export function dissolveExcess(v: VesselState, ix: ContentIndex, species: string): number {
  const sol = ix.species.get(species)?.solubility;
  if (!sol) return 0;
  const max = (solubilityGPer100g(sol.table, v.temperatureC) * waterGrams(v)) / 100;
  return Math.max(0, grams(v, species, ['dissolved']) - max);
}

export function heatCapacity(v: VesselState, ix: ContentIndex): number {
  let c = v.heatCapacityJPerK;
  for (const id of sortedSpecies(v)) c += grams(v, id) * (ix.species.get(id)?.specificHeat ?? 1);
  return c;
}

/** Один шаг тепловой модели. Возвращает выкипевшую воду, г. */
/** Температура тающего льда: с растворённой солью — ниже нуля (упрощение: −5 °C). */
function iceHoldC(v: VesselState): number {
  return grams(v, 'sodium_chloride') > 1e-3 ? -5 : 0;
}

/** Лёд в сосуде: тепло уходит на таяние (334 Дж/г), температура держится у точки таяния. */
function meltIce(v: VesselState, ix: ContentIndex, energy: number): number {
  const ice = grams(v, 'water', ['solid']);
  if (ice <= EPS || energy <= 0) return energy;
  const melted = Math.min(ice, energy / 334);
  addGrams(v, 'water', 'solid', -melted);
  addGrams(v, 'water', 'liquid', melted);
  void ix;
  return energy - melted * 334;
}

export function stepTemperature(v: VesselState, ix: ContentIndex, dt: number): number {
  const ph = ix.bundle.physics;
  if (grams(v, 'water', ['solid']) > EPS) {
    const hold = iceHoldC(v);
    const c = heatCapacity(v, ix);
    // Тепло самой жидкости выше точки таяния и тепло от горелки или комнаты идут на таяние льда.
    let energy = Math.max(0, v.temperatureC - hold) * c;
    if (v.heat === 'burner') energy += ph.burnerPowerW * dt;
    else if (v.heat === 'none')
      energy += c * (ph.ambientC - hold) * (1 - Math.exp(-ph.coolingPerS * dt)) * 0.2;
    const left = meltIce(v, ix, energy);
    v.temperatureC = grams(v, 'water', ['solid']) > EPS ? hold : round6(hold + left / heatCapacity(v, ix));
    return 0;
  }
  if (v.heat === 'burner') {
    const energy = ph.burnerPowerW * dt;
    const water = waterGrams(v);
    if (water > EPS && v.temperatureC >= 100 - EPS) {
      const boiled = Math.min(water, energy / ph.latentHeatWaterJPerG);
      addGrams(v, 'water', 'liquid', -boiled);
      v.temperatureC = 100;
      return boiled;
    }
    const limit = water > EPS ? 100 : ph.dryMaxC;
    v.temperatureC = round6(Math.min(limit, v.temperatureC + energy / heatCapacity(v, ix)));
    return 0;
  }
  const target = v.heat === 'ice_bath' ? ph.iceBathC : ph.ambientC;
  const k = v.heat === 'ice_bath' ? ph.iceCoolingPerS : ph.coolingPerS;
  v.temperatureC = round6(v.temperatureC + (target - v.temperatureC) * (1 - Math.exp(-k * dt)));
  return 0;
}
