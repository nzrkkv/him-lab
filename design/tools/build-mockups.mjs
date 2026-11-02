// Собирает статичные макеты в design/mockups/*.html из компонентов и ассетов.
// Запуск: node design/tools/build-mockups.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { page, svg, icon, substance, shelfRow, labTopbar, rail, act, dock, logo } from './mockup-kit.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'mockups');
mkdirSync(OUT, { recursive: true });
const out = (name, html) => writeFileSync(join(OUT, name), html);

const ph = ['#E3262A', '#EC4A2C', '#F2752B', '#F7A22C', '#F6CB2F', '#D2D832', '#8CC63F', '#3DAA5C', '#1E9C8C', '#2A80C2', '#3B57A6', '#4A3D93', '#5D2B85', '#4A1F6B'];

// ======================================================================
// 1. ПЕСОЧНИЦА
// ======================================================================
{
  const shelf = `<aside class="hl-shelf" aria-label="Полка веществ">
  <div class="hl-shelf__head">
    <div class="hl-shelf__title"><h2>Вещества</h2><span class="hl-shelf__count">Открыто 12 из 28</span></div>
  </div>
  <div class="hl-shelf__body">
    <h3 class="hl-shelf__group">Жидкости</h3>
    ${shelfRow([substance('water'), substance('vinegar')])}
    ${shelfRow([substance('iodine'), substance('cabbage')])}
    <h3 class="hl-shelf__group">Порошки</h3>
    ${shelfRow([substance('salt'), substance('soda', { selected: true })])}
    ${shelfRow([substance('sugar'), substance('starch')])}
    ${shelfRow([substance('chalk'), substance('copper', { isNew: true, nameOverride: 'Купорос' })])}
    <h3 class="hl-shelf__group">${icon('lock')}Скоро откроются</h3>
    ${shelfRow([substance('permanganate', { locked: true, lockNote: 'Урок 4' }), substance('peroxide', { locked: true, lockNote: 'Урок 6', nameOverride: 'Перекись' })])}
  </div>
</aside>`;

  const stage = `<main class="hl-stage" aria-label="Рабочий стол">
  <div class="hl-stage__main">
  ${rail(['beaker', 'tube', 'flask', 'cylinder', 'dish', 'funnel', 'holder', 'burner', 'ice', 'scales', 'magnet'])}
  <div class="hl-scene">
    <div class="hl-scene__toast hl-toast fx-pop-in" role="status" style="--toast-accent:#EBDAFA">
      <span class="hl-toast__icon">${icon('star')}</span>
      <span>Открытие! Отвар капусты краснеет от кислоты</span>
      <button class="hl-btn">Почему?</button>
    </div>
    <div class="hl-bench"></div>
    <div class="hl-guide">${svg('character/guide-happy.svg', { label: 'Пипа радуется' })}</div>
    <div class="hl-bench__items">
      <button class="hl-ware" style="--w:120" aria-label="Стакан 1: вода, 3 ложки соды. Пузырьки газа">
        <span class="hl-ware__halo"></span>
        ${svg('equipment/beaker.svg', { cls: 'fx-fizz', style: '--level:.62;--liquid-color:#DCEFFB;--bubbles:1;--foam:.9', label: '' })}
        <span class="hl-ware__tag">Стакан 1 <span class="hl-ware__chip">${icon('temperature')}18 °C</span></span>
      </button>
      <button class="hl-ware is-selected" style="--w:120" aria-pressed="true" aria-label="Стакан 2, выбран: отвар краснокочанной капусты и уксус">
        <span class="hl-ware__halo"></span>
        ${svg('equipment/beaker.svg', { style: '--level:.5;--liquid-color:#D8344F', label: '' })}
        <span class="hl-ware__tag">Стакан 2</span>
        <span class="hl-readout" role="status" style="--readout-bg:#FFF0D9;--readout-fg:#A34A05">
          <span class="hl-readout__icon">${icon('ph')}</span>
          <span><span class="hl-readout__row"><span class="hl-readout__value hl-num">pH 3</span><span class="hl-readout__note">кислая среда</span></span><span class="hl-ph-meter" aria-hidden="true"><span class="hl-ph-scale">${ph.map((c) => `<i style="background:${c}"></i>`).join('')}</span><span class="hl-ph-mark" style="--ph:3"></span></span></span>
        </span>
      </button>
      <div class="hl-station" style="--w:156">
        ${svg('equipment/burner.svg', { style: '--heat:1', label: 'Горелка, горит' })}
        <div class="hl-station__on" style="bottom:calc(149px * var(--u));--w:96">
          <span class="hl-steam" aria-hidden="true">${svg('fx/steam.svg', { label: '' })}</span>
          ${svg('equipment/beaker.svg', { cls: 'fx-fizz fx-fizz--strong', style: '--level:.55;--liquid-color:#CDE9FB;--bubbles:1', label: 'Стакан 3 на горелке, вода кипит' })}
        </div>
        <span class="hl-station__label">${icon('heat')}Стакан 3 · кипит</span>
      </div>
      <div class="hl-slot" aria-label="Свободное место">Свободное место</div>
    </div>
  </div>
  </div>
  ${dock({
    vessel: 'Стакан 2',
    contents: 'отвар капусты 50 мл, уксус 2 ложки',
    cols: 6,
    rows: [
      { label: 'Сделать', acts: [act('stir', { key: 'M' }), act('heat', { key: 'H' }), act('cool', { key: 'C' }), act('wait', { key: 'W' }), act('filter', { key: 'F' }), act('evaporate', { key: 'E' })] },
      { label: 'Наблюдать', acts: [act('smell', { key: 'S' }), act('magnify', { key: 'L' }), act('temperature', { key: 'T' }), act('ph', { key: 'P' })] },
    ],
  })}
</main>`;

  const journal = `<aside class="hl-journal hl-journal-panel" id="journal" aria-label="Журнал наблюдений">
  <div class="hl-journal__head">${icon('journal')}<h2>Журнал</h2><span class="hl-journal__count">5 записей</span></div>
  <div class="hl-journal__body">
    <section class="hl-jsec">
      <div class="hl-jsec__head"><span class="hl-jsec__step">?</span><span class="hl-jsec__title">Гипотеза</span></div>
      <p class="hl-sentence">Если капнуть уксус в отвар капусты, цвет <span class="hl-pick">станет красным</span></p>
    </section>
    <section class="hl-jsec">
      <div class="hl-jsec__head"><span class="hl-jsec__step">${icon('eye', 'hl-icon--sm')}</span><span class="hl-jsec__title">Что было</span></div>
      <div class="hl-logline"><span class="hl-logline__icon">${icon('result-color')}</span><span class="hl-logline__text">Стакан 2: капуста + уксус — <b>стал малиновым</b><small>pH 3, кислая среда</small></span></div>
      <div class="hl-logline"><span class="hl-logline__icon">${icon('result-gas')}</span><span class="hl-logline__text">Стакан 1: сода + уксус — <b>пузырьки газа</b><small>и стало холоднее: 22 °C</small></span></div>
      <div class="hl-logline"><span class="hl-logline__icon">${icon('result-melt')}</span><span class="hl-logline__text">Пробирка 1: сахар + нагрев — <b>плавится, буреет</b><small>пахнет карамелью</small></span></div>
      <div class="hl-logline"><span class="hl-logline__icon hl-logline__icon--neutral">${icon('result-nothing')}</span><span class="hl-logline__text">Соль + уксус — <b>ничего не произошло</b><small>это тоже результат</small></span></div>
    </section>
    <section class="hl-jsec">
      <div class="hl-jsec__head"><span class="hl-jsec__step">!</span><span class="hl-jsec__title">Вывод</span></div>
      <p class="hl-sentence">Отвар капусты <span class="hl-pick">краснеет</span> от <span class="hl-pick">кислоты</span></p>
    </section>
    <section class="hl-jsec hl-jsec--empty">
      <div class="hl-jsec__head"><span class="hl-logline__icon hl-logline__icon--discovery">${icon('star')}</span><span class="hl-jsec__title">Открытия: 7 из 40</span></div>
      <p class="hl-jsec__hint">Новые сочетания попадают сюда сами. Попробуй капусту с содой.</p>
    </section>
  </div>
</aside>`;

  out('lab-sandbox.html', page({
    title: 'Песочница — Хим лаба',
    body: `<div class="hl-lab">
${labTopbar({ mode: 'sandbox', title: 'Свободные опыты' })}
${shelf}
${stage}
${journal}
</div>`,
  }));
}

