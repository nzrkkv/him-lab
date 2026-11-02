/**
 * Состояние сосуда → значения CSS-переменных SVG по контракту дизайна
 * (docs/spec/03-architecture.md, раздел 10.2; design/assets/README.md).
 */
import { mix } from '../util/color.ts';
import type { ContentIndex } from './content-index.ts';
import { computePh } from './ph.ts';
import type { VesselState } from './types.ts';
import { grams, liquidMl, sortedSpecies } from './vessel.ts';

export interface VesselVisual {
  level: number;
  liquidColor: string;
  turbidity: number;
  turbidityColor: string;
  sediment: number;
  sedimentColor: string;
  powder: number;
  powderColor: string;
  bubbles: number;
  crystals: number;
  crystalColor: string;
  steam: boolean;
  hasLiquid: boolean;
}

const WHITE = '#FFFFFF';

function color(ix: ContentIndex, ref: string | undefined, fallback: string): string {
  return (ref && ix.bundle.colors[ref]) || fallback;
}

/** Цвет твёрдого содержимого: самая массивная частица, тёмные продукты перекрывают. */
function solidColor(v: VesselState, ix: ContentIndex, phases: Parameters<typeof grams>[2]): string {
  let best = '';
  let bestG = 0;
  for (const sp of sortedSpecies(v)) {
    const g = grams(v, sp, phases);
    const dominant = sp === 'carbon' || sp === 'caramel' || sp === 'starch_iodine_complex';
    const weight = dominant ? g * 50 : g;
    if (weight > bestG && ix.species.get(sp)?.color.powder) {
      best = sp;
      bestG = weight;
    }
  }
  return color(ix, ix.species.get(best)?.color.powder, WHITE);
}

const amountScale = (g: number): number => (g <= 1e-4 ? 0 : Math.min(1, 0.22 + Math.sqrt(g / 2.5)));

export function deriveVisual(v: VesselState, ix: ContentIndex): VesselVisual {
  const ml = liquidMl(v, ix);
  const hasLiquid = ml > 0.5;
  const water = color(ix, 'color.substance.water', '#CDE9FB');
  let liquidColor = water;
  let turbidity = 0;
  let turbidityColor = WHITE;
  if (hasLiquid) {
    for (const sp of sortedSpecies(v)) {
      const s = ix.species.get(sp);
      const g = grams(v, sp, ['dissolved']);
      if (!s || g <= 0) continue;
      if (s.indicator) {
        const ph = computePh(v, ix) ?? 7;
        const band =
          s.indicator.colors.find((c) => ph <= c.phMax) ?? s.indicator.colors[s.indicator.colors.length - 1];
        const alpha = 1 - Math.exp(-(s.color.tint ?? 1000) * (g / ml));
        liquidColor = mix(liquidColor, color(ix, band?.color, liquidColor), alpha);
      } else if (s.color.solution && (s.color.tint ?? 0) > 0) {
        const alpha = 1 - Math.exp(-(s.color.tint ?? 0) * (g / ml));
        liquidColor = mix(liquidColor, color(ix, s.color.solution, liquidColor), alpha);
      }
    }
    let suspended = 0;
    let darkest = 0;
    for (const sp of sortedSpecies(v)) {
      const s = ix.species.get(sp);
      const g = grams(v, sp, ['suspended']);
      const gel = grams(v, sp, ['gel']);
      if (g > 0 && s?.insoluble) {
        suspended += (g / ml) * s.insoluble.turbidity * 60;
        if (sp === 'starch_iodine_complex') darkest = Math.max(darkest, g);
      }
      if (gel > 0) suspended += 0.35;
    }
    turbidity = Math.min(0.95, suspended);
    if (darkest > 0) {
      turbidityColor = color(ix, 'color.substance.iodine-starch', '#1F2570');
      liquidColor = mix(liquidColor, turbidityColor, 0.85);
    }
  }
  const bottomG = sortedSpecies(v).reduce((a, sp) => a + grams(v, sp, ['sediment', 'solid', 'melt']), 0);
  let bottomColor = solidColor(v, ix, ['sediment', 'solid', 'melt']);
  if (!hasLiquid && grams(v, 'iodine') > 0 && grams(v, 'starch_iodine_complex') <= 0) {
    bottomColor = mix(bottomColor, color(ix, 'color.substance.iodine', '#B5651D'), 0.55);
  }
  const crystalsG = v.equipmentId === 'evaporating_dish' && !hasLiquid ? bottomG : 0;
  const boiling = v.heat === 'burner' && hasLiquid && v.temperatureC >= 99.5;
  return {
    level: Math.min(1, ml / v.capacityMl),
    liquidColor,
    turbidity,
    turbidityColor,
    sediment: hasLiquid ? amountScale(bottomG) : 0,
    sedimentColor: bottomColor,
    powder: !hasLiquid && crystalsG === 0 ? amountScale(bottomG) : 0,
    powderColor: bottomColor,
    bubbles: v.processes.length > 0 || boiling ? 1 : 0,
    crystals: crystalsG > 0 ? 1 : 0,
    crystalColor: bottomColor,
    steam: boiling,
    hasLiquid,
  };
}
