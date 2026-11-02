/**
 * Плеер урока по шаблону «сначала опыт, потом объяснение» (макет design/mockups/lesson.html).
 * Экран = заголовок, реплика Пипы, блоки из данных; «Дальше» доступна, когда блоки пройдены.
 * Слева — сцена (опыт, сортировка, тест…), справа — разговор (реплики, вопросы, правила, «копнуть глубже»).
 */
import type { Lesson, LessonBlock, LessonScreen } from '../../core/content-model/types.ts';
import { blockDone, choicePicked, placeCard, screenDone, type SortAnswer } from '../../core/lesson/lesson.ts';
import { awardBadge, lessonProgress } from '../../core/progress/progress.ts';
import { asset } from '../../fx/assets.ts';
import { FX_INSTANT } from '../../fx/vessel-view.ts';
import { bundle, ix, t } from '../content.ts';
import { h, icon, replaceChildren } from '../dom.ts';
import { progress, saveProgress } from '../progress-store.ts';
import { mountMiniLab } from './mini-lab.ts';
import { renderHomeExperiment, renderReward, renderSpotArt, renderTest } from './screens.ts';

const BENCH_BLOCKS = new Set(['jars', 'lab', 'sort', 'spot', 'mission', 'test', 'home', 'reward']);
const FULL_BLOCKS = new Set(['test', 'home', 'reward', 'spot']);