// ======================================================================
// 2–4. МИССИЯ «ЗАГАДКА БЕЛЫХ ПОРОШКОВ»: обычное состояние, результат, стоп
// ======================================================================
const LETTERS = ['А', 'Б', 'В', 'Г', 'Д'];
function missionShelf({ selected = 'В' } = {}) {
  const labeled = { 'Б': 'мел' };
  const jar = (L) => substance('salt', { letter: L, selected: L === selected, nameOverride: `Банка ${L}`, metaOverride: labeled[L] ? `<span class="hl-substance__meta hl-substance__meta--label">${icon('pencil')}${labeled[L]}</span>` : `<span class="hl-substance__meta">без надписи</span>` })
    .replace(/aria-label="[^"]*"/, `aria-label="Банка ${L}, ${labeled[L] ? 'надпись: ' + labeled[L] : 'надписи нет'}"`);
  return `<aside class="hl-shelf" aria-label="Банки и реагенты">
  <div class="hl-shelf__head"><div class="hl-shelf__title"><h2>Загадка</h2><span class="hl-shelf__count">5 банок без надписей</span></div></div>
  <div class="hl-shelf__body">
    <h3 class="hl-shelf__group">Порошки</h3>
    ${shelfRow([jar('А'), jar('Б')])}
    ${shelfRow([jar('В'), jar('Г')])}
    ${shelfRow([jar('Д'), substance('water')])}
    <h3 class="hl-shelf__group">Реагенты</h3>
    ${shelfRow([substance('vinegar'), substance('iodine')])}
  </div>
</aside>`;
}

function missionGoal() {
  return `<div class="hl-goal" role="region" aria-label="Цель миссии">
  <span class="hl-goal__icon">${icon('target')}</span>
  <div class="hl-goal__text"><div class="hl-goal__title">Подпиши все 5 банок</div><div class="hl-goal__label">Каждую надпись докажи опытом</div></div>
  <div class="hl-goal__progress"><span class="hl-goal__slots" role="img" aria-label="Подписана 1 банка из 5: Б">${LETTERS.map((L, i) => `<i class="${i === 1 ? 'done' : ''}">${L}</i>`).join('')}</span></div>
  <button class="hl-btn hl-btn--secondary hl-btn--sm">${icon('hint')}Пипа, помоги</button>
  <button class="hl-btn hl-btn--secondary hl-btn--sm" aria-disabled="true">${icon('check')}Проверить</button>
</div>`;
}

function rack({ tubes, selected }) {
  return `<div class="hl-rack">
  ${svg('equipment/test-tube-rack.svg', { cls: 'hl-rack__back', label: '' })}
  ${tubes.map((t, i) => `<button class="hl-ware${selected === i ? ' is-selected' : ''}${t.dim ? ' is-dim' : ''}" ${selected === i ? 'aria-pressed="true"' : 'aria-pressed="false"'} aria-label="${t.label}"><span class="hl-ware__halo"></span>${svg('equipment/test-tube.svg', { cls: t.cls || '', style: t.style, label: '' })}</button>`).join('')}
  ${svg('equipment/test-tube-rack.svg', { cls: 'hl-rack__front', label: '' })}
  ${tubes.map((t, i) => t.letter ? `<span class="hl-rack__letter${selected === i ? ' is-selected' : ''}" style="left:calc(${40 + i * 60}px * var(--u))" aria-hidden="true">${t.letter}</span>` : '').join('')}
</div>`;
}

