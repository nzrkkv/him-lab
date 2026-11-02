/** Точка входа: маршруты на #, узкий экран, граница ошибок. */
import { loadProgress } from '../core/progress/progress.ts';
import { readKey } from '../platform/storage.ts';
import { t } from '../ui/content.ts';
import { h, replaceChildren } from '../ui/dom.ts';
import { LabController } from '../ui/lab/controller.ts';
import { mountLab } from '../ui/lab/view.ts';
import { mountHome } from '../ui/pages/home.ts';

const root = document.getElementById('app') as HTMLElement;
let unmount: (() => void) | null = null;
let narrowAccepted = false;

function goHome(): void {
  location.hash = '#/';
}

function route(): void {
  unmount?.();
  unmount = null;
  document.title = t('app.title');
  if (window.innerWidth < 744 && !narrowAccepted) {
    replaceChildren(
      root,
      h(
        'main',
        { class: 'app-narrow' },
        h('h1', { class: 'hl-h2' }, t('narrow.title')),
        h(
          'button',
          { class: 'hl-btn hl-btn--primary', onclick: () => ((narrowAccepted = true), route()) },
          t('narrow.open'),
        ),
      ),
    );
    return;
  }
  const hash = location.hash.replace(/^#/, '') || '/';
  try {
    if (hash.startsWith('/lab/mission/')) {
      unmount = mountLab(root, new LabController('mission'), goHome);
      document.title = `${t('home.mission')} — ${t('app.title')}`;
    } else if (hash === '/lab') {
      unmount = mountLab(root, new LabController('sandbox'), goHome);
      document.title = `${t('home.sandbox')} — ${t('app.title')}`;
    } else {
      const p = loadProgress(readKey('progress'));
      const progress = p.ok ? p.progress : null;
      mountHome(root, {
        missionInProgress: Boolean(progress?.mission && progress.mission.status !== 'completed'),
        missionDone: Boolean(progress?.missionsCompleted.length),
      });
    }
  } catch (e) {
    console.error(e);
    replaceChildren(
      root,
      h(
        'main',
        { class: 'app-narrow' },
        h('h1', { class: 'hl-h2' }, t('error.title')),
        h('a', { class: 'hl-btn hl-btn--primary', href: '#/' }, t('error.home')),
      ),
    );
  }
}

window.addEventListener('hashchange', route);
route();
