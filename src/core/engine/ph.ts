/**
 * Упрощённый расчёт pH по таблице случаев (docs/spec/04-engine-and-content.md, раздел 4.5).
 * Точность — до полосы цвета индикатора; продвинутый режим заменит его расчётом равновесий.
 */
import type { ContentIndex } from './content-index.ts';
import { grams, liquidMl, sortedSpecies } from './vessel.ts';
import type { VesselState } from './types.ts';

const KW_PKW = 14;

/** Возвращает pH раствора или null, если в сосуде нет жидкости. */
export function computePh(v: VesselState, ix: ContentIndex): number | null {
  const volumeL = liquidMl(v, ix) / 1000;
  if (volumeL <= 0.0005) return null;
  const molar = (id: string): number => {
    const sp = ix.species.get(id);
    if (!sp?.molarMass) return 0;
    return grams(v, id, ['dissolved', 'liquid']) / sp.molarMass / volumeL;
  };
  let acid: { pKa: number; c: number; id: string } | null = null;
  let amphiprotic: { pKa1: number; pKa2: number } | null = null;
  let base: { pKb: number; c: number } | null = null;
  const conjugate = new Map<string, number>();
  for (const id of sortedSpecies(v)) {
    const ab = ix.species.get(id)?.acidBase;
    const c = molar(id);
    if (!ab || c <= 1e-6) continue;
    if (ab.role === 'weak_acid' && (!acid || c > acid.c)) acid = { pKa: ab.pKa, c, id };
    else if (ab.role === 'amphiprotic') amphiprotic = { pKa1: ab.pKa1, pKa2: ab.pKa2 };
    else if (ab.role === 'weak_base' && (!base || c > base.c)) base = { pKb: ab.pKb, c };
    else if (ab.role === 'conjugate_base') conjugate.set(ab.of, (conjugate.get(ab.of) ?? 0) + c * ab.perMol);
  }
  if (acid) {
    const cb = conjugate.get(acid.id) ?? 0;
    // Буфер: слабая кислота и её соль (Хендерсон — Хассельбах), иначе слабая кислота одна.
    if (cb > 1e-6) return acid.pKa + Math.log10(cb / acid.c);
    return 0.5 * (acid.pKa - Math.log10(acid.c));
  }
  if (base) return KW_PKW - 0.5 * (base.pKb - Math.log10(base.c));
  if (amphiprotic) return 0.5 * (amphiprotic.pKa1 + amphiprotic.pKa2);
  for (const [acidId, cb] of [...conjugate.entries()].sort()) {
    const ab = ix.species.get(acidId)?.acidBase;
    if (ab?.role === 'weak_acid') return KW_PKW - 0.5 * (KW_PKW - ab.pKa - Math.log10(cb));
  }
  return 7;
}

export function phWord(ph: number): 'acid' | 'neutral' | 'base' {
  if (ph < 6.5) return 'acid';
  if (ph > 7.5) return 'base';
  return 'neutral';
}