const missionTubes = [
  { letter: 'А', label: 'Пробирка А: порошок А и вода, вода прозрачная', style: '--level:.42;--liquid-color:#DCEFFB' },
  { letter: 'Б', label: 'Пробирка Б: порошок Б и вода, вода мутная', style: '--level:.42;--liquid-color:#D9DCD6;--turbidity:.8;--turbidity-color:#F4F3EC;--sediment:.7;--sediment-color:#F3F1EA' },
  { letter: 'В', label: 'Пробирка В: порошок В и вода, вода мутная', style: '--level:.42;--liquid-color:#D9DCD6;--turbidity:.85;--turbidity-color:#F4F3EC' },
  { letter: 'Г', label: 'Пробирка Г: порошок Г и вода, вода прозрачная', style: '--level:.42;--liquid-color:#DCEFFB' },
  { letter: 'Д', label: 'Пробирка Д: порошок Д и вода, вода прозрачная', style: '--level:.42;--liquid-color:#DCEFFB' },
];

function missionJournal({ highlight } = {}) {
  const tests = [['magnify', 'Лупа'], ['pour', 'Вода'], ['smell', 'Уксус'], ['result-color', 'Йод'], ['heat', 'Нагрев']];
  // ключ: буква + номер проверки (0 лупа, 1 вода, 2 уксус, 3 йод, 4 нагрев)
  const cell = {
    'А1': ['dissolve', 'result-dissolve', 'растворилось'], 'Б1': ['turbid', 'result-turbid', 'мутно'], 'В1': ['turbid', 'result-turbid', 'мутно'], 'Г1': ['dissolve', 'result-dissolve', 'растворилось'], 'Д1': ['dissolve', 'result-dissolve', 'растворилось'],
    'Б2': ['gas', 'result-gas', 'шипит'], 'А2': ['nothing', 'result-nothing', 'ничего'],
    ...(highlight ? { 'В3': ['color', 'result-color', 'посинело'] } : {}),
  };
  const rowIcons = ['magnify', 'pour', 'add', 'result-color', 'heat'];
  const rows = tests.map(([, t], c) => `<tr><th scope="row">${t}</th>${LETTERS.map((L) => {
    const k = L + c; const v = cell[k];
    if (!v) return `<td><span class="hl-sr">не проверено</span></td>`;
    return `<td class="r r--${v[0]}${highlight === k ? ' is-new' : ''}">${icon(v[1])}<span class="hl-sr">${v[2]}</span></td>`;
  }).join('')}</tr>`).join('');
  return `<aside class="hl-journal hl-journal-panel" id="journal" aria-label="Журнал наблюдений">
  <div class="hl-journal__head">${icon('journal')}<h2>Детективная доска</h2></div>
  <div class="hl-journal__body">
    <section class="hl-jsec">
      <table class="hl-grid">
        <caption class="hl-sr">Что показала каждая проверка для банок А–Д</caption>
        <thead><tr><th><span class="hl-sr">Проверка</span></th>${LETTERS.map((L) => `<th scope="col">${L}</th>`).join('')}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="hl-legend">
        <span>${icon('result-dissolve')}растворилось</span><span>${icon('result-turbid')}мутно</span><span>${icon('result-gas')}шипит</span><span>${icon('result-color')}посинело</span><span>${icon('result-nothing')}ничего</span>
      </div>
    </section>
    <section class="hl-jsec">
      <div class="hl-jsec__head"><span class="hl-jsec__step">?</span><span class="hl-jsec__title">Гипотеза</span></div>
      <p class="hl-sentence">Банка В <span class="hl-pick">посинеет</span> от йода</p>
    </section>
    <section class="hl-jsec ${highlight ? '' : 'hl-jsec--empty'}">
      <div class="hl-jsec__head"><span class="hl-jsec__step">!</span><span class="hl-jsec__title">Вывод</span></div>
      ${highlight
        ? `<p class="hl-sentence">Банка В — <span class="hl-pick">крахмал</span>, потому что <span class="hl-pick">посинела от йода</span></p>`
        : `<p class="hl-jsec__hint">Сделай опыт — и выбери, что получилось.</p>`}
    </section>
  </div>
</aside>`;
}

function missionStage({ bubble = '', overlay = '', guidePose = 'explain', tubes = missionTubes, selected = 2, dockContents = 'порошок В, вода 2 порции' }) {
  return `<main class="hl-stage" aria-label="Рабочий стол">
  <div class="hl-stage__main">
  <div class="hl-stage__head">${missionGoal()}</div>
  <div class="hl-scene">
    <div class="hl-bench"></div>
    <div class="hl-guide">${svg(`character/guide-${guidePose}.svg`, { label: 'Пипа' })}</div>
    ${bubble}
    <div class="hl-bench__items">
      ${rack({ tubes, selected })}
      <div class="hl-station" style="--w:132">${svg('equipment/burner.svg', { style: '--flame:0', label: 'Горелка, не горит' })}<span class="hl-station__label">Горелка</span></div>
    </div>
    ${overlay}
  </div>
  </div>
  ${dock({
    vessel: 'Пробирка В',
    contents: dockContents,
    cols: 7,
    clearLabel: 'Помыть',
    rows: [{ label: 'Действия', acts: [act('stir', { key: 'M' }), act('heat', { key: 'H' }), act('wait', { key: 'W' }), act('smell', { key: 'S' }), act('magnify', { key: 'L' })] }],
  })}
</main>`;
}

const missionHintBubble = `<div class="hl-guide-bubble hl-speech hl-speech--tail-left fx-pop-in" style="--tail-y:84px" role="status" aria-live="polite">
  <div class="hl-speech__head"><span class="hl-speech__who">Пипа</span><span class="hl-speech__level">Подсказка 1 из 3 <span class="hl-speech__dots" aria-hidden="true"><i class="on"></i><i></i><i></i></span></span></div>
  <p class="hl-speech__text">Две банки не растворились: Б и В. Среди них есть крахмал. Каким детектором его найти?</p>
  <div class="hl-speech__actions"><button class="hl-btn hl-btn--sm hl-btn--secondary">Ещё подсказку</button><button class="hl-btn hl-btn--sm hl-btn--ghost">Пока не надо</button></div>
</div>`;

