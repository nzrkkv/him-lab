/**
 * Мини-опыт внутри урока: несколько пробирок в штативе и кнопки действий.
 * Тот же движок, что и в лаборатории; состояние восстанавливается повтором уже сделанных действий.
 */
import type { LessonBlock } from '../../core/content-model/types.ts';
import { createLab, step } from '../../core/engine/step.ts';
import type { EngineEvent, LabAction, LabState } from '../../core/engine/types.ts';
import { deriveVisual } from '../../core/engine/visual.ts';
import { asset } from '../../fx/assets.ts';
import { VesselView, effectFor } from '../../fx/vessel-view.ts';
import { ix, t } from '../content.ts';
import { h, icon } from '../dom.ts';

type LabBlock = Extract<LessonBlock, { type: 'lab' }>;

export interface Outcome {
  icon: string;
  title: string;
  why: string;
  lens?: string;
}

const LENS_VIEWS = ['cubes', 'crystals', 'fine_powder', 'ultrafine_powder'];

/** Короткое описание результата для ребёнка по событиям движка. */
export function describeEvents(events: readonly EngineEvent[]): Outcome | null {
  for (const e of events) {
    if (e.type === 'observation') {
      const rule = ix.bundle.rules.find((r) => r.id === e.ruleId);
      const variant = rule?.variants?.find((v) => v.id === e.variantId);
      const effect =
        ix.effects.find((d) => d.kind === e.kind && (d.detail ?? null) === (e.detail ?? null)) ??
        ix.effects.find((d) => d.kind === e.kind && !d.detail);
      return {
        icon: effect?.icon ?? 'result-color',
        title: variant?.text?.what ?? rule?.text.what ?? '',
        why: variant?.text?.why ?? rule?.text.why ?? '',
      };
    }
    if (e.type === 'nothing_happened') {
      const nr = ix.noReactions.find((n) => n.id === e.reasonId);
      return {
        icon: 'result-nothing',
        title: t('result.nothing.title'),
        why: nr?.text.why ?? t(`nothing.generic.${e.action}`),
      };
    }
    if (e.type === 'magnified')
      return {
        icon: 'magnify',
        title: t('result.lens.title'),
        why: t(`result.lens.${e.view}`),
        lens: e.view,
      };
    if (e.type === 'smelled') {
      const odor = e.odor ? ix.species.get(e.odor)?.odor?.text : undefined;
      return { icon: 'result-smell', title: t('act.smell'), why: odor ?? t('result.smell.none') };
    }
  }
  return null;
}

function actionOf(a: LabBlock['actions'][number], vesselId: string): LabAction {
  if (a.add) {
    const unit = ix.substances.get(a.add)?.dosing ?? 'portion_liquid';
    return { type: 'add', vesselId, substanceId: a.add, dose: { unit, count: 1 } };
  }
  if (a.stir) return { type: 'stir', vesselId };
  if (a.magnify) return { type: 'magnify', vesselId };
  return { type: 'smell', vesselId };
}

export interface MiniLabView {
  el: HTMLElement;
  /** Кнопки действий — в правую колонку или под сцену. */
  controls: HTMLElement;
}

/** Строит сцену мини-опыта. onAction вызывается после каждого действия с его id. */
export function mountMiniLab(
  b: LabBlock,
  done: readonly string[],
  onAction: (id: string) => void,
): MiniLabView {
  let lab: LabState = createLab();
  const ids: string[] = [];
  for (const v of b.vessels) {
    lab = step(lab, { type: 'place', equipmentId: 'test_tube' }, ix).state;
    const id = lab.order[lab.order.length - 1] as string;
    ids.push(id);
    for (const c of v.contents) {
      const unit = ix.substances.get(c.substance)?.dosing ?? 'portion_solid';
      lab = step(
        lab,
        { type: 'add', vesselId: id, substanceId: c.substance, dose: { unit, count: c.n } },
        ix,
      ).state;
    }
  }
  const outcomes = new Map<number, Outcome>();
  for (const a of b.actions.filter((x) => done.includes(x.id))) {
    const r = step(lab, actionOf(a, ids[a.vessel] as string), ix);
    lab = r.state;
    const o = describeEvents(r.events);
    if (o) outcomes.set(a.vessel, o);
  }
  const views: VesselView[] = [];
  const tubes = ids.map((id, i) => {
    const svg = asset('equipment/test-tube', { label: '' });
    const view = new VesselView(svg);
    const v = lab.vessels[id];
    if (v) view.setVisual(deriveVisual(v, ix));
    views.push(view);
    return h('div', { class: 'app-ml__tube', style: `left:calc(${40 + i * 120}px * var(--s))` }, svg);
  });
  const tags = h('div', { class: 'app-ml__tags' });
  const renderTags = (): void => {
    tags.replaceChildren(
      ...b.vessels.map((v, i) => {
        const o = outcomes.get(i);
        return h(
          'div',
          { class: `app-ml__tag${o ? ' is-done' : ''}`, role: 'status' },
          h('b', { class: 'app-ml__num' }, v.label),
          o ? icon(o.icon) : null,
          h('span', {}, o ? o.title : t('lesson.lab.waiting')),
          o?.lens && LENS_VIEWS.includes(o.lens)
            ? h('span', { class: 'app-ml__lens' }, asset(`lens/${o.lens}`, { label: '' }))
            : null,
          o ? h('small', {}, o.why) : null,
        );
      }),
    );
  };
  renderTags();
  const rack = h(
    'div',
    { class: 'app-ml__rack', style: `--n:${b.vessels.length}` },
    asset('equipment/test-tube-rack', { label: '', className: 'hl-rack__back' }),
    ...tubes,
    asset('equipment/test-tube-rack', { label: '', className: 'hl-rack__front' }),
  );
  const controls = h(
    'div',
    { class: 'app-ml__actions' },
    ...b.actions.map((a) => {
      const btn = h(
        'button',
        { class: 'hl-btn hl-btn--secondary', 'aria-pressed': String(done.includes(a.id)) },
        icon(a.icon),
        a.label,
      );
      btn.addEventListener('click', () => {
        const r = step(lab, actionOf(a, ids[a.vessel] as string), ix);
        lab = r.state;
        const v = lab.vessels[ids[a.vessel] as string];
        if (v) views[a.vessel]?.setVisual(deriveVisual(v, ix));
        for (const e of r.events) {
          const def = effectFor(ix.effects, e);
          if (def) views[a.vessel]?.play(def);
        }
        const o = describeEvents(r.events);
        if (o) outcomes.set(a.vessel, o);
        renderTags();
        btn.setAttribute('aria-pressed', 'true');
        onAction(a.id);
      });
      return btn;
    }),
  );
  const el = h(
    'div',
    { class: 'app-ml' },
    b.tip ? h('p', { class: 'app-ml__tip' }, icon('info'), b.tip) : null,
    h('div', { class: 'app-ml__scene' }, h('div', { class: 'ls-table' }), rack),
    tags,
  );
  return { el, controls };
}
