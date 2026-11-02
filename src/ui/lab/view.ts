/**
 * Экран лаборатории (песочница и миссия) по design/components/lab.css и макетам design/mockups/lab-*.html.
 * Сосуды — постоянные SVG-узлы (чтобы работали переходы CSS); остальное перерисовывается по состоянию.
 */
import type { LabAction, VesselState } from '../../core/engine/types.ts';
import { asset } from '../../fx/assets.ts';
import { FX_INSTANT, VesselView, effectFor } from '../../fx/vessel-view.ts';
import { h, icon, replaceChildren } from '../dom.ts';
import { bundle, ix, t } from '../content.ts';
import { LabController, type Pose } from './controller.ts';
import { renderJournal } from './journal.ts';

interface WareRef {
  el: HTMLButtonElement;
  view: VesselView;
  equipmentId: string;
}

const LENS_VIEWS = ['cubes', 'crystals', 'fine_powder', 'ultrafine_powder'];
const NATURAL_WIDTH: Record<string, number> = {
  beaker: 120,
  test_tube: 48,
  flask: 120,
  evaporating_dish: 150,
};
const ASSET: Record<string, string> = {
  beaker: 'equipment/beaker',
  test_tube: 'equipment/test-tube',
  flask: 'equipment/flask',
  evaporating_dish: 'equipment/evaporating-dish',
};