out('lab-mission.html', page({
  title: 'Миссия «Загадка белых порошков» — Хим лаба',
  css: `.hl-guide-bubble{left:calc(16px + 128px * var(--u) + 8px); bottom:auto; top:16px; width:380px}`,
  body: `<div class="hl-lab">
${labTopbar({ mode: 'mission', title: 'Загадка белых порошков' })}
${missionShelf({ selected: '' })}
${missionStage({ bubble: missionHintBubble, guidePose: 'thinking' })}
${missionJournal()}
</div>`,
}));

// ---------- 3. результат с объяснением ----------
const resultTubes = missionTubes.map((t, i) => i === 2 ? { ...t, style: '--level:.46;--liquid-color:#1F2570;--turbidity:.15', label: 'Пробирка В: тёмно-синяя после йода' } : t);
const resultCard = `<section class="hl-result fx-pop-in" role="dialog" aria-labelledby="res-title" aria-modal="false">
  <div class="hl-result__head"><span class="hl-result__kicker">Пробирка В + раствор йода</span><button class="hl-btn hl-btn--ghost hl-btn--icon hl-btn--sm" aria-label="Закрыть">${icon('close')}</button></div>
  <h2 class="hl-result__title" id="res-title">Йод нашёл крахмал!</h2>
  <div class="hl-result__obs">
    <div class="hl-observation hl-observation--change"><span class="hl-observation__icon">${icon('result-color')}</span><div><div class="hl-observation__title">Цвет: из бурого в тёмно-синий <span class="hl-swatch" style="--swatch:#B5651D"></span> → <span class="hl-swatch" style="--swatch:#1F2570"></span></div><div class="hl-observation__sub">Сразу, почти чёрный</div></div></div>
  </div>
  <p class="hl-result__text">Только крахмал так синеет от йода. Это его главная примета. Значит, в банке В — крахмал.</p>
  <div class="hl-deeper">
    <button class="hl-deeper__toggle" aria-expanded="true">${icon('deeper')}Копнуть глубже${icon('forward', 'hl-deeper__chev')}</button>
    <div class="hl-deeper__body"><p>Крахмал — это очень длинные цепочки. Йод прячется внутри их витков, и от этого цвет становится синим.</p><span class="hl-deeper__sci">По-научному: <b>крахмал — полисахарид</b></span></div>
  </div>
  <div class="hl-result__actions"><button class="hl-btn hl-btn--primary">${icon('pencil')}Записать в журнал</button><button class="hl-btn hl-btn--secondary">${icon('replay')}Ещё раз</button></div>
</section>`;
out('lab-result.html', page({
  title: 'Результат опыта — Хим лаба',
  body: `<div class="hl-lab">
${labTopbar({ mode: 'mission', title: 'Загадка белых порошков', deeper: true })}
${missionShelf({ selected: '' })}
${missionStage({ overlay: resultCard, guidePose: 'happy', tubes: resultTubes, dockContents: 'порошок В, вода 2 порции, йод 1 капля' })}
${missionJournal({ highlight: 'В3' })}
</div>`,
}));

// ---------- 4. стоп при опасном сочетании ----------
const stopDialog = `<div class="hl-scrim">
  <section class="hl-dialog hl-dialog--caution" role="alertdialog" aria-modal="true" aria-labelledby="stop-title" aria-describedby="stop-text">
    <div class="hl-dialog__band">
      <span class="hl-stop-art">${svg('character/guide-warn.svg', { label: '' })}</span>
      <div>
        <div class="hl-stop-kicker">${icon('shield')}Лаба остановила опыт</div>
        <h2 class="hl-dialog__title" id="stop-title">Йод так не нагреваем</h2>
      </div>
    </div>
    <div class="hl-dialog__body" id="stop-text">
      <p>Сухой йод при нагреве даёт пары. Они вредны для глаз и горла.</p>
      <p class="hl-stop-rule">${icon('caution')}<span>В настоящей лаборатории так не делают. И дома тоже.</span></p>
      <p class="hl-muted hl-sm">Нагреть можно, если в пробирке много воды, а йода — одна капля.</p>
    </div>
    <div class="hl-dialog__actions">
      <button class="hl-btn hl-btn--secondary">${icon('undo')}Убрать йод из пробирки</button>
      <button class="hl-btn hl-btn--primary" autofocus>Понятно</button>
    </div>
  </section>
</div>`;
out('lab-safety-stop.html', page({
  title: 'Опыт остановлен — Хим лаба',
  css: `.hl-stop-art{width:96px;flex:none;margin:-6px 0 -10px}
.hl-stop-kicker{display:flex;align-items:center;gap:6px;font-size:15px;font-weight:700;color:var(--color-feedback-caution-700);margin-bottom:2px}
.hl-stop-kicker .hl-icon{width:20px;height:20px}
.hl-dialog__body p + p{margin-top:10px}
.hl-stop-rule{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border-radius:var(--radius-md);background:var(--color-feedback-caution-100);font-weight:600}
.hl-stop-rule .hl-icon{color:var(--color-feedback-caution-700);flex:none;margin-top:1px}`,
  body: `<div class="hl-lab" aria-hidden="true">
${labTopbar({ mode: 'mission', title: 'Загадка белых порошков' })}
${missionShelf({ selected: '' })}
${missionStage({ guidePose: 'warn', tubes: missionTubes.map((t, i) => i === 2 ? { ...t, style: '--level:0;--powder:1;--powder-color:#B5651D', label: 'Пробирка В: сухой порошок с йодом' } : t), dockContents: 'порошок В, йод 3 капли, без воды' })}
${missionJournal()}
</div>
${stopDialog}`,
}));

