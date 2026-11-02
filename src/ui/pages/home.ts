/** Главная и карта модуля 1 по макету design/mockups/home.html: урок 1 → миссия → песочница, прогресс, значки. */
import type { ProgressV1 } from '../../core/progress/progress.ts';
import { asset } from '../../fx/assets.ts';
import { bundle, t } from '../content.ts';
import { h, icon, replaceChildren } from '../dom.ts';

const BADGES = ['first-experiment', 'safety-pro', 'powder-detective', 'observer'];

export function routeOf(lessonId: string): string {
  return `#/lesson/${lessonId.replace(/_/g, '-')}`;
}

export function mountHome(root: HTMLElement, p: ProgressV1, sandboxCount: number): void {
  const mod = bundle.modules.find((m) => m.order === 1);
  const lessons = mod?.lessons ?? [];
  const lesson1 = bundle.lessons[0];
  const lp = lesson1 ? p.lessons[lesson1.id] : undefined;
  const done = lessons.filter((l) => p.lessons[l.id]?.completed).length;
  const total = lesson1?.screens.length ?? 1;
  const step = lp ? Math.min(lp.screen + 1, total) : 0;

  const nodes = lessons.map((l, i) => {
    const available = bundle.lessons.some((x) => x.id === l.id);
    const completed = p.lessons[l.id]?.completed === true;
    const current = available && !completed && i === lessons.findIndex((x) => !p.lessons[x.id]?.completed);
    const flask = asset('equipment/flask', {
      label: '',
      vars: {
        '--level': completed ? 0.8 : current ? 0.35 : 0,
        '--liquid-color': 'var(--color-guide-body, #8A6CF0)',
      },
    });
    const label = available
      ? `${t('home.lesson.n', { n: i + 1 })}: ${l.title}`
      : `${t('home.lesson.n', { n: i + 1 })}: ${l.title}. ${t('home.locked')}`;
    return h(
      'li',
      { class: `mp-node${current ? ' mp-node--current' : ''}${available ? '' : ' mp-node--locked'}` },
      available
        ? h(
            'a',
            { class: 'mp-flask', href: routeOf(l.id), 'aria-label': label },
            flask,
            h('span', { class: 'mp-num' }, completed ? icon('check') : String(i + 1)),
          )
        : h(
            'span',
            { class: 'mp-flask', 'aria-label': label, role: 'img' },
            flask,
            h('span', { class: 'mp-num' }, icon('lock')),
          ),
      h(
        'div',
        { class: 'mp-text' },
        h('b', {}, l.title),
        h('span', {}, l.subtitle),
        current ? h('span', { class: 'mp-here' }, t('home.here')) : null,
        !available ? h('span', {}, t('home.soon')) : null,
      ),
    );
  });

  replaceChildren(
    root,
    h(
      'header',
      { class: 'hm-top' },
      h(
        'a',
        { class: 'hl-logo', href: '#/', 'aria-label': t('app.title') },
        h('span', { class: 'hl-logo__mark' }, asset('brand/logo-mark', { label: '' })),
        h('span', { class: 'hl-logo__word' }, t('app.title')),
      ),
      h(
        'nav',
        { class: 'hm-nav', 'aria-label': t('home.sections') },
        h('a', { href: '#/', 'aria-current': 'page' }, icon('map'), t('home.lessons')),
        h('a', { href: '#/lab' }, icon('sandbox'), t('home.sandbox')),
        h('a', { href: '#/lab/mission/powder-mystery' }, icon('target'), t('home.mission.link')),
      ),
      h(
        'div',
        { class: 'hm-top__right' },
        h('a', { class: 'hm-parents', href: '#/parents' }, t('home.parents')),
      ),
    ),
    h(
      'main',
      { class: 'hm' },
      h(
        'section',
        { class: 'hm-module', 'aria-labelledby': 'mod-title' },
        h(
          'div',
          { class: 'hm-module__head' },
          h(
            'div',
            {},
            h('small', {}, t('home.module', { n: 1 })),
            h('h1', { id: 'mod-title' }, mod?.title ?? ''),
            h('p', {}, mod?.subtitle ?? ''),
          ),
          h(
            'div',
            { class: 'hm-progress' },
            h('span', {}, t('home.done.count', { n: done, total: lessons.length })),
            h(
              'div',
              {
                class: 'hl-progress-bar',
                role: 'progressbar',
                'aria-valuenow': done,
                'aria-valuemin': 0,
                'aria-valuemax': lessons.length,
                style: `--value:${Math.max(4, (done / Math.max(1, lessons.length)) * 100)}%`,
              },
              h('i', {}),
            ),
          ),
        ),
        h('div', { class: 'mp' }, h('ol', { class: 'mp-list' }, ...nodes)),
      ),
      h(
        'aside',
        { class: 'hm-side' },
        h(
          'div',
          { class: 'hm-cont' },
          asset('character/guide-happy', { label: '', className: 'hm-cont__art' }),
          h('small', {}, t('home.continue.title')),
          h('h2', {}, t('home.lesson.n', { n: 1 })),
          h('p', { class: 'hm-cont__name' }, lesson1?.title ?? ''),
          h(
            'p',
            {},
            lp?.completed
              ? t('home.lesson.done')
              : lp
                ? t('home.lesson.step', { n: step, total })
                : t('app.tagline'),
          ),
          h(
            'div',
            {
              class: 'hl-progress-bar',
              role: 'progressbar',
              'aria-valuenow': step,
              'aria-valuemin': 0,
              'aria-valuemax': total,
              style: `--value:${Math.max(4, (step / total) * 100)}%`,
            },
            h('i', {}),
          ),
          h(
            'a',
            {
              class: 'hl-btn hl-btn--primary hl-btn--lg hl-btn--block',
              href: lp?.completed ? '#/lab' : routeOf(lesson1?.id ?? ''),
            },
            lp?.completed ? t('home.sandbox') : lp ? t('home.continue') : t('home.start'),
            icon('forward'),
          ),
        ),
        h(
          'a',
          { class: 'hm-sand', href: '#/lab' },
          icon('sandbox'),
          h(
            'span',
            {},
            h('b', {}, t('home.sandbox')),
            h('small', {}, t('home.sandbox.open', { n: sandboxCount })),
          ),
          icon('forward'),
        ),
        h(
          'div',
          { class: 'hm-badges' },
          h('h2', {}, t('home.badges')),
          h(
            'ul',
            {},
            ...BADGES.map((b) =>
              h(
                'li',
                { class: `hl-badge${p.badges.includes(b) ? '' : ' is-locked'}` },
                asset(`badges/${b}`, { label: '' }),
                h('span', { class: 'hl-badge__name' }, t(`badge.${b}`)),
                h('span', { class: 'hl-sr' }, p.badges.includes(b) ? '' : t('home.locked')),
              ),
            ),
          ),
        ),
      ),
      h(
        'section',
        { class: 'hm-modules', 'aria-labelledby': 'mods' },
        h('h2', { id: 'mods' }, t('home.modules')),
        h(
          'ol',
          {},
          ...bundle.modules.map((m) =>
            h(
              'li',
              { class: `hm-mod${m.lessons.length ? ' hm-mod--open' : ''}` },
              h('i', {}, String(m.order)),
              h(
                'span',
                {},
                m.title,
                h(
                  'small',
                  {},
                  m.lessons.length ? t('home.lessons.count', { n: m.lessons.length }) : t('home.soon'),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

export function mountParents(root: HTMLElement): void {
  replaceChildren(
    root,
    h(
      'main',
      { class: 'app-home' },
      h('a', { class: 'hl-btn hl-btn--ghost', href: '#/' }, icon('back'), t('top.back')),
      h('h1', { class: 'hl-h1' }, t('parents.title')),
      h('p', { class: 'hl-lg' }, t('home.parents.text')),
      h('p', {}, t('parents.home')),
    ),
  );
}
