/** Правая панель: журнал песочницы или детективная доска миссии (макеты lab-sandbox.html и lab-mission.html). */
import { h, icon } from '../dom.ts';
import { bundle, ix, t } from '../content.ts';
import type { LabController } from './controller.ts';

const RESULT_CLASS: Record<string, string> = {
  'result-dissolve': 'r--dissolve',
  'result-turbid': 'r--turbid',
  'result-gas': 'r--gas',
  'result-color': 'r--color',
  'result-nothing': 'r--nothing',
};

export function renderJournal(c: LabController): HTMLElement[] {
  return c.state.mode === 'mission' ? board(c) : sandboxLog(c);
}

function sandboxLog(c: LabController): HTMLElement[] {
  const log = [...c.progress.sandboxLog].reverse().slice(0, 14);
  const toneIcon = (tone: string): string =>
    tone === 'nothing'
      ? 'result-nothing'
      : tone === 'caution'
        ? 'caution'
        : tone === 'discovery'
          ? 'star'
          : 'eye';
  const discoveries = c.progress.discoveries.map((id) => ix.species.get(id)?.discoverable?.name ?? id);
  return [
    h(
      'div',
      { class: 'hl-journal__head' },
      icon('journal'),
      h('h2', {}, t('journal.title')),
      h('span', { class: 'hl-journal__count' }, t('journal.count', { count: c.progress.sandboxLog.length })),
    ),
    h(
      'div',
      { class: 'hl-journal__body' },
      h(
        'section',
        { class: `hl-jsec${log.length ? '' : ' hl-jsec--empty'}` },
        h(
          'div',
          { class: 'hl-jsec__head' },
          h('span', { class: 'hl-jsec__step' }, icon('eye')),
          h('span', { class: 'hl-jsec__title' }, t('journal.done')),
        ),
        ...(log.length
          ? log.map((l) =>
              h(
                'div',
                { class: 'hl-logline' },
                h(
                  'span',
                  {
                    class: `hl-logline__icon${l.tone === 'nothing' ? ' hl-logline__icon--neutral' : l.tone === 'discovery' ? ' hl-logline__icon--discovery' : ''}`,
                  },
                  icon(toneIcon(l.tone)),
                ),
                h(
                  'span',
                  { class: 'hl-logline__text' },
                  h('b', {}, l.title),
                  l.detail ? h('small', {}, l.detail) : null,
                ),
              ),
            )
          : [h('p', { class: 'hl-jsec__hint' }, t('journal.empty'))]),
      ),
      h(
        'section',
        { class: 'hl-jsec hl-jsec--empty' },
        h(
          'div',
          { class: 'hl-jsec__head' },
          h('span', { class: 'hl-logline__icon hl-logline__icon--discovery' }, icon('star')),
          h('span', { class: 'hl-jsec__title' }, t('journal.discoveries', { count: discoveries.length })),
        ),
        discoveries.length ? h('p', { class: 'hl-jsec__hint' }, discoveries.join(', ')) : null,
        h('div', { class: 'hl-jsec__head' }, h('span', { class: 'hl-jsec__title' }, t('journal.ideas'))),
        ...bundle.sandbox.ideas.map((x) => h('p', { class: 'hl-jsec__hint' }, x)),
      ),
    ),
  ];
}

function board(c: LabController): HTMLElement[] {
  const m = c.state.mission;
  const def = c.mission;
  const icons = new Map<string, string>();
  for (const test of def.tests) for (const chip of test.chips) icons.set(`${test.id}:${chip.id}`, chip.icon);
  const legend = [...new Set(def.tests.flatMap((x) => x.chips.map((ch) => ch.icon)))].filter(
    (i) => RESULT_CLASS[i],
  );
  return [
    h('div', { class: 'hl-journal__head' }, icon('journal'), h('h2', {}, t('board.title'))),
    h(
      'div',
      { class: 'hl-journal__body' },
      h(
        'section',
        { class: 'hl-jsec' },
        h(
          'table',
          { class: 'hl-grid' },
          h('caption', { class: 'hl-sr' }, t('board.caption')),
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              h('th', {}, h('span', { class: 'hl-sr' }, t('board.test'))),
              ...def.jars.map((j) => h('th', { scope: 'col' }, j)),
            ),
          ),
          h(
            'tbody',
            {},
            ...def.tests.map((test) =>
              h(
                'tr',
                {},
                h('th', { scope: 'row' }, test.label),
                ...def.jars.map((jar) => {
                  const chipId = m?.board[jar]?.[test.id];
                  const chip = test.chips.find((x) => x.id === chipId);
                  if (!chip) return h('td', {}, h('span', { class: 'hl-sr' }, t('board.untested')));
                  const ic = icons.get(`${test.id}:${chip.id}`) ?? 'result-nothing';
                  return h(
                    'td',
                    { class: `r ${RESULT_CLASS[ic] ?? 'r--color'}`, title: chip.label },
                    icon(ic),
                    h('span', { class: 'app-chip' }, chip.label),
                  );
                }),
              ),
            ),
            h(
              'tr',
              { class: 'app-label-row' },
              h('th', { scope: 'row' }, t('mission.label.button')),
              ...def.jars.map((jar) => {
                const label = m?.labels[jar];
                const status = c.state.checks?.find((x) => x.jar === jar)?.status;
                return h(
                  'td',
                  {},
                  h(
                    'button',
                    {
                      class: `hl-btn hl-btn--sm ${label ? 'hl-btn--secondary' : 'hl-btn--ghost'} app-label-btn${status === 'correct' ? ' is-correct' : ''}`,
                      'aria-label': `${t('mission.label.title', { jar })}${label ? `: ${ix.substances.get(label)?.shortName ?? ''}` : ''}`,
                      onclick: () => c.set('labelPicker', jar),
                    },
                    status === 'correct' ? icon('check') : null,
                    label ? (ix.substances.get(label)?.shortName ?? label) : icon('pencil'),
                  ),
                );
              }),
            ),
          ),
        ),
        h(
          'div',
          { class: 'hl-legend' },
          ...legend.map((i) =>
            h(
              'span',
              {},
              icon(i),
              def.tests.flatMap((x) => x.chips).find((ch) => ch.icon === i)?.label ?? '',
            ),
          ),
        ),
      ),
      h(
        'section',
        { class: 'hl-jsec hl-jsec--empty' },
        h('p', { class: 'hl-jsec__hint' }, t('board.howto')),
        h(
          'button',
          {
            class: 'hl-btn hl-btn--primary hl-btn--block',
            'aria-disabled': String(!def.jars.some((j) => m?.labels[j])),
            onclick: () => def.jars.some((j) => m?.labels[j]) && c.check(),
          },
          icon('check'),
          t('mission.check'),
        ),
      ),
    ),
  ];
}