// ======================================================================
// 5. УРОК: «сначала опыт, потом объяснение» (экран П1 «Разминка: две пробирки»)
// ======================================================================
{
  const steps = [
    ['Крючок', 'done'], ['Попробуй сам', 'current'], ['Разбираемся', ''], ['Миссия', ''], ['Тест', ''], ['Дома', ''], ['Награда', ''],
  ];
  out('lesson.html', page({
    title: 'Урок 1. Разминка — Хим лаба',
    css: `
.ls { min-height: 100vh; display: grid; grid-template-rows: auto 1fr; background: var(--color-tile-100); }
.ls-top { display: flex; align-items: center; gap: 16px; padding: 0 24px; height: 72px; background: var(--color-paper); border-bottom: 2px solid var(--color-ink-900); }
.ls-top__title { min-width: 0; }
.ls-top__title small { display: block; font-size: 14px; font-weight: 600; color: var(--color-ink-500); }
.ls-top__title b { font: 600 19px/1.2 var(--font-family-display); white-space: nowrap; }
.ls-steps { flex: 1; display: flex; gap: 6px; max-width: 640px; margin-left: auto; }
.ls-step { flex: 1; display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 700; color: var(--color-ink-500); min-width: 0; }
.ls-step span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ls-step i { height: 10px; border-radius: 99px; background: var(--color-ink-100); border: 2px solid var(--color-ink-200); }
.ls-step.done i { background: var(--color-copper-600); border-color: var(--color-copper-800); }
.ls-step.current { color: var(--color-ink-900); }
.ls-step.current i { background: linear-gradient(90deg, var(--color-lamp-400) 60%, var(--color-ink-100) 0); border-color: var(--color-ink-900); }
.ls-main { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(360px, 0.85fr); gap: 24px; padding: 24px; max-width: 1360px; width: 100%; margin: 0 auto; min-height: 0; }
.ls-bench { position: relative; border: 2px solid var(--color-ink-900); border-radius: var(--radius-xl); overflow: hidden; background-color: var(--color-tile-50);
  background-image: linear-gradient(var(--color-tile-200) 2px, transparent 2px), linear-gradient(90deg, var(--color-tile-200) 2px, transparent 2px); background-size: 56px 56px; min-height: 560px; display: flex; flex-direction: column; }
.ls-bench__head { padding: 18px 22px 0; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.ls-bench__head h2 { font: 700 30px/1.15 var(--font-family-display); letter-spacing: -0.015em; }
.ls-bench__head p { margin-top: 6px; font-size: 18px; color: var(--color-ink-700); }
.ls-goggles { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px 6px 8px; border-radius: 99px; background: var(--color-feedback-success-100); color: var(--color-feedback-success-600); font-weight: 700; font-size: 15px; white-space: nowrap; }
.ls-goggles .hl-icon { width: 22px; height: 22px; }
.ls-scene { position: relative; flex: 1; }
.ls-table { position: absolute; left: 0; right: 0; bottom: 0; height: 84px; background: var(--color-bench-top); border-top: 2px solid var(--color-ink-900); }
.ls-items { position: absolute; left: 0; right: 0; bottom: 60px; display: flex; align-items: flex-end; justify-content: center; gap: 72px; }
.ls-rack { position: relative; width: 300px; height: 300px; }
.ls-rack > svg.back, .ls-rack > svg.front { position: absolute; left: 0; bottom: 0; width: 300px; height: auto; }
.ls-rack > svg.back [data-layer='front'], .ls-rack > svg.front [data-layer='back'] { display: none; }
.ls-rack > svg.front { z-index: 3; }
.ls-tube { position: absolute; bottom: 12px; width: 72px; z-index: 2; }
.ls-tube svg { width: 100%; height: auto; overflow: visible; }
.ls-tube--1 { left: 42px; } .ls-tube--2 { left: 186px; }
.ls-num { position: absolute; z-index: 4; bottom: 50px; width: 36px; height: 36px; margin-left: -18px; border-radius: 50%; display: grid; place-items: center; background: var(--color-paper); border: 2px solid var(--color-ink-900); font: 700 17px/1 var(--font-family-display); }
.ls-tag { position: absolute; z-index: 5; bottom: -48px; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px 5px 8px; border-radius: 12px; background: var(--color-paper); border: 2px solid var(--color-ink-900); font-weight: 700; font-size: 16px; white-space: nowrap; }
.ls-tag .hl-icon { width: 22px; height: 22px; }
.ls-tag--gas { color: var(--color-copper-700); }
.ls-tag--nothing { color: var(--color-feedback-neutral-600); }
.ls-tag span { color: var(--color-ink-900); }
.ls-tools { display: flex; align-items: flex-end; gap: 22px; }
.ls-tools figure { display: flex; flex-direction: column; align-items: center; gap: 8px; font-size: 15px; font-weight: 700; }
.ls-panel { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.ls-guide { display: grid; grid-template-columns: 112px 1fr; gap: 6px; align-items: start; }
.ls-guide > svg { width: 112px; height: auto; margin-top: 10px; }
.ls-guide .hl-speech { max-width: none; box-shadow: none; }
.ls-guide .hl-speech__text { font-size: 20px; line-height: 29px; }
.ls-guide .hl-speech__text + .hl-speech__text { margin-top: 6px; }
.ls-card { background: var(--color-paper); border: 2px solid var(--color-ink-200); border-radius: var(--radius-lg); padding: 14px 16px; }
.ls-card h3 { font-size: 16px; font-weight: 700; color: var(--color-ink-700); margin-bottom: 10px; }
.ls-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.ls-chip { min-height: 44px; padding: 0 14px; border-radius: 12px; border: 2px solid var(--color-ink-200); background: var(--color-paper); font-size: 16px; font-weight: 700; color: var(--color-ink-700); display: inline-flex; align-items: center; gap: 6px; }
.ls-chip[aria-pressed='true'] { border-color: var(--color-ink-900); background: var(--color-lamp-100); color: var(--color-ink-900); box-shadow: 0 0 0 3px var(--color-lamp-400); }
.ls-chip .hl-icon { width: 20px; height: 20px; }
.ls-verdict { display: flex; align-items: center; gap: 10px; margin-top: 12px; padding: 10px 12px; border-radius: 12px; background: var(--color-feedback-success-100); color: var(--color-feedback-success-600); font-weight: 700; font-size: 16px; }
.ls-verdict .hl-icon { flex: none; }
.ls-verdict span { color: var(--color-ink-900); }
.ls-sci { display: flex; flex-wrap: wrap; gap: 8px; }
.ls-sci span { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 10px; background: var(--color-deep-50); color: var(--color-deep-800); font-size: 15px; }
.ls-sci b { font-weight: 700; }
.ls-next { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: auto; padding-top: 4px; }
.ls-next p { font-size: 16px; color: var(--color-ink-700); }
@media (max-width: 1279px) {
  .ls-main { grid-template-columns: minmax(0, 1fr) minmax(340px, 400px); gap: 16px; padding: 16px; }
  .ls-step span { display: none; }
  .ls-step.current span { display: block; }
  .ls-bench { min-height: 0; }
  .ls-bench__head h2 { font-size: 24px; }
  .ls-items { gap: 28px; bottom: 66px; }
  .ls-rack, .ls-rack > svg.back, .ls-rack > svg.front { width: 250px; }
  .ls-rack { height: 250px; }
  .ls-tube { width: 60px; } .ls-tube--1 { left: 35px; } .ls-tube--2 { left: 155px; }
  .ls-guide { grid-template-columns: 84px 1fr; }
  .ls-guide > svg { width: 84px; }
  .ls-guide .hl-speech__text { font-size: 18px; line-height: 26px; }
  .ls-tools { display: none; }
  .ls-next p { display: none; }
  .ls-panel { gap: 12px; }
}`,
    body: `<div class="ls">
<header class="ls-top">
  <a class="hl-btn hl-btn--ghost hl-btn--icon" href="home.html" aria-label="К карте модуля">${icon('close')}</a>
  <div class="ls-top__title"><small>Урок 1 · Вещества вокруг нас</small><b>Добро пожаловать в лабораторию</b></div>
  <ol class="ls-steps" aria-label="Шаги урока">
    ${steps.map(([t, st]) => `<li class="ls-step ${st}"${st === 'current' ? ' aria-current="step"' : ''}><span>${t}</span><i></i></li>`).join('')}
  </ol>
</header>
<main class="ls-main">
  <section class="ls-bench" aria-label="Опыт">
    <div class="ls-bench__head">
      <div><h2>Разминка: две пробирки</h2><p>На вид порошки одинаковые. Капни уксус в каждую.</p></div>
      <span class="ls-goggles">${icon('goggles')}Очки надеты</span>
    </div>
    <div class="ls-scene">
      <div class="ls-table"></div>
      <div class="ls-items">
        <div class="ls-rack">
          ${svg('equipment/test-tube-rack.svg', { cls: 'back', label: '' })}
          <div class="ls-tube ls-tube--1">${svg('equipment/test-tube.svg', { style: '--level:.18;--liquid-color:#EEF6E8;--powder:1;--powder-color:#FFFFFF', label: 'Пробирка 1: порошок намок, пузырьков нет' })}</div>
          <div class="ls-tube ls-tube--2">${svg('equipment/test-tube.svg', { cls: 'fx-fizz fx-fizz--strong', style: '--level:.52;--liquid-color:#EEF6E8;--bubbles:1;--foam:1', label: 'Пробирка 2: бурное шипение и пена' })}</div>
          ${svg('equipment/test-tube-rack.svg', { cls: 'front', label: '' })}
          <span class="ls-num" style="left:78px">1</span><span class="ls-num" style="left:222px">2</span>
          <span class="ls-tag ls-tag--nothing" style="left:78px">${icon('result-nothing')}<span>Ничего</span></span>
          <span class="ls-tag ls-tag--gas" style="left:222px">${icon('result-gas')}<span>Шипит!</span></span>
        </div>
        <div class="ls-tools">
          <figure>${svg('containers/bottle.svg', { style: '--liquid-color:#EEF6E8;--cap-color:#E0A100;--level:.55;width:66px', label: 'Флакон с уксусом' })}<figcaption>Уксус</figcaption></figure>
          <figure>${svg('equipment/pipette.svg', { style: '--level:.3;--liquid-color:#EEF6E8;width:34px', label: 'Пипетка' })}<figcaption>Пипетка</figcaption></figure>
        </div>
      </div>
    </div>
  </section>

  <section class="ls-panel" aria-label="Что получилось">
    <div class="ls-guide">
      ${svg('character/guide-happy.svg', { label: 'Пипа радуется' })}
      <div class="hl-speech hl-speech--tail-left fx-pop-in" style="--tail-y:40px">
        <div class="hl-speech__head"><span class="hl-speech__who">Пипа</span></div>
        <p class="hl-speech__text">Ого! На вид одинаковые. А ведут себя по-разному!</p>
        <p class="hl-speech__text">В первой пробирке — соль. Во второй — пищевая сода.</p>
      </div>
    </div>
    <div class="ls-card">
      <h3>Твоё предсказание: что будет от уксуса?</h3>
      <div class="ls-chips" role="radiogroup">
        <button class="ls-chip" role="radio" aria-pressed="false">Ничего</button>
        <button class="ls-chip" role="radio" aria-pressed="true">${icon('check')}Зашипит</button>
        <button class="ls-chip" role="radio" aria-pressed="false">Поменяет цвет</button>
        <button class="ls-chip" role="radio" aria-pressed="false">Не знаю</button>
      </div>
      <div class="ls-verdict">${icon('star')}<span>Есть! Предсказание сбылось — для второй пробирки.</span></div>
    </div>
    <div class="ls-sci" aria-label="Научные названия">
      <span>Соль, по-научному — <b>хлорид натрия</b></span>
      <span>Пищевая сода — <b>гидрокарбонат натрия</b></span>
    </div>
    <div class="hl-deeper">
      <button class="hl-deeper__toggle" aria-expanded="false">${icon('deeper')}Копнуть глубже: откуда пузырьки?${icon('forward', 'hl-deeper__chev')}</button>
    </div>
    <div class="ls-next">
      <p>Почему так вышло? Давай разбираться.</p>
      <button class="hl-btn hl-btn--primary hl-btn--lg">Разбираемся${icon('forward')}</button>
    </div>
  </section>
</main>
</div>`,
  }));
}

