/** Экраны урока на всю ширину: тест, «попробуй дома», награда; картинки для «найди ошибки». */
import type { Lesson, Question } from '../../core/content-model/types.ts';
import { gradeChoice, gradePair, placeCard, testScore, type SortAnswer } from '../../core/lesson/lesson.ts';
import type { LessonProgress, ProgressV1 } from '../../core/progress/progress.ts';
import { asset } from '../../fx/assets.ts';
import { bundle, ix, t } from '../content.ts';
import { h, icon } from '../dom.ts';

interface QState {
  picked: string[];
  solved: boolean;
  mistakes: number;
  feedback: { kind: 'right' | 'wrong' | 'partial'; lines: string[] } | null;
  placed?: SortAnswer;
  matched?: string[];
}

let selection: string | null = null;

const BADGES = [
  'first-experiment',
  'safety-pro',
  'powder-detective',
  'observer',
  'discoverer',
  'solution-master',
];

/** Тест: по одному вопросу; ошибка объясняется, ответить можно снова; итог — верно с первой попытки. */
export function renderTest(
  lesson: Lesson,
  lp: LessonProgress,
  rerender: () => void,
  announce: (s: string) => void,
): HTMLElement {
  const a = lp.answers;
  const qs = lesson.test.questions;
  if (a['test_done'] === true) {
    const score = testScore(qs, lp.testFirst);
    return h(
      'div',
      { class: 'app-test app-test--summary' },
      asset('badges/observer', { label: t('badge.observer') }),
      h(
        'h3',
        { class: 'hl-h2' },
        lesson.test.summary.replace('{count}', String(score.count)).replace('{total}', String(score.total)),
      ),
      h('p', {}, t('lesson.test.after')),
    );
  }
  const idx = Math.min(typeof a['test_q'] === 'number' ? a['test_q'] : 0, qs.length - 1);
  const q = qs[idx] as Question;
  const key = `q_${q.id}`;
  const st = (a[key] ??= { picked: [], solved: false, mistakes: 0, feedback: null }) as QState;
  const first = (ok: boolean): void => {
    if (lp.testFirst[q.id] === undefined) lp.testFirst[q.id] = ok;
  };
  const feedback = (kind: 'right' | 'wrong' | 'partial', lines: string[]): void => {
    st.feedback = { kind, lines };
    announce(lines.join(' '));
  };
  const next = (): void => {
    selection = null;
    if (idx + 1 >= qs.length) a['test_done'] = true;
    else a['test_q'] = idx + 1;
    rerender();
  };

  let body: HTMLElement;
  if (q.type === 'single' || q.type === 'predict' || q.type === 'multi') {
    const multi = q.type === 'multi';
    body = h(
      'div',
      { class: 'app-test__options', role: 'group', 'aria-label': q.prompt },
      ...q.options.map((o, i) =>
        h(
          'button',
          {
            class: `hl-choice${st.solved && o.correct ? ' is-correct' : ''}`,
            'aria-pressed': String(st.picked.includes(o.id)),
            disabled: st.solved ? true : undefined,
            onclick: () => {
              if (multi) {
                st.picked = st.picked.includes(o.id)
                  ? st.picked.filter((x) => x !== o.id)
                  : [...st.picked, o.id];
                st.feedback = null;
              } else {
                st.picked = [o.id];
                const v = gradeChoice(q, st.picked);
                first(v.kind === 'right');
                st.solved = v.kind === 'right';
                feedback(v.kind, v.explain);
              }
              rerender();
            },
          },
          h('span', { class: 'hl-choice__mark' }, String.fromCharCode(1072 + i)),
          o.label,
        ),
      ),
      multi && !st.solved
        ? h(
            'button',
            {
              class: 'hl-btn hl-btn--primary',
              'aria-disabled': String(st.picked.length === 0),
              onclick: () => {
                if (!st.picked.length) return;
                const v = gradeChoice(q, st.picked);
                first(v.kind === 'right');
                st.solved = v.kind === 'right';
                feedback(v.kind, v.explain);
                rerender();
              },
            },
            t('mission.check'),
          )
        : null,
    );
  } else if (q.type === 'sort') {
    const placed = (st.placed ??= {});
    const pool = q.cards.filter((c) => !placed[c.id]);
    body = h(
      'div',
      { class: 'app-sort' },
      h(
        'div',
        { class: 'app-sort__pool', role: 'group', 'aria-label': t('lesson.sort.cards') },
        ...pool.map((c) =>
          h(
            'button',
            {
              class: 'hl-btn hl-btn--secondary app-card',
              'aria-pressed': String(selection === c.id),
              onclick: () => ((selection = selection === c.id ? null : c.id), rerender()),
            },
            c.label,
          ),
        ),
      ),
      h(
        'div',
        { class: 'app-sort__shelves', style: `--n:${q.shelves.length}` },
        ...q.shelves.map((s) =>
          h(
            'div',
            { class: 'app-shelf' },
            h(
              'button',
              {
                class: `app-shelf__head${selection ? ' is-target' : ''}`,
                'aria-label': t('lesson.sort.put', { shelf: s.label }),
                onclick: () => {
                  if (!selection) return announce(t('lesson.sort.pick'));
                  const r = placeCard(q.cards, placed, selection, s.id);
                  st.placed = r.placed;
                  if (!r.ok) {
                    st.mistakes += 1;
                    first(false);
                    feedback('wrong', [r.explain ?? '']);
                  } else feedback('right', [t('lesson.sort.right')]);
                  selection = null;
                  if (q.cards.every((c) => st.placed?.[c.id] === c.shelf)) {
                    first(st.mistakes === 0);
                    st.solved = true;
                  }
                  rerender();
                },
              },
              s.label,
            ),
            h(
              'div',
              { class: 'app-shelf__items' },
              ...q.cards
                .filter((c) => placed[c.id] === s.id)
                .map((c) => h('span', { class: 'app-card is-placed' }, icon('check'), c.label)),
            ),
          ),
        ),
      ),
    );
  } else {
    const matched = (st.matched ??= []);
    // Правый столбец — в другом порядке (сдвиг), чтобы пары не стояли напротив.
    const rights = q.pairs.map((_p, i) => q.pairs[(i + 2) % q.pairs.length] as (typeof q.pairs)[number]);
    body = h(
      'div',
      { class: 'app-match' },
      h(
        'div',
        { class: 'app-match__col' },
        ...q.pairs.map((p) =>
          h(
            'button',
            {
              class: `hl-btn hl-btn--secondary app-card${matched.includes(p.id) ? ' is-placed' : ''}`,
              disabled: matched.includes(p.id) ? true : undefined,
              'aria-pressed': String(selection === p.id),
              onclick: () => ((selection = p.id), rerender()),
            },
            matched.includes(p.id) ? icon('check') : null,
            p.left,
          ),
        ),
      ),
      h(
        'div',
        { class: 'app-match__col' },
        ...rights.map((p) =>
          h(
            'button',
            {
              class: `hl-btn hl-btn--secondary app-card${matched.includes(p.id) ? ' is-placed' : ''}${selection ? ' is-target' : ''}`,
              disabled: matched.includes(p.id) ? true : undefined,
              onclick: () => {
                if (!selection) return announce(t('lesson.match.pick'));
                const r = gradePair(q, selection, p.id);
                if (r.ok) {
                  st.matched = [...matched, p.id];
                  feedback('right', [t('lesson.sort.right')]);
                } else {
                  st.mistakes += 1;
                  first(false);
                  feedback('wrong', [r.explain]);
                }
                selection = null;
                if (q.pairs.every((x) => st.matched?.includes(x.id))) {
                  first(st.mistakes === 0);
                  st.solved = true;
                }
                rerender();
              },
            },
            matched.includes(p.id) ? icon('check') : null,
            p.right,
          ),
        ),
      ),
    );
  }

  const art =
    q.type === 'predict' && q.art === 'salt_water'
      ? h(
          'div',
          { class: 'app-test__art' },
          asset('equipment/test-tube', { label: '', vars: { '--level': 0.5, '--powder': 0.5 } }),
          asset('containers/jar', { label: '', vars: { '--fill': 0.7, '--lid-color': '#1F5FCC' } }),
        )
      : q.type === 'predict' && q.art === 'iodine'
        ? h(
            'div',
            { class: 'app-test__art' },
            asset('containers/bottle', {
              label: '',
              vars: {
                '--liquid-color': bundle.colors['color.substance.iodine'] ?? '#B5651D',
                '--level': 0.7,
              },
            }),
            asset('containers/jar', { label: '', vars: { '--fill': 0.7 } }),
          )
        : null;
  return h(
    'div',
    { class: 'app-test' },
    h(
      'p',
      { class: 'hl-muted' },
      idx === 0 ? lesson.test.intro : t('lesson.test.progress', { n: idx + 1, total: qs.length }),
    ),
    h(
      'div',
      {
        class: 'hl-progress-bar',
        role: 'progressbar',
        'aria-valuenow': idx + 1,
        'aria-valuemin': 1,
        'aria-valuemax': qs.length,
        style: `--value:${((idx + 1) / qs.length) * 100}%`,
      },
      h('i', {}),
    ),
    h('h3', { class: 'hl-h2 app-test__q' }, q.prompt),
    art,
    body,
    st.feedback
      ? h(
          'div',
          { class: `ls-verdict${st.feedback.kind === 'right' ? '' : ' app-verdict--try'}`, role: 'status' },
          icon(st.feedback.kind === 'right' ? 'check' : 'info'),
          h(
            'div',
            {},
            ...st.feedback.lines.map((l) => h('p', {}, l)),
            st.feedback.kind !== 'right' && !st.solved
              ? h('p', { class: 'hl-muted' }, t('lesson.test.retry'))
              : null,
          ),
        )
      : null,
    st.solved
      ? h(
          'button',
          { class: 'hl-btn hl-btn--primary hl-btn--lg app-test__next', onclick: next },
          idx + 1 >= qs.length ? t('lesson.test.finish') : t('lesson.test.next'),
          icon('forward'),
        )
      : null,
  );
}

