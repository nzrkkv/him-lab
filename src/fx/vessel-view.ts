/**
 * Связь движка с SVG сосуда: базовое состояние (VesselVisual → CSS-переменные) и временные эффекты (классы fx-*).
 * Эффекты — по content/chem/effects.yaml и docs/design/05-effects.md; не больше трёх одновременно на сосуд.
 */
import type { EffectDef } from '../core/content-model/types.ts';
import type { EngineEvent } from '../core/engine/types.ts';
import type { VesselVisual } from '../core/engine/visual.ts';

export const FX_INSTANT = typeof __FX_INSTANT__ !== 'undefined' && __FX_INSTANT__;
const MAX_ACTIVE = 3;

interface Active {
  def: EffectDef;
  timer: ReturnType<typeof setTimeout> | null;
}

export class VesselView {
  readonly svg: SVGSVGElement;
  private base: VesselVisual | null = null;
  private active: Active[] = [];

  constructor(svg: SVGSVGElement) {
    this.svg = svg;
  }

  /** Базовое состояние из движка; временные переменные эффектов накладываются сверху. */
  setVisual(v: VesselVisual): void {
    this.base = v;
    this.paint();
  }

  private paint(): void {
    const v = this.base;
    if (!v) return;
    const vars: Record<string, string | number> = {
      '--level': v.level.toFixed(3),
      '--liquid-color': v.liquidColor,
      '--turbidity': v.turbidity.toFixed(3),
      '--turbidity-color': v.turbidityColor,
      '--sediment': v.sediment.toFixed(3),
      '--sediment-color': v.sedimentColor,
      '--powder': v.powder.toFixed(3),
      '--powder-color': v.powderColor,
      '--bubbles': v.bubbles,
      '--foam': 0,
      '--crystals': v.crystals,
      '--crystal-color': v.crystalColor,
    };
    for (const a of this.active)
      for (const [k, x] of Object.entries(a.def.vars)) vars[k] = Math.max(Number(vars[k] ?? 0), x);
    for (const [k, x] of Object.entries(vars)) this.svg.style.setProperty(k, String(x));
    if (v.bubbles > 0) this.svg.classList.add('fx-fizz');
    else if (!this.active.some((a) => a.def.fxClasses.includes('fx-fizz')))
      this.svg.classList.remove('fx-fizz');
  }

  play(def: EffectDef): void {
    if (FX_INSTANT) return;
    while (this.active.length >= MAX_ACTIVE) this.stop(this.active[0] as Active);
    const a: Active = { def, timer: null };
    this.active.push(a);
    for (const c of def.fxClasses) this.svg.classList.add(c);
    a.timer = setTimeout(() => this.stop(a), def.durationMs);
    this.paint();
  }

  private stop(a: Active): void {
    if (a.timer) clearTimeout(a.timer);
    this.active = this.active.filter((x) => x !== a);
    for (const c of a.def.fxClasses)
      if (!this.active.some((x) => x.def.fxClasses.includes(c))) this.svg.classList.remove(c);
    this.paint();
  }
}

/** Эффект для наблюдения: сначала точное совпадение уточнения (detail), потом общий для вида. */
export function effectFor(effects: readonly EffectDef[], e: EngineEvent): EffectDef | null {
  if (e.type !== 'observation') return null;
  const same = effects.filter(
    (d) => d.kind === e.kind && (d.intensity === undefined || d.intensity === e.intensity),
  );
  return (
    same.find((d) => d.detail !== undefined && d.detail === e.detail) ??
    same.find((d) => d.detail === undefined) ??
    null
  );
}
