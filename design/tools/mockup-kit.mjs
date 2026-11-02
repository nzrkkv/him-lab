// Помощники для сборки статичных макетов. Макеты — обычный HTML, этот файл лишь избавляет от копипасты.
import { inlineSvg, inlineIcon } from './build-mockups-lib.mjs';

export const svg = (src, { cls = '', style = '', label } = {}) =>
  inlineSvg(src, `class="${cls}" style="${style}"${label !== undefined ? ` label="${label}"` : ''}`);
export const icon = (name, cls = '') => inlineIcon(name, cls);

export function page({ title, body, css = '', bodyClass = '', extraHead = '' }) {
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="../tokens/tokens.css">
<link rel="stylesheet" href="../components/components.css">
<link rel="stylesheet" href="../components/lab.css">
<link rel="stylesheet" href="../components/effects.css">
${extraHead}
<style>${css}</style>
</head>
<body class="${bodyClass}">
${body}
</body>
</html>
`;
}

// ---------- вещества ----------
export const SUB = {
  salt: { name: 'Соль', kind: 'jar', color: '#FFFFFF', lid: '#1F5FCC', home: true },
  sugar: { name: 'Сахар', kind: 'jar', color: '#FFFDF4', lid: '#E2483D', home: true },
  soda: { name: 'Пищевая сода', kind: 'jar', color: '#FAFBFF', lid: '#0F766E', home: true },
  starch: { name: 'Крахмал', kind: 'jar', color: '#FFFFFF', lid: '#E0A100', home: true },
  chalk: { name: 'Мел', kind: 'jar', color: '#F3F1EA', lid: '#56628A', home: true },
  citric: { name: 'Лимонная кислота', kind: 'jar', color: '#FFFFFF', lid: '#8FD3AE', home: true },
  sand: { name: 'Песок', kind: 'jar', color: '#D9B779', lid: '#6F4A18', home: true },
  copper: { name: 'Медный купорос', kind: 'jar', color: '#3A8EDB', lid: '#8B2FC9', home: false },
  water: { name: 'Вода', kind: 'bottle', color: '#CDE9FB', cap: '#3B78E3', home: true },
  vinegar: { name: 'Уксус', kind: 'bottle', color: '#EEF6E8', cap: '#E0A100', home: true },
  iodine: { name: 'Раствор йода', kind: 'bottle', color: '#B5651D', cap: '#6F4A18', home: false },
  cabbage: { name: 'Отвар капусты', kind: 'bottle', color: '#7B4FB5', cap: '#0F766E', home: true },
  permanganate: { name: 'Марганцовка', kind: 'jar', color: '#8E1B8E', lid: '#56628A', home: false },
  peroxide: { name: 'Перекись водорода', kind: 'bottle', color: '#E3F3FB', cap: '#56628A', home: false },
  phenol: { name: 'Фенолфталеин', kind: 'bottle', color: '#F6F6F6', cap: '#56628A', home: false },
};

export function substance(id, { selected = false, locked = false, lockNote = '', letter = '', nameOverride, metaOverride, isNew = false } = {}) {
  const s = SUB[id];
  const name = nameOverride || s.name;
  const isBottle = s.kind === 'bottle';
  const art = isBottle
    ? svg('containers/bottle.svg', { style: `--liquid-color:${s.color};--cap-color:${s.cap};--level:.72`, label: '' })
    : svg('containers/jar.svg', { style: `--substance-color:${s.color};--lid-color:${s.lid};--fill:.7`, label: '' });
  const meta = metaOverride !== undefined
    ? metaOverride
    : locked
      ? `<span class="hl-substance__meta">${lockNote}</span>`
      : s.home
        ? `<span class="hl-substance__meta hl-substance__meta--home">${icon('home')}<span>есть дома</span></span>`
        : `<span class="hl-substance__meta hl-substance__meta--lab">${icon('lab-only')}<span>только в лабе</span></span>`;
  const state = locked ? ' is-locked' : '';
  const aria = locked ? ` aria-disabled="true"` : ` aria-pressed="${selected}"`;
  const label = locked ? `${name}. Закрыто: ${lockNote}` : `${name}${letter ? `, банка ${letter}` : ''}${s.home ? ', есть дома' : ', только в виртуальной лабе'}`;
  return `<button class="hl-substance${isBottle ? ' hl-substance--bottle' : ''}${state}${isNew ? ' is-new' : ''}"${aria} aria-label="${label}">
  <span class="hl-substance__art">${art}${letter ? `<span class="hl-substance__letter" aria-hidden="true">${letter}</span>` : ''}${locked ? `<span class="hl-substance__lock">${icon('lock')}</span>` : ''}</span>
  <span class="hl-substance__name">${name}</span>
  ${meta}
</button>`;
}

export const shelfRow = (items) => `<div class="hl-shelf__row">${items.join('')}</div>`;

// ---------- верхняя панель лабы ----------
export function labTopbar({ mode = 'sandbox', title, hints = true, deeper = false, journalBtn = true }) {
  const modeChip = mode === 'sandbox'
    ? `<span class="hl-mode hl-mode--sandbox">${icon('sandbox')}Песочница</span>`
    : `<span class="hl-mode hl-mode--mission">${icon('target')}Миссия</span>`;
  return `<header class="hl-topbar">
  <a class="hl-btn hl-btn--ghost hl-btn--icon" href="home.html" aria-label="К карте модуля">${icon('back')}</a>
  <div class="hl-topbar__title">${modeChip}<h1>${title}</h1></div>
  <div class="hl-topbar__spacer"></div>
  <div class="hl-topbar__group">
    <button class="hl-switch" role="switch" aria-checked="${hints}"><span class="hl-switch__label">${icon('hint')}Подсказки</span><span class="hl-switch__track"></span></button>
    <button class="hl-switch hl-switch--deep" role="switch" aria-checked="${deeper}"><span class="hl-switch__label">${icon('deeper')}<span class="hl-hide-compact">Копнуть глубже</span><span class="hl-show-compact">Глубже</span></span><span class="hl-switch__track"></span></button>
    <span class="hl-topbar__divider" aria-hidden="true"></span>
    <button class="hl-btn hl-btn--ghost hl-btn--icon" aria-label="Звук включён">${icon('sound-on')}</button>
    ${journalBtn ? `<button class="hl-btn hl-btn--secondary hl-btn--sm hl-journal-toggle" aria-expanded="false" aria-controls="journal">${icon('journal')}Журнал</button>` : ''}
  </div>
</header>`;
}

// ---------- полка посуды ----------
export function rail(items) {
  const map = {
    beaker: ['equipment/beaker.svg', 'Стакан'],
    tube: ['equipment/test-tube.svg', 'Пробирка'],
    flask: ['equipment/flask.svg', 'Колба'],
    cylinder: ['equipment/graduated-cylinder.svg', 'Цилиндр'],
    dish: ['equipment/evaporating-dish.svg', 'Чашка'],
    funnel: ['equipment/funnel.svg', 'Воронка'],
    burner: ['equipment/burner.svg', 'Горелка'],
    ice: ['equipment/ice-bath.svg', 'Лёд'],
    scales: ['equipment/scales.svg', 'Весы'],
    holder: ['equipment/test-tube-holder.svg', 'Держатель'],
    magnet: ['equipment/magnet.svg', 'Магнит'],
  };
  return `<div class="hl-rail-wrap"><div class="hl-rail" role="list" aria-label="Посуда и приборы">
  <span class="hl-rail__label">Посуда и приборы</span>
  ${items.map((k) => { const [src, name] = map[k]; return `<button class="hl-rail__item" role="listitem" aria-label="${name}: перетащи на стол или нажми, чтобы поставить">${svg(src, { label: '' })}<span>${name}</span></button>`; }).join('')}
</div></div>`;
}

// ---------- действия ----------
export const ACT = {
  stir: ['stir', 'Перемешать', ''],
  heat: ['heat', 'Нагреть', 'hl-act--heat'],
  cool: ['cool', 'Охладить', 'hl-act--cool'],
  wait: ['wait', 'Подождать', ''],
  filter: ['filter', 'Фильтр', ''],
  evaporate: ['evaporate', 'Выпарить', 'hl-act--heat'],
  filter2: ['filter', 'Фильтр', ''],
  smell: ['smell', 'Понюхать', 'hl-act--observe'],
  magnify: ['magnify', 'Лупа', 'hl-act--observe'],
  help: ['hint', 'Пипа, помоги', ''],
  temperature: ['temperature', 'Термометр', 'hl-act--observe'],
  ph: ['ph', 'pH', 'hl-act--observe'],
  magnet: ['magnet', 'Магнит', ''],
};
export function act(k, { key = '', state = '', disabled = false } = {}) {
  const [ic, label, cls] = ACT[k];
  return `<button class="hl-act ${cls} ${state}"${disabled ? ' aria-disabled="true"' : ''}${state === 'is-running' ? ' aria-busy="true"' : ''}>${icon(ic)}<span>${label}</span>${key ? `<kbd class="hl-act__key">${key}</kbd>` : ''}</button>`;
}
// Док действий: строка контекста (выбранный сосуд) и ряды действий. Последний ряд заканчивается «Отменить» и «Вылить».
// rows: [{ label, acts: [html…] }]. cols — число колонок кнопок (без колонки подписи).
export function dock({ vessel, contents, rows, cols, clearLabel = 'Вылить', extra = '' }) {
  const tail = `<button class="hl-act hl-act--quiet hl-dock__split">${icon('undo')}<span>Отменить</span></button><button class="hl-act hl-act--quiet">${icon('clear')}<span>${clearLabel}</span></button>`;
  return `<div class="hl-dock" role="toolbar" aria-label="Действия с выбранным сосудом" style="--cols:${cols}">
  <div class="hl-dock__context"><span class="hl-dock__vessel"><b>${vessel}</b><span>${contents}</span></span>${extra}</div>
  ${rows.map((r, i) => `<div class="hl-dock__rowlabel" aria-hidden="true">${r.label}</div>${r.acts.join('')}${i === rows.length - 1 ? tail : ''}`).join('\n  ')}
</div>`;
}

export function logo() {
  return `<a class="hl-logo" href="home.html" aria-label="Хим лаба, на главную">${svg('brand/logo-mark.svg', { cls: 'hl-logo__mark', label: '' })}<span class="hl-logo__word">Хим лаба</span></a>`;
}