export function renderHomeExperiment(lesson: Lesson): HTMLElement {
  const x = lesson.home;
  return h(
    'div',
    { class: 'app-home-exp' },
    h(
      'div',
      { class: 'app-home-exp__head' },
      h('h3', { class: 'hl-h2' }, x.title),
      h('span', { class: 'hl-tag hl-tag--home' }, icon('home'), x.meta),
    ),
    h('p', { class: 'hl-lg' }, x.intro),
    h(
      'section',
      { class: 'app-home-exp__safety', 'aria-label': t('lesson.home.safety') },
      h('h4', {}, icon('caution'), t('lesson.home.safety')),
      h('ul', {}, ...x.safety.map((s) => h('li', {}, s))),
    ),
    h(
      'div',
      { class: 'app-home-exp__cols' },
      h(
        'section',
        {},
        h('h4', {}, t('lesson.home.materials')),
        h('ul', {}, ...x.materials.map((s) => h('li', {}, s))),
      ),
      h(
        'section',
        {},
        h('h4', {}, t('lesson.home.steps')),
        h('ol', {}, ...x.steps.map((s) => h('li', {}, s))),
      ),
    ),
    h('h4', {}, x.expectedTitle),
    h(
      'table',
      { class: 'hl-grid app-home-exp__table' },
      h('thead', {}, h('tr', {}, ...x.columns.map((c) => h('th', { scope: 'col' }, c)))),
      h(
        'tbody',
        {},
        ...x.rows.map((r) =>
          h('tr', {}, ...r.map((c, i) => (i === 0 ? h('th', { scope: 'row' }, c) : h('td', {}, c)))),
        ),
      ),
    ),
    ...x.notes.map((n) => h('p', { class: 'hl-sm' }, n)),
    h(
      'button',
      { class: 'hl-btn hl-btn--secondary', onclick: () => window.print() },
      icon('pencil'),
      t('lesson.home.print'),
    ),
  );
}