export function mountLab(root: HTMLElement, c: LabController, goHome: () => void): () => void {
  const wares = new Map<string, WareRef>();
  const isMission = c.state.mode === 'mission';
  const announcer = h('div', { class: 'hl-sr', role: 'status', 'aria-live': 'polite' });
  const alertAnnouncer = h('div', { class: 'hl-sr', role: 'alert' });
  const topbar = h('header', { class: 'hl-topbar' });
  const shelf = h('aside', {
    class: 'hl-shelf',
    'aria-label': t(isMission ? 'shelf.mission.title' : 'shelf.title'),
  });
  const head = h('div', { class: 'hl-stage__head' });
  const rail = h('div', { class: 'hl-rail-wrap' });
  const scene = h('div', { class: 'hl-scene' });
  const items = h('div', { class: 'hl-bench__items' });
  const overlay = h('div', { class: 'app-overlay' });
  const dock = h('div', { class: 'hl-dock', role: 'toolbar', 'aria-label': t('dock.label') });
  const journal = h('aside', {
    class: 'hl-journal hl-journal-panel',
    id: 'journal',
    'aria-label': t('journal.title'),
  });
  const modal = h('div', { class: 'app-modal' });
  const guide = h('div', { class: 'hl-guide' });
  scene.append(h('div', { class: 'hl-bench' }), guide, items, overlay);
  const stageMain = h('div', { class: 'hl-stage__main' }, isMission ? head : rail, scene);
  const lab = h(
    'div',
    { class: `hl-lab${isMission ? ' app-lab--mission' : ''}` },
    topbar,
    shelf,
    h('main', { class: 'hl-stage', 'aria-label': t('bench.title') }, stageMain, dock),
    journal,
  );
  replaceChildren(root, lab, modal, announcer, alertAnnouncer);

  let pose: Pose | null = null;
  const setPose = (p: Pose): void => {
    if (p === pose) return;
    pose = p;
    replaceChildren(guide, asset(`character/guide-${p}`, { label: '' }));
  };

  // ---------- верхняя панель ----------
  const switchBtn = (key: 'hints' | 'calm', label: string, deep = false): HTMLButtonElement =>
    h(
      'button',
      {
        class: `hl-switch${deep ? ' hl-switch--deep' : ''}`,
        role: 'switch',
        'aria-checked': String(c.progress.settings[key]),
        onclick: () => c.toggleSetting(key),
      },
      h(
        'span',
        { class: 'hl-switch__label' },
        icon(key === 'hints' ? 'hint' : 'eye'),
        h('span', { class: 'hl-switch__text' }, label),
      ),
      h('span', { class: 'hl-switch__track' }),
    );

  function renderTopbar(): void {
    replaceChildren(
      topbar,
      h(
        'button',
        { class: 'hl-btn hl-btn--ghost hl-btn--icon', 'aria-label': t('top.back'), onclick: goHome },
        icon('back'),
      ),
      h(
        'div',
        { class: 'hl-topbar__title' },
        h(
          'span',
          { class: `hl-mode hl-mode--${c.state.mode}` },
          icon(isMission ? 'target' : 'sandbox'),
          h('span', { class: 'hl-mode__text' }, t(`top.mode.${c.state.mode}`)),
        ),
        h('h1', {}, isMission ? c.mission.title : t('top.sandbox.title')),
      ),
      h('div', { class: 'hl-topbar__spacer' }),
      h(
        'div',
        { class: 'hl-topbar__group' },
        switchBtn('hints', t('top.hints')),
        switchBtn('calm', t('top.calm'), true),
        h('span', { class: 'hl-topbar__divider', 'aria-hidden': 'true' }),
        h(
          'button',
          {
            class: 'hl-btn hl-btn--secondary hl-btn--sm hl-journal-toggle',
            'aria-expanded': String(c.state.journalOpen),
            'aria-controls': 'journal',
            onclick: () => c.set('journalOpen', !c.state.journalOpen),
          },
          icon('journal'),
          isMission ? t('board.title') : t('top.journal'),
        ),
      ),
    );
  }

  // ---------- полка ----------
  function substanceButton(id: string, opts: { jar?: string } = {}): HTMLButtonElement {
    const sub = ix.substances.get(id);
    const sel = c.state.selected;
    const key = opts.jar ?? id;
    const pressed = sel?.kind === 'substance' && sel.id === key;
    const isBottle = sub?.container === 'bottle';
    const sp = sub?.composition[0]?.species;
    const powderRef = sp ? ix.species.get(sp)?.color.powder : undefined;
    const liquidRef = sub?.composition.find(
      (x) => ix.species.get(x.species)?.color.solution && x.species !== 'water',
    )?.species;
    const liquidColor = liquidRef
      ? bundle.colors[ix.species.get(liquidRef)?.color.solution ?? '']
      : bundle.colors['color.substance.water'];
    const lid = opts.jar ? 'var(--color-ink-300)' : (bundle.colors[sub?.lidColor ?? ''] ?? '#56628A');
    const art = asset(isBottle ? 'containers/bottle' : 'containers/jar', {
      label: '',
      vars: isBottle
        ? { '--liquid-color': liquidColor ?? '#CDE9FB', '--cap-color': lid, '--level': 0.72 }
        : {
            '--substance-color': opts.jar ? '#FFFFFF' : (bundle.colors[powderRef ?? ''] ?? '#FFFFFF'),
            '--lid-color': lid,
            '--fill': 0.7,
          },
    });
    let name = sub?.shortName ?? id;
    let meta: HTMLElement;
    let aria: string;
    if (opts.jar) {
      const label = c.state.mission?.labels[opts.jar];
      const ok = c.state.checks?.find((x) => x.jar === opts.jar)?.status === 'correct';
      name = t('shelf.jar', { jar: opts.jar });
      const labelName = label ? (ix.substances.get(label)?.shortName ?? label).toLowerCase() : null;
      meta = h(
        'span',
        { class: `hl-substance__meta${labelName ? ' hl-substance__meta--label' : ''}` },
        labelName && ok ? icon('check') : null,
        labelName ?? t('shelf.jar.nolabel'),
      );
      aria = `${name}, ${labelName ? t('shelf.jar.label', { label: labelName }) : t('shelf.jar.nolabel')}`;
    } else {
      const home = sub?.availability === 'home';
      meta = h(
        'span',
        { class: `hl-substance__meta hl-substance__meta--${home ? 'home' : 'lab'}` },
        icon(home ? 'home' : 'lab-only'),
        h('span', {}, t(home ? 'shelf.home' : 'shelf.lab')),
      );
      aria = `${name}, ${t(home ? 'shelf.home.long' : 'shelf.lab.long')}`;
    }
    return h(
      'button',
      {
        class: `hl-substance${isBottle ? ' hl-substance--bottle' : ''}`,
        'aria-pressed': String(pressed),
        'aria-label': aria,
        'data-drag-substance': key,
        onclick: () => c.select('substance', key),
      },
      h(
        'span',
        { class: 'hl-substance__art' },
        art,
        opts.jar ? h('span', { class: 'hl-substance__letter', 'aria-hidden': 'true' }, opts.jar) : null,
      ),
      h('span', { class: 'hl-substance__name' }, name),
      meta,
    );
  }

  function rows(buttons: HTMLElement[]): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (let i = 0; i < buttons.length; i += 2)
      out.push(h('div', { class: 'hl-shelf__row' }, buttons[i], buttons[i + 1]));
    return out;
  }

  function renderShelf(): void {
    // Перерисовка не должна сбрасывать прокрутку полки.
    const old = shelf.querySelector<HTMLElement>('.hl-shelf__body');
    const keep = old ? { left: old.scrollLeft, top: old.scrollTop } : null;
    const body = h('div', { class: 'hl-shelf__body' });
    if (isMission) {
      const jars = c.mission.jars.map((j) => substanceButton(c.jarSubstance(j) ?? '', { jar: j }));
      body.append(h('h3', { class: 'hl-shelf__group' }, t('shelf.powders')), ...rows(jars));
      body.append(
        h('h3', { class: 'hl-shelf__group' }, t('shelf.reagents')),
        ...rows(c.mission.helpers.map((s) => substanceButton(s))),
      );
    } else {
      const subs = bundle.sandbox.substances.map((s) => ix.substances.get(s)).filter((s) => s !== undefined);
      for (const group of ['liquids', 'powders'] as const) {
        body.append(
          h('h3', { class: 'hl-shelf__group' }, t(`shelf.${group}`)),
          ...rows(subs.filter((s) => s.group === group).map((s) => substanceButton(s.id))),
        );
      }
    }
    const title = isMission ? t('shelf.mission.title') : t('shelf.title');
    const count = isMission
      ? t('shelf.mission.count')
      : t('shelf.count', { count: bundle.sandbox.substances.length });
    replaceChildren(
      shelf,
      h(
        'div',
        { class: 'hl-shelf__head' },
        h(
          'div',
          { class: 'hl-shelf__title' },
          h('h2', {}, title),
          h('span', { class: 'hl-shelf__count' }, count),
        ),
      ),
      body,
      more,
    );
    if (keep) {
      body.scrollLeft = keep.left;
      body.scrollTop = keep.top;
    }
    updateMore();
  }
  // Портрет: кнопка «листай дальше» — признак прокрутки полки (и способ листать без жеста).
  const more = h(
    'button',
    {
      class: 'app-shelf-more',
      'aria-label': t('shelf.scroll'),
      onclick: () => shelf.querySelector('.hl-shelf__body')?.scrollBy({ left: 240, behavior: 'smooth' }),
    },
    icon('forward'),
  );
  function updateMore(): void {
    const body = shelf.querySelector<HTMLElement>('.hl-shelf__body');
    if (!body) return;
    const end = body.scrollLeft + body.clientWidth >= body.scrollWidth - 4;
    body.classList.toggle('is-end', end);
    more.hidden = end || body.scrollWidth <= body.clientWidth + 4;
  }
  shelf.addEventListener('scroll', updateMore, true);
  window.addEventListener('resize', updateMore);

  // ---------- оборудование (песочница) ----------
  function renderRail(): void {
    const eqs = ['beaker', 'test_tube', 'flask', 'evaporating_dish'];
    replaceChildren(
      rail,
      h(
        'div',
        { class: 'hl-rail', role: 'list', 'aria-label': t('rail.title') },
        h('span', { class: 'hl-rail__label' }, t('rail.title')),
        ...eqs.map((id) => {
          const name = ix.equipment.get(id)?.name ?? id;
          return h(
            'button',
            {
              class: 'hl-rail__item',
              role: 'listitem',
              'aria-label': t('rail.place', { name }),
              onclick: () => c.placeVessel(id),
            },
            asset(ASSET[id] as string, { label: '' }),
            h('span', {}, name),
          );
        }),
      ),
    );
  }

  // ---------- цель миссии ----------
  function renderGoal(): void {
    const m = c.state.mission;
    if (!m) return;
    const done = c.mission.jars.filter((j) => m.labels[j]);
    const idle =
      c.progress.settings.hints && m.status === 'experimenting' && Date.now() - c.state.lastActionAt > 60_000;
    replaceChildren(
      head,
      h(
        'div',
        { class: 'hl-goal', role: 'region', 'aria-label': c.mission.goalTitle },
        h('span', { class: 'hl-goal__icon' }, icon('target')),
        h(
          'div',
          { class: 'hl-goal__text' },
          h('div', { class: 'hl-goal__title' }, c.mission.goalTitle),
          h('div', { class: 'hl-goal__label' }, c.mission.goalLabel),
        ),
        h(
          'div',
          { class: 'hl-goal__progress' },
          h(
            'span',
            {
              class: 'hl-goal__slots',
              role: 'img',
              'aria-label': t('mission.progress', { count: done.length, total: c.mission.jars.length }),
            },
            ...c.mission.jars.map((j) => h('i', { class: m.labels[j] ? 'done' : '' }, j)),
          ),
        ),
        h(
          'button',
          {
            class: `hl-btn hl-btn--secondary hl-btn--sm${idle ? ' app-pulse' : ''}`,
            onclick: () => c.requestHint(),
          },
          icon('hint'),
          t('mission.help'),
        ),
        h(
          'button',
          {
            class: 'hl-btn hl-btn--secondary hl-btn--sm',
            'aria-disabled': String(done.length === 0),
            onclick: () => done.length > 0 && c.check(),
          },
          icon('check'),
          t('mission.check'),
        ),
      ),
    );
  }

  // ---------- стол ----------
  function wareFor(v: VesselState): WareRef {
    let w = wares.get(v.id);
    if (!w) {
      const svg = asset(ASSET[v.equipmentId] ?? 'equipment/beaker', { label: '' });
      const el = h('button', {
        class: 'hl-ware',
        style: `--w:${NATURAL_WIDTH[v.equipmentId] ?? 120}`,
        'data-vessel': v.id,
        onclick: () => c.select('vessel', v.id),
      });
      el.append(h('span', { class: 'hl-ware__halo' }), svg);
      w = { el, view: new VesselView(svg), equipmentId: v.equipmentId };
      wares.set(v.id, w);
    }
    return w;
  }

  function decorateWare(w: WareRef, v: VesselState): void {
    const sel = c.state.selected;
    const selected = sel?.kind === 'vessel' && sel.id === v.id;
    w.el.classList.toggle('is-selected', selected);
    w.el.setAttribute('aria-pressed', String(selected));
    const name = c.vesselName(v.id);
    const contents = c.contentsText(v.id);
    w.el.setAttribute('aria-label', `${name}${selected ? `, ${t('a11y.selected')}` : ''}: ${contents}`);
    for (const x of w.el.querySelectorAll('.hl-ware__tag, .hl-readout, .hl-steam, .app-holder')) x.remove();
    const visual = c.visual(v.id);
    if (visual) w.view.setVisual(visual);
    if (visual?.steam)
      w.el.append(h('span', { class: 'hl-steam', 'aria-hidden': 'true' }, asset('fx/steam', { label: '' })));
    if (v.inHolder)
      w.el.append(
        h(
          'span',
          { class: 'app-holder', 'aria-hidden': 'true' },
          asset('equipment/test-tube-holder', { label: '' }),
        ),
      );
    const temp = Math.round(v.temperatureC);
    const chip =
      Math.abs(temp - 20) >= 2
        ? h('span', { class: 'hl-ware__chip' }, icon('temperature'), t('vessel.temp', { value: temp }))
        : null;
    w.el.append(h('span', { class: 'hl-ware__tag' }, isMission ? String(v.no) : name, chip));
    const r = c.state.readout;
    if (r?.vesselId === v.id) {
      const scale =
        r.kind === 'ph' && r.ph !== undefined
          ? h(
              'span',
              { class: 'hl-ph-meter', 'aria-hidden': 'true' },
              h(
                'span',
                { class: 'hl-ph-scale' },
                ...Array.from({ length: 14 }, (_x, i) =>
                  h('i', { style: `background:var(--color-ph-${i + 1})` }),
                ),
              ),
              h('span', { class: 'hl-ph-mark', style: `--ph:${Math.round(r.ph)}` }),
            )
          : null;
      w.el.append(
        h(
          'span',
          { class: 'hl-readout', role: 'status' },
          h(
            'span',
            { class: 'hl-readout__icon' },
            icon(r.kind === 'ph' ? 'ph' : r.kind === 'mass' ? 'weigh' : 'temperature'),
          ),
          h(
            'span',
            {},
            h(
              'span',
              { class: 'hl-readout__row' },
              h('span', { class: 'hl-readout__value hl-num' }, r.value),
              h('span', { class: 'hl-readout__note' }, r.note),
            ),
            scale,
          ),
        ),
      );
    }
  }

  function renderBench(): void {
    const lab = c.state.lab;
    for (const id of [...wares.keys()]) if (!lab.vessels[id]) wares.delete(id);
    const onBurner = lab.order.find((id) => lab.vessels[id]?.heat === 'burner');
    const inIce = lab.order.find((id) => lab.vessels[id]?.heat === 'ice_bath');
    const benchVessels = lab.order.filter((id) => id !== onBurner && id !== inIce);
    const nodes: HTMLElement[] = [];
    if (isMission) {
      const rack = h(
        'div',
        { class: 'hl-rack' },
        asset('equipment/test-tube-rack', { label: '', className: 'hl-rack__back' }),
      );
      lab.order.forEach((id, i) => {
        const v = lab.vessels[id] as VesselState;
        const w = wareFor(v);
        decorateWare(w, v);
        w.el.style.left = `calc(${16 + i * 60}px * var(--u))`;
        if (benchVessels.includes(id)) rack.append(w.el);
      });
      rack.append(asset('equipment/test-tube-rack', { label: '', className: 'hl-rack__front' }));
      nodes.push(rack);
    } else {
      for (const id of benchVessels) {
        const v = lab.vessels[id] as VesselState;
        const w = wareFor(v);
        w.el.style.left = '';
        decorateWare(w, v);
        nodes.push(w.el);
      }
      if (benchVessels.length === 0)
        nodes.push(h('div', { class: 'hl-slot app-slot--wide' }, t('bench.empty')));
    }
    nodes.push(h('div', { class: 'hl-bench__spacer' }));
    // Горелка: сосуд над ней — внутри station__on.
    const burner = h(
      'div',
      { class: 'hl-station', style: '--w:132' },
      asset('equipment/burner', {
        label: t(onBurner ? 'station.burner.on' : 'station.burner.off'),
        vars: { '--flame': onBurner ? 1 : 0, '--heat': onBurner ? 1 : 0 },
      }),
    );
    if (onBurner) {
      const v = lab.vessels[onBurner] as VesselState;
      const w = wareFor(v);
      w.el.style.left = '';
      decorateWare(w, v);
      burner.append(
        h(
          'div',
          {
            class: 'hl-station__on',
            style: `bottom:calc(126px * var(--u));--w:${NATURAL_WIDTH[v.equipmentId] ?? 120}`,
          },
          w.el,
        ),
      );
    }
    burner.append(
      h(
        'span',
        { class: 'hl-station__label' },
        onBurner ? icon('heat') : null,
        onBurner ? `${t('station.burner')} · ${t('vessel.heating')}` : t('station.burner'),
      ),
    );
    nodes.push(burner);
    if (!isMission) {
      const ice = h(
        'div',
        { class: 'hl-station hl-ice' },
        asset('equipment/ice-bath', { label: '', className: 'hl-ice__back' }),
      );
      if (inIce) {
        const v = lab.vessels[inIce] as VesselState;
        const w = wareFor(v);
        decorateWare(w, v);
        ice.append(h('div', { class: 'hl-station__on', style: 'bottom:calc(24px * var(--u))' }, w.el));
      }
      ice.append(
        asset('equipment/ice-bath', { label: t('station.ice'), className: 'hl-ice__front' }),
        h('span', { class: 'hl-station__label' }, t('station.ice')),
      );
      nodes.push(ice);
    }
    replaceChildren(items, ...nodes);
  }

  // ---------- док действий ----------
  function act(
    label: string,
    iconName: string,
    key: string,
    run: () => void,
    opts: { cls?: string; why?: string | null; pressed?: boolean } = {},
  ): HTMLButtonElement {
    // Недоступная кнопка остаётся в порядке фокуса и объясняет, почему недоступна.
    return h(
      'button',
      {
        class: `hl-act ${opts.cls ?? ''}`,
        'aria-disabled': String(Boolean(opts.why)),
        title: opts.why ?? undefined,
        'aria-pressed': opts.pressed === undefined ? undefined : String(opts.pressed),
        'aria-keyshortcuts': key,
        'data-key': key.toLowerCase(),
        onclick: () => (opts.why ? c.set('toast', opts.why) : run()),
      },
      icon(iconName),
      h('span', {}, label),
      h('kbd', { class: 'hl-act__key' }, key),
    );
  }

  function renderDock(): void {
    const sel = c.state.selected;
    const v = sel?.kind === 'vessel' ? c.state.lab.vessels[sel.id] : undefined;
    const jarSel = sel?.kind === 'substance' ? sel.id : null;
    const run =
      (a: LabAction): (() => void) =>
      () =>
        void c.act(a);
    const none = !v;
    const empty = !v || v.origins.length === 0;
    const heating = v?.heat === 'burner';
    const cooling = v?.heat === 'ice_bath';
    const isTube = v?.equipmentId === 'test_tube';
    const whyNone = none ? t('dock.why.none') : null;
    const whyEmpty = whyNone ?? (empty ? t('dock.why.empty') : null);
    const whyHot = heating ? t('dock.why.heating') : null;
    const anyContents = c.state.lab.order.some((id) => (c.state.lab.vessels[id]?.origins.length ?? 0) > 0);
    const context = v
      ? h(
          'span',
          { class: 'hl-dock__vessel' },
          h('b', {}, c.vesselName(v.id)),
          h('span', {}, c.contentsText(v.id)),
        )
      : h(
          'span',
          { class: 'hl-dock__vessel' },
          h('b', {}, jarSel ? c.originName(c.jarSubstance(jarSel) ?? jarSel) : t('dock.none')),
          h('span', {}, jarSel ? t('bench.hint.select') : ''),
        );
    const magnify = (): void => {
      if (v) void c.act({ type: 'magnify', vesselId: v.id });
      else if (jarSel) void c.act({ type: 'magnify', substanceId: c.jarSubstance(jarSel) ?? jarSel });
    };
    const doRow = [
      act(t('act.stir'), 'stir', 'M', run({ type: 'stir', vesselId: v?.id ?? '' }), { why: whyEmpty }),
      act(
        heating ? t('act.heat.stop') : t('act.heat'),
        'heat',
        'H',
        run(
          heating
            ? { type: 'heat_stop', vesselId: v?.id ?? '' }
            : { type: 'heat_start', vesselId: v?.id ?? '' },
        ),
        { cls: 'hl-act--heat', why: whyNone, pressed: heating },
      ),
      ...(isMission
        ? []
        : [
            act(
              cooling ? t('act.cool.stop') : t('act.cool'),
              'cool',
              'C',
              run(
                cooling
                  ? { type: 'cool_stop', vesselId: v?.id ?? '' }
                  : { type: 'cool_start', vesselId: v?.id ?? '' },
              ),
              { cls: 'hl-act--cool', why: whyNone ?? whyHot, pressed: cooling },
            ),
          ]),
      act(t('act.wait'), 'wait', 'W', run({ type: 'wait' }), {
        why: anyContents ? null : t('dock.why.wait'),
      }),
      act(
        t('act.holder'),
        'hand',
        'D',
        run(
          v?.inHolder
            ? { type: 'detach_holder', vesselId: v.id }
            : { type: 'attach_holder', vesselId: v?.id ?? '' },
        ),
        { why: whyNone ?? (isTube ? null : t('dock.why.holder')), pressed: Boolean(v?.inHolder) },
      ),
      ...(isMission
        ? []
        : [
            act(
              t('act.remove'),
              'close',
              'R',
              () => v && (c.set('selected', null), void c.act({ type: 'remove', vesselId: v.id })),
              { cls: 'hl-act--quiet', why: whyNone ?? whyHot },
            ),
          ]),
    ];
    const observeRow = [
      act(t('act.smell'), 'smell', 'S', run({ type: 'smell', vesselId: v?.id ?? '' }), {
        cls: 'hl-act--observe',
        why: whyEmpty,
      }),
      act(t('act.magnify'), 'magnify', 'L', magnify, {
        cls: 'hl-act--observe',
        why: empty && !jarSel ? (none ? t('dock.why.magnify') : t('dock.why.empty')) : null,
      }),
      ...(isMission
        ? []
        : [
            act(
              t('act.temperature'),
              'temperature',
              'T',
              run({ type: 'measure_temperature', vesselId: v?.id ?? '' }),
              { cls: 'hl-act--observe', why: whyNone },
            ),
            act(t('act.ph'), 'ph', 'P', run({ type: 'measure_ph', vesselId: v?.id ?? '' }), {
              cls: 'hl-act--observe',
              why: whyEmpty,
            }),
          ]),
      act(t('act.undo'), 'undo', 'Z', () => c.undo(), {
        cls: 'hl-act--quiet hl-dock__split',
        why: c.state.history.length === 0 ? t('dock.why.undo') : null,
      }),
      act(t('act.clear'), 'clear', 'X', run({ type: 'clear', vesselId: v?.id ?? '' }), {
        cls: 'hl-act--quiet',
        why: whyEmpty ?? whyHot,
      }),
    ];
    const cols = Math.max(doRow.length, observeRow.length);
    dock.style.setProperty('--cols', String(cols));
    replaceChildren(
      dock,
      h('div', { class: 'hl-dock__context' }, context),
      h('div', { class: 'hl-dock__rowlabel', 'aria-hidden': 'true' }, t('dock.do')),
      ...doRow,
      h('div', { class: 'hl-dock__rowlabel', 'aria-hidden': 'true' }, t('dock.observe')),
      ...observeRow,
    );
  }

  // ---------- наложения: реплика, результат, количество, тост ----------
  function renderOverlay(): void {
    const s = c.state;
    const nodes: HTMLElement[] = [];
    const m = s.mission;
    if (s.speech) {
      setPose(s.speech.pose);
      const hint = s.speech.hint;
      const actions = (s.speech.actions ?? []).map((a) => {
        if (a === 'more_hint')
          return h(
            'button',
            { class: 'hl-btn hl-btn--sm hl-btn--secondary', onclick: () => c.requestHint() },
            t('mission.hint.more'),
          );
        if (a === 'next')
          return h(
            'button',
            { class: 'hl-btn hl-btn--sm hl-btn--primary', onclick: () => c.nextIntro() },
            t('mission.next'),
            icon('forward'),
          );
        if (a === 'start')
          return h(
            'button',
            { class: 'hl-btn hl-btn--sm hl-btn--primary', onclick: () => c.startExperiments() },
            t('mission.start'),
          );
        if (a === 'wash')
          return h(
            'button',
            { class: 'hl-btn hl-btn--sm hl-btn--primary', onclick: () => c.wash() },
            icon('hand'),
            t('mission.wash'),
          );
        return h(
          'button',
          { class: 'hl-btn hl-btn--sm hl-btn--ghost', onclick: () => c.set('speech', null) },
          hint ? t('mission.hint.close') : t('result.close'),
        );
      });
      nodes.push(
        h(
          'div',
          {
            class: `hl-guide-bubble hl-speech hl-speech--tail-left${s.speech.pose === 'warn' ? ' hl-speech--warn' : ''}${FX_INSTANT ? '' : ' fx-pop-in'}`,
            role: 'status',
            'aria-live': 'polite',
          },
          h(
            'div',
            { class: 'hl-speech__head' },
            h('span', { class: 'hl-speech__who' }, t('guide.name')),
            hint
              ? h(
                  'span',
                  { class: 'hl-speech__level' },
                  t('mission.hint.level', { level: hint.level }),
                  h(
                    'span',
                    { class: 'hl-speech__dots', 'aria-hidden': 'true' },
                    ...[1, 2, 3].map((i) => h('i', { class: i <= hint.level ? 'on' : '' })),
                  ),
                )
              : null,
          ),
          h('p', { class: 'hl-speech__text' }, s.speech.text),
          s.speech.checks
            ? h('ul', { class: 'app-checks' }, ...s.speech.checks.map((x) => h('li', {}, x)))
            : null,
          actions.length ? h('div', { class: 'hl-speech__actions' }, ...actions) : null,
        ),
      );
    } else setPose(m?.status === 'completed' ? 'happy' : 'explain');
    if (m?.status === 'completed') nodes.push(renderFinale());
    else if (s.result) {
      const r = s.result;
      const expanded = c.progress.settings.deeper;
      const deeper = r.deeper
        ? h(
            'div',
            { class: 'hl-deeper' },
            h(
              'button',
              {
                class: 'hl-deeper__toggle',
                'aria-expanded': String(expanded),
                onclick: (ev: Event) => {
                  const b = ev.currentTarget as HTMLButtonElement;
                  const open = b.getAttribute('aria-expanded') !== 'true';
                  b.setAttribute('aria-expanded', String(open));
                  (b.nextElementSibling as HTMLElement).hidden = !open;
                },
              },
              icon('deeper'),
              t('result.deeper'),
            ),
            h('div', { class: 'hl-deeper__body', hidden: !expanded }, h('p', {}, r.deeper)),
          )
        : null;
      nodes.push(
        h(
          'section',
          {
            class: `hl-result${FX_INSTANT ? '' : ' fx-pop-in'}`,
            role: 'dialog',
            'aria-modal': 'false',
            'aria-labelledby': 'res-title',
          },
          h(
            'div',
            { class: 'hl-result__head' },
            h('span', { class: 'hl-result__kicker' }, r.kicker),
            h(
              'button',
              {
                class: 'hl-btn hl-btn--ghost hl-btn--icon hl-btn--sm',
                'aria-label': t('result.close'),
                onclick: () => c.set('result', null),
              },
              icon('close'),
            ),
          ),
          h('h2', { class: 'hl-result__title', id: 'res-title' }, r.title),
          r.lens && LENS_VIEWS.includes(r.lens)
            ? h('div', { class: 'app-lens' }, asset(`lens/${r.lens}`, { label: '' }))
            : null,
          h(
            'div',
            { class: 'hl-result__obs' },
            ...r.lines.map((l) =>
              h(
                'div',
                { class: `hl-observation hl-observation--${l.tone}` },
                h('span', { class: 'hl-observation__icon' }, icon(l.icon)),
                h(
                  'div',
                  {},
                  h('div', { class: 'hl-observation__title' }, l.title),
                  l.sub ? h('div', { class: 'hl-observation__sub' }, l.sub) : null,
                ),
              ),
            ),
          ),
          h('p', { class: 'hl-result__text' }, r.why),
          deeper,
          h(
            'div',
            { class: 'hl-result__actions' },
            h(
              'button',
              { class: 'hl-btn hl-btn--primary', onclick: () => c.set('result', null) },
              t('result.close'),
            ),
          ),
        ),
      );
    }
    if (s.qty) nodes.push(renderQty());
    if (s.toast)
      nodes.push(
        h(
          'div',
          { class: `hl-scene__toast hl-toast${FX_INSTANT ? '' : ' fx-pop-in'}`, role: 'status' },
          h('span', { class: 'hl-toast__icon' }, icon('star')),
          h('span', {}, s.toast),
        ),
      );
    replaceChildren(overlay, ...nodes);
  }

  function renderQty(): HTMLElement {
    const q = c.state.qty as NonNullable<typeof c.state.qty>;
    const sub = ix.substances.get(q.substanceId);
    const unit = sub?.dosing ?? 'portion_solid';
    return h(
      'div',
      { class: 'hl-popover app-qty', role: 'dialog', 'aria-label': t('qty.title') },
      h('div', { class: 'hl-popover__title' }, t('qty.title')),
      h(
        'div',
        { class: 'hl-popover__sub' },
        `${sub?.shortName ?? ''} → ${q.vesselId ? c.vesselName(q.vesselId) : ''}`,
      ),
      h(
        'div',
        { class: 'hl-popover__row' },
        h(
          'div',
          { class: 'hl-qty' },
          h(
            'button',
            {
              class: 'hl-qty__btn',
              'aria-label': t('qty.less'),
              disabled: q.count <= 1,
              onclick: () => c.setQty(q.count - 1),
            },
            icon('minus'),
          ),
          h(
            'span',
            { class: 'hl-qty__value', 'aria-live': 'polite' },
            h('b', {}, String(q.count)),
            h('span', {}, c.portionsText(q.count, unit).replace(/^\d+\s/, '')),
          ),
          h(
            'button',
            {
              class: 'hl-qty__btn',
              'aria-label': t('qty.more'),
              disabled: q.count >= 10,
              onclick: () => c.setQty(q.count + 1),
            },
            icon('plus'),
          ),
        ),
        h(
          'div',
          { class: 'hl-qty__presets' },
          ...[1, 2, 3, 5].map((n) =>
            h(
              'button',
              { class: 'hl-qty__preset', 'aria-pressed': String(q.count === n), onclick: () => c.setQty(n) },
              String(n),
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'hl-popover__actions' },
        h('button', { class: 'hl-btn hl-btn--ghost', onclick: () => c.set('qty', null) }, t('qty.cancel')),
        h('button', { class: 'hl-btn hl-btn--primary', onclick: () => c.confirmQty() }, t('qty.add')),
      ),
    );
  }

  function renderFinale(): HTMLElement {
    const m = c.state.mission;
    const rowsEl = c.mission.jars.map((jar) => {
      const s = m?.jarSubstance[jar] ?? '';
      const proof = Object.entries(m?.board[jar] ?? {})
        .map(
          ([test, chip]) =>
            c.mission.tests.find((x) => x.id === test)?.chips.find((x) => x.id === chip)?.label,
        )
        .filter(Boolean)
        .join(', ');
      return h(
        'tr',
        {},
        h('th', { scope: 'row' }, jar),
        h('td', {}, ix.substances.get(s)?.shortName ?? s),
        h('td', {}, proof),
      );
    });
    return h(
      'section',
      { class: 'hl-result', role: 'dialog', 'aria-labelledby': 'fin-title' },
      h('h2', { class: 'hl-result__title', id: 'fin-title' }, t('mission.done.title')),
      h('div', { class: 'app-badge' }, asset('badges/powder-detective', { label: t('mission.badge') })),
      ...c.mission.finale.map((x) => h('p', { class: 'hl-result__text' }, x)),
      h('table', { class: 'hl-grid app-proof' }, h('tbody', {}, ...rowsEl)),
      h(
        'div',
        { class: 'hl-result__actions' },
        h(
          'button',
          { class: 'hl-btn hl-btn--primary', onclick: () => c.openMission(true) },
          t('mission.again'),
        ),
        h(
          'button',
          { class: 'hl-btn hl-btn--secondary', onclick: () => (location.hash = '#/lab') },
          t('mission.sandbox'),
        ),
        h('button', { class: 'hl-btn hl-btn--ghost', onclick: goHome }, t('mission.home')),
      ),
    );
  }

  // ---------- модальные окна ----------
  function renderModal(): void {
    const s = c.state;
    if (s.stop) {
      replaceChildren(
        modal,
        h(
          'div',
          { class: 'hl-scrim' },
          h(
            'section',
            {
              class: 'hl-dialog hl-dialog--caution',
              role: 'alertdialog',
              'aria-modal': 'true',
              'aria-labelledby': 'stop-title',
              'aria-describedby': 'stop-text',
            },
            h(
              'div',
              { class: 'hl-dialog__band' },
              h('span', { class: 'hl-stop-art' }, asset('character/guide-warn', { label: '' })),
              h(
                'div',
                {},
                h('div', { class: 'hl-stop-kicker' }, icon('caution'), t('stop.kicker')),
                h('h2', { class: 'hl-dialog__title', id: 'stop-title' }, s.stop.title),
              ),
            ),
            h(
              'div',
              { class: 'hl-dialog__body', id: 'stop-text' },
              h('p', {}, s.stop.text),
              s.stop.deeper ? h('p', { class: 'hl-muted hl-sm' }, s.stop.deeper) : null,
            ),
            h(
              'div',
              { class: 'hl-dialog__actions' },
              h(
                'button',
                { class: 'hl-btn hl-btn--primary', autofocus: true, onclick: () => c.set('stop', null) },
                t('stop.ok'),
              ),
            ),
          ),
        ),
      );
      modal.querySelector<HTMLButtonElement>('.hl-btn--primary')?.focus();
    } else if (s.labelPicker) {
      const jar = s.labelPicker;
      replaceChildren(
        modal,
        h(
          'div',
          {
            class: 'hl-scrim',
            onclick: (e: Event) => e.target === e.currentTarget && c.set('labelPicker', null),
          },
          h(
            'section',
            { class: 'hl-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'label-title' },
            h('h2', { class: 'hl-dialog__title', id: 'label-title' }, t('mission.label.title', { jar })),
            h(
              'div',
              { class: 'hl-dialog__body app-labels' },
              ...c.mission.unknowns.map((sid) =>
                h(
                  'button',
                  {
                    class: 'hl-btn hl-btn--secondary',
                    'aria-pressed': String(s.mission?.labels[jar] === sid),
                    onclick: () => c.setLabel(jar, sid),
                  },
                  ix.substances.get(sid)?.shortName ?? sid,
                ),
              ),
            ),
            h(
              'div',
              { class: 'hl-dialog__actions' },
              h(
                'button',
                { class: 'hl-btn hl-btn--ghost', onclick: () => c.setLabel(jar, null) },
                t('mission.label.none'),
              ),
              h(
                'button',
                { class: 'hl-btn hl-btn--primary', onclick: () => c.set('labelPicker', null) },
                t('result.close'),
              ),
            ),
          ),
        ),
      );
      modal.querySelector<HTMLButtonElement>('.app-labels .hl-btn')?.focus();
    } else replaceChildren(modal);
  }

  // ---------- общий цикл ----------
  let lastAnnounce = '';
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  function render(full: boolean): void {
    if (full) {
      renderTopbar();
      renderShelf();
      if (isMission) renderGoal();
      else renderRail();
      renderDock();
      renderOverlay();
      renderModal();
      replaceChildren(journal, ...renderJournal(c));
      journal.classList.toggle('is-open', c.state.journalOpen);
    }
    renderBench();
    for (const e of c.lastEvents) {
      if (e.type !== 'observation') continue;
      const def = effectFor(ix.effects, e);
      if (def) wares.get(e.vesselId)?.view.play(def);
    }
    c.lastEvents = [];
    if (c.state.announce && c.state.announce !== lastAnnounce) {
      lastAnnounce = c.state.announce;
      (c.state.stop ? alertAnnouncer : announcer).textContent = c.state.announce;
    }
    if (c.state.toast && !toastTimer) {
      toastTimer = setTimeout(() => {
        toastTimer = null;
        c.set('toast', null);
      }, 4000);
    }
  }
  c.onChange(render);
  render(true);

  // Время: тики движка, пока идут процессы или горит горелка; автоостановка нагрева.
  const physics = bundle.physics;
  const clock = setInterval(() => {
    const heating = c.state.lab.order.find((id) => c.state.lab.vessels[id]?.heat === 'burner');
    if (
      heating &&
      c.state.heatStartedAt &&
      Date.now() - c.state.heatStartedAt > physics.heatAutoStopS * 1000
    ) {
      c.act({ type: 'heat_stop', vesselId: heating });
      return;
    }
    if (c.needsTicks || heating)
      c.act({ type: 'tick', seconds: 0.25 * (heating ? physics.heatTimeScale : 1) * (FX_INSTANT ? 4 : 1) });
    if (isMission && Date.now() - c.state.lastActionAt > 60_000) renderGoal();
  }, 250);

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') return c.closeOverlays();
    if (
      e.ctrlKey ||
      e.metaKey ||
      e.altKey ||
      (e.target as HTMLElement).closest('input, textarea, [role="dialog"], [role="alertdialog"]')
    )
      return;
    const btn = dock.querySelector<HTMLButtonElement>(`[data-key="${e.key.toLowerCase()}"]`);
    if (btn) {
      e.preventDefault();
      btn.click();
    }
  };
  document.addEventListener('keydown', onKey);
  const stopDrag = enableDrag(lab, c);
  return () => {
    clearInterval(clock);
    document.removeEventListener('keydown', onKey);
    stopDrag();
  };
}

/** Перетаскивание вещества с полки на сосуд (дублирует «тап-тап» и клавиатуру). */
function enableDrag(root: HTMLElement, c: LabController): () => void {
  let start: { x: number; y: number; id: string; source: HTMLElement } | null = null;
  let ghost: HTMLElement | null = null;
  let target: HTMLElement | null = null;
  const down = (e: PointerEvent): void => {
    const src = (e.target as HTMLElement).closest<HTMLElement>('[data-drag-substance]');
    if (src) start = { x: e.clientX, y: e.clientY, id: src.dataset['dragSubstance'] ?? '', source: src };
  };
  const move = (e: PointerEvent): void => {
    if (!start) return;
    if (!ghost && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 10) return;
    if (!ghost) {
      const art = start.source.querySelector('.hl-substance__art');
      ghost = h('div', { class: 'app-drag-ghost', 'aria-hidden': 'true' }, art ? art.cloneNode(true) : null);
      document.body.append(ghost);
    }
    ghost.style.transform = `translate(${e.clientX - 30}px, ${e.clientY - 40}px)`;
    const over =
      document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-vessel]') ?? null;
    if (over !== target) {
      target?.classList.remove('is-drop-target');
      target = over;
      target?.classList.add('is-drop-target');
    }
  };
  const up = (): void => {
    if (ghost && start && target?.dataset['vessel']) {
      const vesselId = target.dataset['vessel'];
      const suppress = (ev: Event): void => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      start.source.addEventListener('click', suppress, { capture: true, once: true });
      setTimeout(() => start?.source.removeEventListener('click', suppress, { capture: true }), 0);
      c.addFromShelf(start.id, vesselId);
    }
    ghost?.remove();
    target?.classList.remove('is-drop-target');
    ghost = null;
    target = null;
    start = null;
  };
  root.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  return () => {
    root.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
  };
}