export function mountLesson(root: HTMLElement, lesson: Lesson, goHome: () => void): () => void {
  const p = progress();
  const lp = lessonProgress(p, lesson.id);
  const answers = lp.answers;
  const ctx = { missionCompleted: (id: string) => p.missionsCompleted.includes(id) };
  let selectedCard: string | null = null;
  let sortFeedback: { id: string; ok: boolean; text: string } | null = null;
  let spotStarted = Date.now();
  const save = (): void => saveProgress();

  const top = h('header', { class: 'ls-top' });
  const bench = h('section', { class: 'ls-bench', 'aria-label': t('lesson.scene') });
  const panel = h('section', { class: 'ls-panel', 'aria-label': t('lesson.talk') });
  const main = h('main', { class: 'ls-main' }, bench, panel);
  const live = h('div', { class: 'hl-sr', role: 'status', 'aria-live': 'polite' });
  replaceChildren(root, h('div', { class: 'ls' }, top, main), live);

  const screen = (): LessonScreen =>
    lesson.screens[Math.min(lp.screen, lesson.screens.length - 1)] as LessonScreen;
  const announce = (text: string): void => void (live.textContent = text);

  function renderTop(): void {
    const sc = screen();
    const stageIdx = lesson.stages.findIndex((s) => s.id === sc.stage);
    const stage = lesson.stages[stageIdx];
    replaceChildren(
      top,
      h(
        'a',
        { class: 'hl-btn hl-btn--ghost hl-btn--icon', href: '#/', 'aria-label': t('lesson.close') },
        icon('close'),
      ),
      h(
        'div',
        { class: 'ls-top__title' },
        h(
          'small',
          {},
          t('lesson.step', { n: stageIdx + 1, total: lesson.stages.length, stage: stage?.label ?? '' }),
        ),
        h('b', {}, lesson.title),
      ),
      h(
        'ol',
        { class: 'ls-steps', 'aria-label': t('lesson.steps') },
        ...lesson.stages.map((s, i) =>
          h(
            'li',
            {
              class: `ls-step ${i < stageIdx ? 'done' : i === stageIdx ? 'current' : ''}`,
              'aria-current': i === stageIdx ? 'step' : undefined,
            },
            h('span', {}, s.label),
            h('i', {}),
          ),
        ),
      ),
    );
  }

  function guideBubble(sc: LessonScreen, extra: string[]): HTMLElement | null {
    const lines = [...(sc.guide?.lines ?? []), ...extra];
    if (!lines.length) return null;
    return h(
      'div',
      { class: 'ls-guide' },
      asset(`character/guide-${extra.length ? 'happy' : (sc.guide?.pose ?? 'explain')}`, { label: '' }),
      h(
        'div',
        { class: `hl-speech hl-speech--tail-left${FX_INSTANT ? '' : ' fx-pop-in'}`, style: '--tail-y:40px' },
        h('div', { class: 'hl-speech__head' }, h('span', { class: 'hl-speech__who' }, t('guide.name'))),
        ...lines.map((l) => h('p', { class: 'hl-speech__text' }, rich(l))),
      ),
    );
  }

  // ---------- блоки разговора (правая колонка) ----------
  function choiceCard(b: Extract<LessonBlock, { type: 'choice' }>): HTMLElement {
    const picked = choicePicked(answers, b.id);
    const last = b.options.find((o) => o.id === picked[picked.length - 1]);
    const hasCorrect = b.options.some((o) => o.correct);
    const solved = blockDone(b, answers, ctx);
    return h(
      'div',
      { class: 'ls-card' },
      h('h3', {}, b.question),
      b.art === 'fan'
        ? h(
            'div',
            { class: 'app-fan' },
            asset('equipment/flask', { label: '', vars: { '--level': 0.4 } }),
            asset('fx/fan-hand', { label: t('lesson.fan') }),
          )
        : null,
      h(
        'div',
        { class: 'ls-chips', role: 'group', 'aria-label': b.question },
        ...b.options.map((o) =>
          h(
            'button',
            {
              class: 'ls-chip',
              'aria-pressed': String(picked.includes(o.id)),
              disabled: solved && hasCorrect && !picked.includes(o.id) ? true : undefined,
              onclick: () => {
                answers[b.id] = { picked: [...picked.filter((x) => x !== o.id), o.id] };
                save();
                announce(o.reply);
                renderPanel();
              },
            },
            picked.includes(o.id) && (o.correct || !hasCorrect) ? icon('check') : null,
            o.label,
          ),
        ),
      ),
      last
        ? h(
            'div',
            { class: `ls-verdict${hasCorrect && !last.correct ? ' app-verdict--try' : ''}` },
            icon(hasCorrect && !last.correct ? 'info' : 'star'),
            h('span', {}, rich(last.reply)),
          )
        : null,
      last && solved && b.after
        ? h('div', { class: 'app-after' }, ...b.after.map((x) => h('p', {}, rich(x))))
        : null,
    );
  }

  function predictCard(b: Extract<LessonBlock, { type: 'predict' }>): HTMLElement {
    const chosen = typeof answers[b.id] === 'string' ? (answers[b.id] as string) : null;
    return h(
      'div',
      { class: 'ls-card' },
      h('h3', {}, b.question),
      h(
        'div',
        { class: 'ls-chips', role: 'group', 'aria-label': b.question },
        ...b.options.map((o) =>
          h(
            'button',
            {
              class: 'ls-chip',
              'aria-pressed': String(chosen === o.id),
              onclick: () => {
                answers[b.id] = o.id;
                save();
                render();
              },
            },
            chosen === o.id ? icon('check') : null,
            o.label,
          ),
        ),
      ),
      chosen ? h('p', { class: 'hl-muted hl-sm' }, t('lesson.predict.saved')) : null,
    );
  }

  function labVerdict(b: Extract<LessonBlock, { type: 'lab' }>): HTMLElement | null {
    if (!blockDone(b, answers, ctx) || !b.predict) return null;
    const guess = answers[b.predict.from];
    const yes = guess === b.predict.match;
    return h(
      'div',
      { class: `ls-verdict${yes ? '' : ' app-verdict--try'}` },
      icon(yes ? 'star' : 'info'),
      h('span', {}, yes ? b.predict.yes : b.predict.no),
    );
  }

  function renderPanel(): void {
    const sc = screen();
    const nodes: (HTMLElement | null)[] = [];
    const doneLines = sc.blocks.flatMap((b) =>
      b.type === 'lab' && blockDone(b, answers, ctx) ? b.done : [],
    );
    if (!FULL_BLOCKS.has(sc.blocks[0]?.type ?? '')) nodes.push(guideBubble(sc, doneLines));
    for (const b of sc.blocks) {
      if (b.type === 'goggles') {
        const on = answers['goggles'] === true;
        nodes.push(
          on
            ? null
            : h(
                'div',
                { class: 'ls-card' },
                h('h3', {}, b.prompt),
                h(
                  'button',
                  {
                    class: 'hl-btn hl-btn--primary',
                    onclick: () => ((answers['goggles'] = true), save(), render()),
                  },
                  icon('goggles'),
                  t('lesson.goggles.put'),
                ),
              ),
        );
      } else if (b.type === 'predict') nodes.push(predictCard(b));
      else if (b.type === 'choice') {
        // Мини-вопрос после опыта появляется, когда опыт сделан.
        const labBefore = sc.blocks
          .slice(0, sc.blocks.indexOf(b))
          .filter((x) => x.type === 'lab' || x.type === 'sort');
        if (labBefore.every((x) => blockDone(x, answers, ctx))) nodes.push(choiceCard(b));
      } else if (b.type === 'lab') nodes.push(labVerdict(b));
      else if (b.type === 'rule')
        nodes.push(
          h(
            'div',
            { class: 'ls-card app-rule' },
            h('h3', {}, icon('shield'), b.title),
            h('ul', {}, ...b.lines.map((l) => h('li', {}, rich(l)))),
          ),
        );
    }
    if (sc.sci?.length) {
      nodes.push(
        h(
          'div',
          { class: 'ls-sci', 'aria-label': t('lesson.sci') },
          ...sc.sci.map((id) => {
            const s = ix.substances.get(id);
            return h(
              'span',
              {},
              `${s?.name ?? id}, ${t('result.sci')} — `,
              h('b', {}, s?.scientificName ?? ''),
            );
          }),
        ),
      );
    }
    if (sc.deeper) {
      const open = p.settings.deeper;
      nodes.push(
        h(
          'div',
          { class: 'hl-deeper' },
          h(
            'button',
            {
              class: 'hl-deeper__toggle',
              'aria-expanded': String(open),
              onclick: (e: Event) => {
                const btn = e.currentTarget as HTMLButtonElement;
                const now = btn.getAttribute('aria-expanded') !== 'true';
                btn.setAttribute('aria-expanded', String(now));
                (btn.nextElementSibling as HTMLElement).hidden = !now;
                const seen = (answers['deeper_opened'] as string[] | undefined) ?? [];
                if (now && !seen.includes(sc.id)) answers['deeper_opened'] = [...seen, sc.id];
                save();
              },
            },
            icon('deeper'),
            sc.deeper.title,
          ),
          h(
            'div',
            { class: 'hl-deeper__body', hidden: !open },
            ...sc.deeper.body.map((x) => h('p', {}, rich(x))),
          ),
        ),
      );
    }
    nodes.push(nextRow(sc));
    replaceChildren(panel, ...nodes);
  }

  function nextRow(sc: LessonScreen): HTMLElement {
    const ok = screenDone(sc, answers, ctx);
    const last = lp.screen >= lesson.screens.length - 1;
    const nextScreen = lesson.screens[lp.screen + 1];
    const nextStage = lesson.stages.find((s) => s.id === nextScreen?.stage);
    return h(
      'div',
      { class: 'ls-next' },
      lp.screen > 0
        ? h(
            'button',
            { class: 'hl-btn hl-btn--ghost', onclick: () => go(-1) },
            icon('back'),
            t('lesson.back'),
          )
        : null,
      h('p', {}, ok ? (sc.next ?? '') : t('lesson.todo')),
      last
        ? h(
            'a',
            { class: 'hl-btn hl-btn--primary hl-btn--lg', href: '#/' },
            t('lesson.finish'),
            icon('forward'),
          )
        : h(
            'button',
            {
              class: 'hl-btn hl-btn--primary hl-btn--lg',
              'aria-disabled': String(!ok),
              onclick: () => (ok ? go(1) : announce(t('lesson.todo'))),
            },
            nextScreen?.stage !== sc.stage && nextStage ? nextStage.label : t('lesson.next'),
            icon('forward'),
          ),
    );
  }

  function go(delta: number): void {
    lp.screen = Math.max(0, Math.min(lesson.screens.length - 1, lp.screen + delta));
    selectedCard = null;
    sortFeedback = null;
    spotStarted = Date.now();
    save();
    render();
    window.scrollTo(0, 0);
    (top.querySelector('h1, b') as HTMLElement | null)?.focus?.();
  }

  // ---------- блоки сцены (левая колонка) ----------
  function sortBoard(b: Extract<LessonBlock, { type: 'sort' }>): HTMLElement {
    const placed = (answers[b.id] ?? {}) as SortAnswer;
    const pool = b.cards.filter((c) => !placed[c.id]);
    return h(
      'div',
      { class: 'app-sort' },
      h(
        'p',
        { class: 'app-sort__prompt' },
        b.prompt,
        ' ',
        h('span', { class: 'hl-muted' }, t('lesson.sort.how')),
      ),
      h(
        'div',
        { class: 'app-sort__pool', role: 'group', 'aria-label': t('lesson.sort.cards') },
        ...pool.map((c) =>
          h(
            'button',
            {
              class: 'hl-btn hl-btn--secondary app-card',
              'aria-pressed': String(selectedCard === c.id),
              onclick: () => ((selectedCard = selectedCard === c.id ? null : c.id), renderBench()),
            },
            c.label,
          ),
        ),
        pool.length === 0 ? h('p', { class: 'ls-verdict' }, icon('star'), t('lesson.sort.done')) : null,
      ),
      h(
        'div',
        { class: 'app-sort__shelves', style: `--n:${b.shelves.length}` },
        ...b.shelves.map((s) =>
          h(
            'div',
            { class: 'app-shelf' },
            h(
              'button',
              {
                class: `app-shelf__head${selectedCard ? ' is-target' : ''}`,
                'aria-label': t('lesson.sort.put', { shelf: s.label }),
                onclick: () => {
                  if (!selectedCard) return announce(t('lesson.sort.pick'));
                  const r = placeCard(b.cards, placed, selectedCard, s.id);
                  answers[b.id] = r.placed;
                  sortFeedback = {
                    id: selectedCard,
                    ok: r.ok,
                    text: r.ok ? t('lesson.sort.right') : (r.explain ?? ''),
                  };
                  announce(sortFeedback.text);
                  selectedCard = null;
                  save();
                  render();
                },
              },
              s.label,
            ),
            h(
              'div',
              { class: 'app-shelf__items' },
              ...b.cards
                .filter((c) => placed[c.id] === s.id)
                .map((c) => h('span', { class: 'app-card is-placed' }, icon('check'), c.label)),
            ),
          ),
        ),
      ),
      sortFeedback
        ? h(
            'div',
            { class: `ls-verdict${sortFeedback.ok ? '' : ' app-verdict--try'}`, role: 'status' },
            icon(sortFeedback.ok ? 'check' : 'info'),
            h('span', {}, sortFeedback.text),
          )
        : null,
    );
  }

  function spotGrid(b: Extract<LessonBlock, { type: 'spot' }>): HTMLElement {
    const found = (answers[b.id] ?? []) as string[];
    const looked = (answers[`${b.id}_looked`] ?? []) as string[];
    const mistakes = b.cards.filter((c) => c.mistake);
    const hint = Date.now() - spotStarted > 30_000;
    const all = mistakes.every((c) => found.includes(c.id));
    return h(
      'div',
      { class: 'app-spot' },
      h(
        'p',
        { class: 'app-spot__count', role: 'status' },
        t('lesson.spot.count', { n: found.length, total: mistakes.length }),
      ),
      h(
        'div',
        { class: 'app-spot__grid' },
        ...b.cards.map((c) => {
          const isFound = found.includes(c.id);
          const isLooked = looked.includes(c.id);
          return h(
            'button',
            {
              class: `app-spot__card${isFound ? ' is-found' : ''}${isLooked && !c.mistake ? ' is-ok' : ''}${hint && c.mistake && !isFound ? ' app-pulse' : ''}`,
              'aria-label': c.label,
              onclick: () => {
                if (c.mistake && !isFound) answers[b.id] = [...found, c.id];
                if (!looked.includes(c.id)) answers[`${b.id}_looked`] = [...looked, c.id];
                announce(c.rule);
                if (
                  c.mistake &&
                  mistakes.every((m) => m.id === c.id || found.includes(m.id)) &&
                  awardBadge(p, 'safety-pro')
                )
                  announce(`${c.rule} ${b.done.join(' ')}`);
                save();
                render();
              },
            },
            h('span', { class: 'app-spot__art' }, renderSpotArt(c.art)),
            isFound || (isLooked && !c.mistake)
              ? h('span', { class: 'app-spot__rule' }, icon(c.mistake ? 'caution' : 'check'), c.rule)
              : null,
          );
        }),
      ),
      all
        ? h(
            'div',
            { class: 'ls-verdict' },
            asset('badges/safety-pro', { label: t('badge.safety-pro') }),
            h('span', {}, b.done.join(' ')),
          )
        : null,
    );
  }

  function missionCard(b: Extract<LessonBlock, { type: 'mission' }>): HTMLElement {
    const m = bundle.missions.find((x) => x.id === b.missionId);
    const doneM = ctx.missionCompleted(b.missionId);
    return h(
      'div',
      { class: 'app-mission-card' },
      asset('badges/powder-detective', { label: '' }),
      h('h3', { class: 'hl-h3' }, m?.title ?? ''),
      h('p', {}, m?.goalTitle ?? '', '. ', m?.goalLabel ?? ''),
      doneM
        ? h('p', { class: 'ls-verdict' }, icon('check'), t('lesson.mission.done'))
        : h(
            'a',
            { class: 'hl-btn hl-btn--primary hl-btn--lg', href: '#/lab/mission/powder-mystery' },
            icon('target'),
            t('lesson.mission.open'),
          ),
    );
  }

  function jarsRow(b: Extract<LessonBlock, { type: 'jars' }>): HTMLElement {
    return h(
      'div',
      { class: 'app-jars', role: 'img', 'aria-label': t('lesson.jars', { list: b.letters.join(', ') }) },
      ...b.letters.map((l) =>
        h(
          'button',
          {
            class: 'app-jars__jar',
            'aria-label': t('shelf.jar', { jar: l }),
            onclick: (e: Event) => (e.currentTarget as HTMLElement).classList.toggle('is-wobble'),
          },
          asset('containers/jar', {
            label: '',
            vars: { '--substance-color': '#FFFFFF', '--lid-color': 'var(--color-ink-300)', '--fill': 0.7 },
          }),
          h('span', { class: 'app-jars__letter' }, l),
        ),
      ),
    );
  }

  function renderBench(): void {
    const sc = screen();
    const goggles = answers['goggles'] === true;
    const nodes: (HTMLElement | null)[] = [
      h(
        'div',
        { class: 'ls-bench__head' },
        h('div', {}, h('h2', { tabindex: '-1' }, sc.title), sc.lead ? h('p', {}, sc.lead) : null),
        goggles ? h('span', { class: 'ls-goggles' }, icon('goggles'), t('lesson.goggles.on')) : null,
      ),
    ];
    const content = h('div', { class: 'app-bench__body' });
    for (const b of sc.blocks) {
      if (b.type === 'lab') {
        if (sc.blocks.some((x) => x.type === 'goggles') && !goggles) continue;
        if (sc.blocks.some((x) => x.type === 'predict' && typeof answers[x.id] !== 'string')) {
          content.append(h('p', { class: 'app-wait' }, t('lesson.lab.predict_first')));
          continue;
        }
        const ml = mountMiniLab(b, (answers[b.id] ?? []) as string[], (id) => {
          const list = (answers[b.id] ?? []) as string[];
          if (!list.includes(id)) answers[b.id] = [...list, id];
          if (awardBadge(p, 'first-experiment')) announce(t('badge.first-experiment'));
          save();
          renderPanel();
        });
        content.append(ml.el, ml.controls);
      } else if (b.type === 'sort') content.append(sortBoard(b));
      else if (b.type === 'spot') content.append(spotGrid(b));
      else if (b.type === 'mission') content.append(missionCard(b));
      else if (b.type === 'jars') content.append(jarsRow(b));
      else if (b.type === 'test') content.append(renderTest(lesson, lp, () => (save(), render()), announce));
      else if (b.type === 'home') content.append(renderHomeExperiment(lesson));
      else if (b.type === 'reward') content.append(renderReward(lesson, p));
    }
    if (!sc.blocks.some((b) => BENCH_BLOCKS.has(b.type)))
      content.append(
        h(
          'div',
          { class: 'app-bench__guide' },
          asset(`character/guide-${sc.guide?.pose ?? 'explain'}`, { label: '' }),
        ),
      );
    nodes.push(content);
    replaceChildren(bench, ...nodes);
  }

  function render(): void {
    const sc = screen();
    const full = FULL_BLOCKS.has(sc.blocks[0]?.type ?? '');
    main.classList.toggle('app-ls--full', full);
    document.documentElement.classList.toggle('app-goggles', answers['goggles'] === true);
    if (answers['test_done'] === true) awardBadge(p, 'observer');
    if (sc.blocks.some((b) => b.type === 'reward')) {
      lp.completed = true;
      awardBadge(p, 'powder-detective');
      save();
    }
    renderTop();
    renderBench();
    renderPanel();
  }

  render();
  const timer = setInterval(() => {
    if (
      screen().blocks.some((b) => b.type === 'spot') &&
      Date.now() - spotStarted > 30_000 &&
      !bench.querySelector('.app-pulse')
    )
      renderBench();
  }, 5000);
  void goHome;
  return () => {
    clearInterval(timer);
    document.documentElement.classList.remove('app-goggles');
  };
}

/** **жирный** в текстах контента → <b>; остальное — текст (без HTML). */
export function rich(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  text.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
    if (part.startsWith('**') && part.endsWith('**')) frag.append(h('b', {}, part.slice(2, -2)));
    else if (part) frag.append(document.createTextNode(part));
  });
  return frag;
}