// ======================================================================
// 6. ГЛАВНАЯ / КАРТА МОДУЛЯ
// ======================================================================
{
  const lessons = [
    { n: 1, t: 'Добро пожаловать в лабораторию', st: 'current', color: '#8A6CF0', sub: 'Загадка белых порошков' },
    { n: 2, t: 'Мерим в лаборатории', st: 'locked', sub: 'Объём, масса, температура' },
    { n: 3, t: 'Тонет, плавает, притягивается', st: 'locked', sub: 'Ещё свойства веществ' },
    { n: 4, t: 'Правила настоящей лаборатории', st: 'locked', sub: 'Безопасность дома и в школе' },
  ];
  const node = (l, i) => {
    const filled = l.st === 'done' ? 0.75 : l.st === 'current' ? 0.4 : 0;
    return `<li class="mp-node mp-node--${l.st}" style="--x:${[6, 30, 54, 78][i]}%;--y:${[58, 22, 58, 22][i]}%">
  <a class="mp-flask" href="${l.st === 'locked' ? '#' : 'lesson.html'}" ${l.st === 'locked' ? 'aria-disabled="true"' : ''} aria-label="Урок ${l.n}: ${l.t}. ${l.st === 'current' ? 'Сейчас здесь' : l.st === 'done' ? 'Пройден' : 'Откроется после урока ' + (l.n - 1)}">
    ${svg('equipment/flask.svg', { style: `--level:${filled};--liquid-color:${l.color || '#CDE9FB'}`, label: '' })}
    <span class="mp-num">${l.st === 'locked' ? icon('lock') : l.n}</span>
  </a>
  <div class="mp-text"><b>${l.t}</b><span>${l.sub}</span>${l.st === 'current' ? `<span class="mp-here">Ты здесь</span>` : ''}</div>
</li>`;
  };
  const modules = ['Вещества вокруг нас', 'Состояния вещества', 'Смеси и их разделение', 'Растворы', 'Кислоты и щёлочи', 'Химические реакции', 'Из чего всё состоит', 'Химия в жизни'];
  out('home.html', page({
    title: 'Хим лаба — карта модуля',
    css: `
body { background: var(--color-tile-100); }
.hm-top { display: flex; align-items: center; gap: 24px; height: 72px; padding: 0 32px; background: var(--color-paper); border-bottom: 2px solid var(--color-ink-900); }
.hm-nav { display: flex; gap: 4px; margin-left: 24px; }
.hm-nav a { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px; border-radius: 12px; font-weight: 700; font-size: 16px; color: var(--color-ink-700); text-decoration: none; }
.hm-nav a .hl-icon { width: 22px; height: 22px; }
.hm-nav a[aria-current='page'] { background: var(--color-lamp-100); color: var(--color-ink-900); box-shadow: inset 0 0 0 2px var(--color-ink-900); }
.hm-top__right { margin-left: auto; display: flex; gap: 8px; align-items: center; }
.hm-parents { font-size: 15px; font-weight: 600; color: var(--color-ink-700); text-decoration: underline; text-underline-offset: 3px; padding: 12px 8px; }
.hm { max-width: 1280px; margin: 0 auto; padding: 28px 32px 40px; display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 24px; }
.hm-module { grid-column: 1; }
.hm-module__head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.hm-module__head small { display: block; font-size: 16px; font-weight: 700; color: var(--color-ink-500); margin-bottom: 4px; }
.hm-module__head h1 { font: 700 40px/1.1 var(--font-family-display); letter-spacing: -0.02em; }
.hm-module__head p { font-size: 18px; color: var(--color-ink-700); margin-top: 6px; }
.hm-progress { width: 220px; flex: none; }
.hm-progress span { display: block; font-size: 15px; font-weight: 700; margin-bottom: 6px; text-align: right; }
.mp { position: relative; height: 420px; border: 2px solid var(--color-ink-900); border-radius: var(--radius-xl); background: var(--color-wood-100); overflow: hidden; }
.mp::before { content: ''; position: absolute; inset: auto 0 0 0; height: 64px; background: var(--color-wood-200); border-top: 2px solid var(--color-ink-900); }
.mp-pipe { position: absolute; inset: 0; width: 100%; height: 100%; }
.mp-list { position: absolute; inset: 0; }
.mp-node { position: absolute; left: var(--x); top: var(--y); width: 200px; display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.mp-flask { position: relative; display: block; width: 104px; border-radius: 20px; padding: 6px; text-decoration: none; color: inherit; }
.mp-flask > svg { width: 100%; height: auto; }
.mp-num { position: absolute; left: 50%; top: 62%; transform: translate(-50%, -50%); width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--color-paper); border: 2px solid var(--color-ink-900); font: 700 18px/1 var(--font-family-display); }
.mp-num .hl-icon { width: 22px; height: 22px; color: var(--color-ink-500); }
.mp-node--current .mp-flask { background: rgba(255, 201, 60, 0.35); box-shadow: 0 0 0 3px var(--color-lamp-400); }
.mp-node--locked .mp-flask > svg { opacity: 0.6; }
.mp-text b { display: block; font-size: 18px; line-height: 1.25; }
.mp-text span { display: block; font-size: 15px; color: var(--color-ink-700); margin-top: 2px; }
.mp-node--locked .mp-text b { color: var(--color-ink-700); }
.mp-text .mp-here { display: inline-block; margin-top: 8px; padding: 3px 10px; border-radius: 99px; background: var(--color-ink-900); color: #fff; font-size: 13px; font-weight: 700; }
.mp-sand { position: absolute; right: 22px; bottom: 76px; display: flex; align-items: center; gap: 12px; padding: 10px 16px 10px 10px; border-radius: 16px; background: var(--color-paper); border: 2px solid var(--color-ink-900); box-shadow: 0 3px 0 0 rgba(22,33,63,.2); font-weight: 700; text-decoration: none; color: inherit; }
.mp-sand .hl-icon { width: 36px; height: 36px; padding: 6px; border-radius: 10px; background: var(--color-lamp-100); color: var(--color-lamp-800); }
.mp-sand small { display: block; font-size: 14px; font-weight: 600; color: var(--color-ink-500); }
.hm-side { display: flex; flex-direction: column; gap: 16px; }
.hm-cont { position: relative; padding: 20px; border: 2px solid var(--color-ink-900); border-radius: var(--radius-xl); background: var(--color-paper); }
.hm-cont__art { position: absolute; right: 12px; top: -26px; width: 104px; }
.hm-cont small { font-size: 15px; font-weight: 700; color: var(--color-ink-500); }
.hm-cont h2 { font: 700 22px/1.25 var(--font-family-display); margin: 6px 0 4px; max-width: 200px; }
.hm-cont p { font-size: 16px; color: var(--color-ink-700); }
.hm-cont .hl-progress-bar { margin: 14px 0 16px; }
.hm-badges { padding: 16px; border: 2px solid var(--color-ink-200); border-radius: var(--radius-xl); background: var(--color-paper); }
.hm-badges h2, .hm-modules h2 { font: 600 18px/1.2 var(--font-family-display); margin-bottom: 12px; }
.hm-badges ul { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.hm-badges .hl-badge { width: auto; }
.hm-badges .hl-badge__art { width: 64px; }
.hm-badges .hl-badge__name { font-size: 13px; }
.hm-modules { grid-column: 1 / -1; }
.hm-modules ol { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.hm-mod { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 10px 14px; border-radius: var(--radius-lg); border: 2px dashed var(--color-ink-300); color: var(--color-ink-700); font-weight: 600; font-size: 16px; }
.hm-mod i { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex: none; background: var(--color-ink-100); font: 700 15px/1 var(--font-family-display); font-style: normal; }
.hm-mod--open { border: 2px solid var(--color-ink-900); background: var(--color-paper); color: var(--color-ink-900); font-weight: 700; }
.hm-mod--open i { background: var(--color-guide-body); color: #fff; }
.hm-mod small { display: block; font-size: 13px; font-weight: 600; color: var(--color-ink-500); }
@media (max-width: 1279px) {
  .hm-top { padding: 0 20px; gap: 12px; }
  .hm-nav { margin-left: 8px; }
  .hm-nav a { padding: 0 10px; }
  .hm-parents { display: none; }
  .hm { grid-template-columns: minmax(0, 1fr) 280px; padding: 20px; gap: 16px; }
  .hm-module__head h1 { font-size: 30px; }
  .hm-module__head p { display: none; }
  .hm-progress { width: 160px; }
  .mp { height: 380px; }
  .mp-node { width: 150px; }
  .mp-flask { width: 84px; }
  .mp-text b { font-size: 16px; }
  .mp-text span { display: none; }
  .mp-text .mp-here { display: inline-block; }
  .mp-sand small { display: none; }
  .hm-cont h2 { font-size: 19px; max-width: 160px; }
  .hm-cont__art { width: 84px; }
  .hm-modules ol { grid-template-columns: repeat(2, 1fr); }
}`,
    body: `<header class="hm-top">
  ${logo()}
  <nav class="hm-nav" aria-label="Разделы">
    <a href="home.html" aria-current="page">${icon('map')}Уроки</a>
    <a href="lab-sandbox.html">${icon('sandbox')}Песочница</a>
    <a href="#">${icon('star')}Награды</a>
  </nav>
  <div class="hm-top__right"><a class="hm-parents" href="#">Для родителей</a><button class="hl-btn hl-btn--ghost hl-btn--icon" aria-label="Звук включён">${icon('sound-on')}</button></div>
</header>
<main class="hm">
  <section class="hm-module" aria-labelledby="mod-title">
    <div class="hm-module__head">
      <div><small>Модуль 1</small><h1 id="mod-title">Вещества вокруг нас</h1><p>Из чего всё сделано и как вещества узнать по приметам.</p></div>
      <div class="hm-progress"><span>Пройдено 0 из 4</span><div class="hl-progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="4" style="--value:4%"><i></i></div></div>
    </div>
    <div class="mp">
      <svg class="mp-pipe" viewBox="0 0 1000 420" preserveAspectRatio="none" aria-hidden="true">
        <path d="M110 300 C 200 300, 220 150, 350 150 S 520 300, 590 300 S 760 150, 830 150" fill="none" stroke="#16213F" stroke-width="16" stroke-linecap="round"/>
        <path d="M110 300 C 200 300, 220 150, 350 150 S 520 300, 590 300 S 760 150, 830 150" fill="none" stroke="#EAF6FF" stroke-width="10" stroke-linecap="round"/>
        <path d="M110 300 C 160 300, 190 270, 215 230" fill="none" stroke="#8A6CF0" stroke-width="10" stroke-linecap="round"/>
      </svg>
      <ol class="mp-list">${lessons.map(node).join('')}</ol>
      <a class="mp-sand" href="lab-sandbox.html">${icon('sandbox')}<span>Песочница<small>12 веществ открыто</small></span></a>
    </div>
  </section>
  <aside class="hm-side">
    <div class="hm-cont">
      ${svg('character/guide-explain.svg', { cls: 'hm-cont__art', label: '' })}
      <small>Продолжить</small>
      <h2>Урок 1. Добро пожаловать в лабораторию</h2>
      <p>Шаг 2 из 7: разминка</p>
      <div class="hl-progress-bar" role="progressbar" aria-valuenow="2" aria-valuemin="0" aria-valuemax="7" style="--value:28%"><i></i></div>
      <a class="hl-btn hl-btn--primary hl-btn--lg hl-btn--block" href="lesson.html">Продолжить${icon('forward')}</a>
    </div>
    <div class="hm-badges">
      <h2>Значки</h2>
      <ul>
        <li class="hl-badge">${svg('badges/first-experiment.svg', { cls: 'hl-badge__art', label: '' })}<span class="hl-badge__name">Первый опыт</span></li>
        <li class="hl-badge is-locked">${svg('badges/powder-detective.svg', { cls: 'hl-badge__art', label: '' })}<span class="hl-badge__name">Сыщик порошков</span></li>
        <li class="hl-badge is-locked">${svg('badges/safety-pro.svg', { cls: 'hl-badge__art', label: '' })}<span class="hl-badge__name">Знаток безопасности</span></li>
      </ul>
    </div>
  </aside>
  <section class="hm-modules" aria-labelledby="mods">
    <h2 id="mods">Все модули</h2>
    <ol>${modules.map((m, i) => `<li class="hm-mod${i === 0 ? ' hm-mod--open' : ''}"><i>${i + 1}</i><span>${m}${i === 0 ? '<small>4 урока</small>' : '<small>Скоро</small>'}</span></li>`).join('')}</ol>
  </section>
</main>`,
  }));
}

console.log('ok');