export function renderReward(lesson: Lesson, p: ProgressV1): HTMLElement {
  const r = lesson.reward;
  const unlocked = bundle.sandbox.unlocks
    .flatMap((u) => (u.by === lesson.id || u.by === 'powder_mystery' ? u.substances : []))
    .map((id) => ix.substances.get(id)?.shortName ?? id);
  return h(
    'div',
    { class: 'app-reward' },
    h('div', { class: 'app-reward__badge' }, asset(`badges/${r.badge}`, { label: r.title })),
    h('h3', { class: 'hl-h1' }, r.title),
    h('p', { class: 'hl-lg' }, r.text),
    unlocked.length ? h('p', {}, h('b', {}, t('lesson.reward.unlocked')), ' ', unlocked.join(', ')) : null,
    h(
      'ul',
      { class: 'app-reward__badges', 'aria-label': t('home.badges') },
      ...BADGES.filter((b) => p.badges.includes(b)).map((b) =>
        h(
          'li',
          { class: 'hl-badge' },
          asset(`badges/${b}`, { label: '' }),
          h('span', { class: 'hl-badge__name' }, t(`badge.${b}`)),
        ),
      ),
    ),
    h('h4', {}, t('journal.ideas')),
    h('ul', { class: 'app-reward__ideas' }, ...r.ideas.map((i) => h('li', {}, i))),
    h(
      'div',
      { class: 'app-reward__actions' },
      h(
        'a',
        { class: 'hl-btn hl-btn--primary hl-btn--lg', href: '#/lab' },
        icon('sandbox'),
        t('home.sandbox'),
      ),
      h('a', { class: 'hl-btn hl-btn--secondary hl-btn--lg', href: '#/' }, icon('map'), t('lesson.finish')),
    ),
  );
}

