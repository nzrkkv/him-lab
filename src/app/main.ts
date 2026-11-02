/** Точка входа: маршруты на #, узкий экран, граница ошибок. */
import { t } from '../ui/content.ts';
import { h, replaceChildren } from '../ui/dom.ts';
import { LabController } from '../ui/lab/controller.ts';
import { mountLab } from '../ui/lab/view.ts';
import { mountHome, mountParents } from '../ui/pages/home.ts';
import { mountLesson } from '../ui/lesson/player.ts';
import { availableSubstances, progress, resetProgressView } from '../ui/progress-store.ts';
import { applyTestModeParam, setTestMode, testMode } from '../ui/test-mode.ts';
import { bundle } from '../ui/content.ts';

const root = document.getElementById('app') as HTMLElement;
let unmount: (() => void) | null = null;
let narrowAccepted = false;

function goHome(): void {
  location.hash = '#/';
}

/** Плашка тестового режима: заметна на всех экранах, кнопка выключает режим. */
function renderTestBanner(): void {
  document.getElementById('test-mode-bar')?.remove();
  document.body.classList.toggle('app-test-mode', testMode());
  if (!testMode()) return;
  document.body.prepend(
    h(
      'div',
      { id: 'test-mode-bar', class: 'app-test-bar', role: 'status' },
      h('span', {}, t('testmode.banner')),
      h(
        'button',
        {
          class: 'hl-btn hl-btn--sm',
          onclick: () => {
            setTestMode(false);
            resetProgressView();
            route();
          },
        },
        t('testmode.off'),
      ),
    ),
  );
}

function route(): void {
  if (applyTestModeParam()) resetProgressView();
  renderTestBanner();
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
  const hash = location.hash.replace(/^#/, '').split('?')[0] || '/';
  try {
    if (hash.startsWith('/lab/mission/')) {
      unmount = mountLab(root, new LabController('mission'), goHome);
      document.title = `${t('home.mission')} — ${t('app.title')}`;
    } else if (hash === '/lab') {
      unmount = mountLab(root, new LabController('sandbox'), goHome);
      document.title = `${t('home.sandbox')} — ${t('app.title')}`;
    } else if (hash.startsWith('/lesson/')) {
      const id = (hash.split('/')[2] ?? '').replace(/-/g, '_');
      const lesson = bundle.lessons.find((l) => l.id === id);
      if (!lesson) return goHome();
      unmount = mountLesson(root, lesson, goHome);
      document.title = `${lesson.title} — ${t('app.title')}`;
    } else if (hash === '/parents') {
      mountParents(root);
    } else {
      mountHome(root, progress(), availableSubstances().length);
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
