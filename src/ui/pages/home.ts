/** Главная прототипа: вход в миссию и песочницу, короткий текст для родителей (макет design/mockups/home.html — упрощённо). */
import { asset } from '../../fx/assets.ts';
import { h, icon, replaceChildren } from '../dom.ts';
import { t } from '../content.ts';

export function mountHome(
  root: HTMLElement,
  opts: { missionInProgress: boolean; missionDone: boolean },
): void {
  const card = (href: string, title: string, sub: string, iconName: string, primary: boolean): HTMLElement =>
    h(
      'a',
      {
        class: `hl-card hl-card--interactive app-home__card${primary ? ' app-home__card--primary' : ''}`,
        href,
      },
      h('span', { class: 'app-home__icon' }, icon(iconName, 'hl-icon hl-icon--lg')),
      h(
        'span',
        { class: 'app-home__text' },
        h('span', { class: 'hl-title' }, title),
        h('span', { class: 'hl-muted' }, sub),
      ),
      icon('forward'),
    );
  replaceChildren(
    root,
    h(
      'main',
      { class: 'app-home' },
      h(
        'header',
        { class: 'app-home__head' },
        h(
          'span',
          { class: 'hl-logo' },
          h('span', { class: 'hl-logo__mark' }, asset('brand/logo-mark', { label: '' })),
          h('span', { class: 'hl-logo__word' }, t('app.title')),
        ),
        h('span', { class: 'hl-tag hl-tag--lamp' }, t('app.prototype')),
      ),
      h(
        'section',
        { class: 'app-home__hero' },
        h('div', { class: 'app-home__guide' }, asset('character/guide-happy', { label: t('guide.name') })),
        h(
          'div',
          {},
          h('h1', { class: 'hl-h1' }, t('app.title')),
          h('p', { class: 'hl-lg app-home__tagline' }, t('app.tagline')),
        ),
      ),
      h(
        'nav',
        { class: 'app-home__cards', 'aria-label': t('app.title') },
        card(
          '#/lab/mission/powder-mystery',
          opts.missionInProgress ? t('home.continue') : t('home.mission'),
          t('home.mission.sub'),
          'target',
          true,
        ),
        card('#/lab', t('home.sandbox'), t('home.sandbox.sub'), 'sandbox', false),
      ),
      opts.missionDone
        ? h(
            'p',
            { class: 'app-home__done' },
            asset('badges/powder-detective', { label: t('mission.badge') }),
            t('mission.badge'),
          )
        : null,
      h(
        'section',
        { class: 'app-home__parents hl-card' },
        h('h2', { class: 'hl-h3' }, t('home.parents')),
        h('p', { class: 'hl-sm' }, t('home.parents.text')),
      ),
    ),
  );
}