/** Картинки «найди ошибки»: композиции из ассетов дизайна. */
export function renderSpotArt(art: string): HTMLElement {
  const box = (...nodes: Element[]): HTMLElement =>
    h('span', { class: `app-art app-art--${art}`, 'aria-hidden': 'true' }, ...nodes);
  const v = (goggles: boolean): SVGSVGElement =>
    asset('character/vintik', {
      label: '',
      className: 'app-art__vintik',
      vars: { '--goggles': goggles ? 1 : 0 },
    });
  switch (art) {
    case 'vintik_no_goggles':
      return box(v(false));
    case 'vintik_cookie':
      return box(v(true), asset('fx/cookie', { label: '', className: 'app-art__cookie' }));
    case 'vintik_sniff':
      return box(
        v(true),
        asset('equipment/flask', { label: '', className: 'app-art__flask', vars: { '--level': 0.4 } }),
      );
    case 'fan':
      return box(
        asset('equipment/flask', { label: '', className: 'app-art__flask', vars: { '--level': 0.4 } }),
        asset('fx/fan-hand', { label: '', className: 'app-art__hand' }),
      );
    case 'tube_hand':
      return box(
        asset('equipment/burner', { label: '', className: 'app-art__burner' }),
        asset('equipment/test-tube', { label: '', className: 'app-art__tube', vars: { '--level': 0.3 } }),
        asset('fx/fan-hand', { label: '', className: 'app-art__grip' }),
      );
    case 'tube_holder':
      return box(
        asset('equipment/burner', { label: '', className: 'app-art__burner' }),
        asset('equipment/test-tube', { label: '', className: 'app-art__tube', vars: { '--level': 0.3 } }),
        asset('equipment/test-tube-holder', { label: '', className: 'app-art__holder' }),
      );
    case 'jar_nolabel':
      return box(
        asset('containers/jar', { label: '', vars: { '--fill': 0.7, '--lid-color': '#A7B0CA' } }),
        h('span', { class: 'app-art__q' }, '?') as unknown as Element,
      );
    case 'puddle':
      return box(
        asset('equipment/beaker', { label: '', vars: { '--level': 0.5 } }),
        asset('fx/puddle', { label: '', className: 'app-art__puddle' }),
      );
    default:
      return box(asset('character/guide-happy', { label: '' }));
  }
}
