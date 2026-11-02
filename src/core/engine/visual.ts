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
  /** Доля высоты жидкости, занятая слоем масла сверху (0 — масла нет). */
  oil: number;
  oilColor: string;
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

/**
 * Цвет индикатора при данном pH: плавный переход между серединами полос
 * (как шкала pH в дизайне — смешивание в OKLab).
 */
export function indicatorColor(
  ix: ContentIndex,
  colors: ReadonlyArray<{ phMax: number; color: string }>,
  ph: number,
): string {
  const mids = colors.map((c, i) => {
    const lo = i === 0 ? 0 : (colors[i - 1]?.phMax ?? 0);
    const hi = Math.min(14, c.phMax);
    return { ph: i === 0 ? Math.max(0, hi - 1) : (lo + hi) / 2, hex: color(ix, c.color, WHITE) };
  });
  const first = mids[0];
  if (!first) return WHITE;
  if (ph <= first.ph) return first.hex;
  for (let i = 1; i < mids.length; i++) {
    const a = mids[i - 1] as { ph: number; hex: string };
    const b = mids[i] as { ph: number; hex: string };
    if (ph <= b.ph) return mix(a.hex, b.hex, (ph - a.ph) / Math.max(1e-6, b.ph - a.ph));
  }
  return (mids[mids.length - 1] as { hex: string }).hex;
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
        const alpha = 1 - Math.exp(-(s.color.tint ?? 1000) * (g / ml));
        liquidColor = mix(liquidColor, indicatorColor(ix, s.indicator.colors, ph), alpha);
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
    // Даже немного свежего осадка заметно глазу: муть не бывает почти невидимой.
    turbidity = suspended > 0.01 ? Math.min(0.95, Math.max(0.3, suspended)) : 0;
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
  // Масло легче воды и не смешивается с ней: лежит слоем сверху.
  let oilMl = 0;
  for (const sp of sortedSpecies(v)) {
    const s = ix.species.get(sp);
    if (s?.classes.includes('oil')) oilMl += grams(v, sp, ['liquid']) / (s.density ?? 0.92);
  }
  const oilSpecies = sortedSpecies(v).find((sp) => ix.species.get(sp)?.classes.includes('oil'));
  const crystalsG = v.equipmentId === 'evaporating_dish' && !hasLiquid ? bottomG : 0;
  const boiling = v.heat === 'burner' && hasLiquid && v.temperatureC >= 99.5;
  return {
    // Небольшой объём в большом сосуде всё равно должен быть заметен глазу.
    level: hasLiquid ? Math.min(1, Math.max(0.1, ml / v.capacityMl)) : 0,
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
    oil: hasLiquid && oilMl > 0.05 ? Math.min(1, oilMl / ml) : 0,
    oilColor: color(ix, ix.species.get(oilSpecies ?? '')?.color.solution, '#F2D166'),
  };
}
