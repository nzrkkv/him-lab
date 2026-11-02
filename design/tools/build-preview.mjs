// Собирает design/preview/index.html — одну самодостаточную страницу для ревью.
// Всё встроено: CSS, SVG, шрифты (data URI), макеты (iframe srcdoc). Внешние — только Google Fonts (подстраховка).
// Запуск: node design/tools/build-preview.mjs (после build-tokens, build-assets, build-mockups)
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { svg, icon, substance } from './mockup-kit.mjs';

const D = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(D, p), 'utf8');
const tokens = JSON.parse(read('tokens/tokens.json'));
const b64 = (p) => readFileSync(join(D, p)).toString('base64');

const fontCss = `@font-face{font-family:'Unbounded';src:url(data:font/woff;base64,${b64('fonts/Unbounded-var.woff')}) format('woff');font-weight:500 800;font-display:swap}
@font-face{font-family:'Golos Text';src:url(data:font/woff;base64,${b64('fonts/GolosText-var.woff')}) format('woff');font-weight:400 900;font-display:swap}`;
const stripFontFace = (css) => css.replace(/@font-face\s*{[^}]*}/g, '');
const baseCss = [stripFontFace(read('tokens/tokens.css')), read('components/components.css'), read('components/lab.css'), read('components/effects.css')].join('\n');

// макет → самодостаточный srcdoc
function inlineMockup(name) {
  let html = read(`mockups/${name}.html`);
  html = html.replace(/<link rel="stylesheet" href="\.\.\/[^"]+">\n?/g, '');
  // общие стили и шрифты вставляются в iframe из родительской страницы при загрузке (см. скрипт внизу)
  html = html.replace(/href="(home|lesson|lab-[a-z-]+)\.html"/g, 'href="#"');
  return html.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

// ---- палитра из токенов ----
const C = tokens.color;
const res = (v) => { const m = typeof v === 'string' && v.match(/^\{color\.(.+)\}$/); if (!m) return v; return m[1].split('.').reduce((o, k) => o[k], C).$value; };
function swatches(group, prefix, keys) {
  return `<div class="pv-sw">${(keys || Object.keys(group).filter((k) => !k.startsWith('$'))).map((k) => {
    const t = group[k]; if (!t || t.$value === undefined) return '';
    const v = res(t.$value);
    return `<figure><i style="background:${v}"></i><figcaption><b>${prefix}-${k}</b><code>${v}</code>${t.$description ? `<small>${t.$description}</small>` : ''}</figcaption></figure>`;
  }).join('')}</div>`;
}
const phStops = Object.keys(C.ph).filter((k) => !k.startsWith('$')).map((k) => C.ph[k].$value);

// ---- ассеты ----
const listDir = (d) => readdirSync(join(D, 'assets', d)).filter((f) => f.endsWith('.svg') && f !== 'sprite.svg').map((f) => f.replace('.svg', ''));
const manifest = JSON.parse(read('assets/manifest.json'));
const eqStates = {
  beaker: ['--level:.6', '--level:.55;--liquid-color:#1F2570', '--level:.5;--bubbles:1;--foam:1', '--level:.55;--turbidity:.85;--liquid-color:#D9DCD6;--sediment:.8'],
  'test-tube': ['--level:.5;--liquid-color:#B5651D', '--level:0;--powder:1'],
  flask: ['--level:.6;--liquid-color:#3A8EDB'], 'graduated-cylinder': ['--level:.7'],
  'evaporating-dish': ['--level:.6', '--level:0;--crystals:1'], spoon: ['--powder:1'], pipette: ['--level:.6;--drop:1;--liquid-color:#B5651D'],
  funnel: ['--level:.6;--residue:1;--flow:1;--drip:1'], thermometer: ['--temp:.75'], 'ph-strip': ['--ph-color:#F2752B'], burner: ['--heat:1'],
};
const eqCards = manifest.equipment.map((n) => (eqStates[n] || ['']).map((st, i) => `<figure class="pv-asset${n === 'test-tube-rack' || n === 'ice-bath' || n === 'test-tube-holder' ? ' pv-asset--wide' : ''}">${svg(`equipment/${n}.svg`, { style: st, label: '' })}<figcaption>${n}${st ? `<code>${st.replace(/;/g, '; ')}</code>` : ''}</figcaption></figure>`).join('')).join('');
const iconCards = Object.entries(manifest.icons).map(([k, t]) => `<figure class="pv-icon">${icon(k)}<figcaption><b>${t}</b><code>${k}</code></figcaption></figure>`).join('');

// ---- состояния компонентов ----
const btnRow = (cls, label, ic) => ['', 'is-hover', 'is-active', 'is-focus', 'is-disabled'].map((st) => `<div class="pv-state"><button class="hl-btn ${cls} ${st}" ${st === 'is-disabled' ? 'disabled' : ''}>${ic ? icon(ic) : ''}${label}</button><span>${st ? st.replace('is-', '') : 'default'}</span></div>`).join('');
const actRow = ['', 'is-hover', 'is-active', 'is-focus', 'is-selected', 'is-running', 'disabled'].map((st) => `<div class="pv-state"><button class="hl-act hl-act--heat ${st === 'disabled' ? '' : st}" ${st === 'disabled' ? 'aria-disabled="true"' : ''} style="width:112px">${icon('heat')}<span>Нагреть</span><kbd class="hl-act__key">H</kbd></button><span>${st ? st.replace('is-', '') : 'default'}</span></div>`).join('');
const subRow = [['', {}], ['is-hover', {}], ['is-selected', { selected: true }], ['is-focus', {}], ['locked', { locked: true, lockNote: 'Урок 4' }], ['new', { isNew: true }]]
  .map(([st, o]) => `<div class="pv-state" style="width:132px">${substance(st === 'locked' ? 'permanganate' : 'soda', o).replace('class="hl-substance', `class="hl-substance ${st.startsWith('is-') ? st : ''}`)}<span>${st || 'default'}</span></div>`).join('');

const sections = [
  ['concept', 'Концепция'], ['guide', 'Персонаж'], ['color', 'Цвет'], ['type', 'Шрифт'], ['components', 'Компоненты'], ['assets', 'Ассеты'], ['effects', 'Эффекты'], ['mockups', 'Макеты'],
];
const mockups = [
  ['lab-mission', 'Миссия с подсказкой'], ['lab-result', 'Результат и объяснение'], ['lab-safety-stop', 'Опасное сочетание'], ['lab-sandbox', 'Песочница'], ['lesson', 'Урок: сначала опыт'], ['home', 'Карта модуля'],
];

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Хим лаба — дизайн-ревью</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400..800&family=Unbounded:wght@500..800&display=swap" rel="stylesheet">
<style id="pv-base">
${fontCss}
${baseCss}
</style>
<style>
body { background: var(--color-tile-50); }
.pv-top { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; gap: 20px; padding: 0 24px; height: 64px; background: var(--color-paper); border-bottom: 2px solid var(--color-ink-900); }
.pv-top nav { display: flex; gap: 2px; overflow-x: auto; }
.pv-top nav a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 12px; border-radius: 10px; font-weight: 700; font-size: 15px; color: var(--color-ink-700); text-decoration: none; white-space: nowrap; }
.pv-top nav a:hover { background: var(--color-copper-50); color: var(--color-ink-900); }
.pv { max-width: 1240px; margin: 0 auto; padding: 32px 24px 80px; }
.pv section { scroll-margin-top: 72px; padding: 40px 0 8px; border-bottom: 2px solid var(--color-tile-200); }
.pv h2 { font: 700 32px/1.15 var(--font-family-display); letter-spacing: -0.015em; margin-bottom: 8px; }
.pv h3 { font: 600 20px/1.3 var(--font-family-display); margin: 28px 0 12px; }
.pv p.lead { font-size: 19px; line-height: 29px; max-width: 46em; color: var(--color-ink-700); }
.pv ul.pv-list { list-style: disc; padding-left: 22px; max-width: 46em; }
.pv ul.pv-list li { margin: 4px 0; font-size: 17px; line-height: 26px; }
.pv-hero { display: grid; grid-template-columns: 1fr 360px; gap: 32px; align-items: center; padding: 24px 0 8px; }
.pv-hero h1 { font: 800 56px/1.02 var(--font-family-display); letter-spacing: -0.025em; }
.pv-hero p { font-size: 21px; line-height: 31px; margin-top: 16px; color: var(--color-ink-700); max-width: 32em; }
.pv-hero svg { width: 100%; height: auto; }
.pv-principles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 20px; }
.pv-principles div { background: var(--color-paper); border: 2px solid var(--color-ink-200); border-radius: var(--radius-lg); padding: 16px; }
.pv-principles b { display: block; font-size: 18px; margin-bottom: 4px; }
.pv-principles span { font-size: 16px; line-height: 24px; color: var(--color-ink-700); }
.pv-poses { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.pv-poses figure { background: var(--color-paper); border: 2px solid var(--color-ink-200); border-radius: var(--radius-lg); padding: 16px; text-align: center; }
.pv-poses svg { width: 160px; height: auto; margin: 0 auto 8px; }
.pv-poses b { display: block; font-size: 17px; }
.pv-poses span { font-size: 15px; color: var(--color-ink-700); }
.pv-names { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-top: 16px; }
.pv-names div { background: var(--color-paper); border: 2px solid var(--color-ink-200); border-radius: var(--radius-lg); padding: 14px 16px; font-size: 16px; line-height: 24px; }
.pv-names div.rec { border-color: var(--color-ink-900); box-shadow: 0 0 0 4px var(--color-lamp-400); }
.pv-names b { font: 600 19px/1.3 var(--font-family-display); display: block; margin-bottom: 4px; }
.pv-sw { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; }
.pv-sw figure { display: flex; gap: 10px; align-items: flex-start; background: var(--color-paper); border-radius: 12px; padding: 8px; border: 1.5px solid var(--color-ink-100); }
.pv-sw i { width: 44px; height: 44px; border-radius: 10px; flex: none; border: 2px solid var(--color-ink-900); }
.pv-sw b { display: block; font-size: 14px; }
.pv-sw code { font-size: 13px; color: var(--color-ink-500); }
.pv-sw small { display: block; font-size: 12px; line-height: 16px; color: var(--color-ink-700); margin-top: 2px; }
.pv-ph { height: 44px; border-radius: 10px; border: 2px solid var(--color-ink-900); background: linear-gradient(90deg in oklch, ${phStops.join(', ')}); }
.pv-ph-labels { display: flex; justify-content: space-between; font-size: 14px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
.pv-type > div { display: grid; grid-template-columns: 180px 1fr; gap: 16px; align-items: baseline; padding: 10px 0; border-top: 1px solid var(--color-ink-100); }
.pv-type code { font-size: 13px; color: var(--color-ink-500); }
.pv-row { display: flex; flex-wrap: wrap; gap: 14px; align-items: flex-end; }
.pv-state { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.pv-state > span { font-size: 13px; font-weight: 600; color: var(--color-ink-500); }
.pv-box { background: var(--color-paper); border: 2px solid var(--color-ink-100); border-radius: var(--radius-lg); padding: 20px; }
.pv-box--tile { background: var(--color-tile-100); }
.pv-box--wood { background: var(--color-wood-100); }
.pv-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.pv-assets { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
.pv-asset { background: var(--color-paper); border: 1.5px solid var(--color-ink-100); border-radius: 14px; padding: 12px; text-align: center; width: 150px; }
.pv-asset--wide { width: 312px; }
.pv-asset svg { width: auto; height: 120px; max-width: 100%; margin: 0 auto 6px; }
.pv-asset figcaption { font-size: 13px; font-weight: 700; }
.pv-asset code { display: block; font-size: 11px; font-weight: 500; color: var(--color-ink-500); word-break: break-all; }
.pv-icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(124px, 1fr)); gap: 8px; }
.pv-icon { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 6px; background: var(--color-paper); border-radius: 12px; border: 1.5px solid var(--color-ink-100); text-align: center; color: var(--color-ink-900); }
.pv-icon .hl-icon { width: 32px; height: 32px; }
.pv-icon b { display: block; font-size: 13px; line-height: 1.2; }
.pv-icon code { font-size: 11px; color: var(--color-ink-500); }
.pv-fx { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.pv-fx figure { background: var(--color-tile-100); border: 2px solid var(--color-ink-200); border-radius: var(--radius-lg); padding: 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.pv-fx figure > svg { height: 150px; width: auto; }
.pv-fx figcaption { font-size: 15px; font-weight: 700; text-align: center; }
.pv-fx small { display: block; font-weight: 500; color: var(--color-ink-700); font-size: 13px; }
.pv-phdemo { display: grid; grid-template-columns: 140px 1fr; gap: 24px; align-items: center; }
.pv-phdemo svg { width: 120px; height: auto; }
.pv-phdemo input { width: 100%; height: 44px; accent-color: var(--color-ink-900); }
.pv-mk-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
.pv-mk-frame { border: 2px solid var(--color-ink-900); border-radius: 16px; overflow: hidden; background: #fff; position: relative; }
.pv-mk-frame iframe { border: 0; transform-origin: 0 0; display: block; }
.pv-sizes { display: inline-flex; gap: 4px; margin-left: auto; }
.pv-note { font-size: 15px; color: var(--color-ink-700); margin-top: 8px; }
.pv-demo-dialog { position: relative; inset: auto; background: rgba(22,33,63,.55); border-radius: 20px; padding: 24px; }
</style>
</head>
<body>
<header class="pv-top">
  <span class="hl-logo">${svg('brand/logo-mark.svg', { cls: 'hl-logo__mark', label: '' })}<span class="hl-logo__word">Хим лаба</span></span>
  <nav aria-label="Разделы ревью">${sections.map(([id, t]) => `<a href="#${id}">${t}</a>`).join('')}</nav>
</header>
<main class="pv">

<section id="concept" style="padding-top:8px">
  <div class="pv-hero">
    <div>
      <h1>Настоящая лаборатория, только добрая</h1>
      <p>Визуальный язык Хим лабы: кафельная мятная стена, берёзовые полки, стекло с толстым тёмно-синим контуром и цвет, который появляется только тогда, когда его даёт химия.</p>
    </div>
    ${svg('character/guide-explain.svg', { label: 'Пипа объясняет' })}
  </div>
  <div class="pv-principles">
    <div><b>Цвет — это событие</b><span>Интерфейс спокойный: кафель, бумага, дерево. Яркие цвета даёт только вещество. Так результат опыта всегда заметен.</span></div>
    <div><b>Стекло и чернила</b><span>Единый контур 4 px тёмно-синего на сетке 4 px. Стекло полупрозрачное, жидкость — под ним, блик — сверху.</span></div>
    <div><b>Нажимается — значит, стоит</b><span>Кнопки и банки «стоят» на плоской губе-тени. Нажал — опустилось. Никаких размытых теней, кроме того, что парит.</span></div>
    <div><b>Слово плюс знак</b><span>Каждый результат: иконка + короткий текст + цвет. Цвет никогда не говорит один.</span></div>
    <div><b>Безопасность — янтарь, не красный</b><span>Остановка опыта — спокойная янтарная карточка с Пипой в очках. Без сирен и восклицаний.</span></div>
    <div><b>Глубина — бирюза</b><span>Всё, что «копнуть глубже», окрашено в бирюзовый. Ребёнок узнаёт необязательное с первого взгляда.</span></div>
  </div>
</section>

<section id="guide">
  <h2>Персонаж-проводник</h2>
  <p class="lead">Колба-учёная с круглым дном на пробковом кольце. Тело — жидкость внутри колбы, поэтому персонаж может менять цвет вместе с опытом. В уроке 1 её зовут Пипа; если автор выберет другое имя, меняется только текст — файлы называются нейтрально (guide-*).</p>
  <div class="pv-poses">
    <figure>${svg('character/guide-explain.svg', { label: '' })}<b>Объясняет</b><span>указывает пальцем, очки на лбу</span></figure>
    <figure>${svg('character/guide-happy.svg', { label: '' })}<b>Радуется</b><span>руки вверх, искры, пузырьки из горлышка</span></figure>
    <figure>${svg('character/guide-thinking.svg', { label: '' })}<b>Задумалась</b><span>смотрит вверх, рука у «подбородка»</span></figure>
    <figure>${svg('character/guide-warn.svg', { label: '' })}<b>Предупреждает</b><span>очки опущены, ладонь «стоп», спокойное лицо</span></figure>
  </div>
  <div class="pv-names">
    <div class="rec"><b>Пипа — рекомендую</b>От «пипетки». Любопытная и точная, говорит коротко, радуется ошибкам как находкам. Совпадает с черновиком урока 1.</div>
    <div><b>Колбочка</b>Понятно с первого слова, но звучит младше 9 лет и хуже держит характер учёной.</div>
    <div><b>Окси</b>От «оксид». Звонко и «научно», но уводит в химию кислорода и читается как бренд.</div>
  </div>
  <h3>Перекраска</h3>
  <div class="pv-row">${['#8A6CF0', '#14918A', '#E2483D', '#3B78E3'].map((c) => `<div style="width:120px;--guide-color:${c}">${svg('character/guide-happy.svg', { label: '' })}</div>`).join('')}</div>
  <p class="pv-note">Жидкость внутри Пипы — <code>--guide-color</code>. Например, после опыта с индикатором она «краснеет» вместе с раствором.</p>
</section>

<section id="color">
  <h2>Цвет</h2>
  <p class="lead">Все пары «текст на фоне» проверены по WCAG AA скриптом <code>design/tools/build-tokens.mjs</code> (отчёт — <code>design/tokens/contrast-report.txt</code>).</p>
  <h3>Интерфейс</h3>
  ${swatches(C.ink, 'ink')}
  <div style="height:10px"></div>
  ${swatches(C.tile, 'tile')}
  <div style="height:10px"></div>
  ${swatches(C.wood, 'wood')}
  <h3>Акценты</h3>
  ${swatches(C.copper, 'copper', ['50', '500', '600', '700', '800'])}
  <div style="height:10px"></div>
  ${swatches(C.lamp, 'lamp')}
  <div style="height:10px"></div>
  ${swatches(C.deep, 'deep', ['50', '100', '600', '800'])}
  <div style="height:10px"></div>
  ${swatches(C.grape, 'grape', ['50', '100', '600', '800'])}
  <h3>Обратная связь</h3>
  ${swatches({ 'success-100': C.feedback.success['100'], 'success-600': C.feedback.success['600'], 'neutral-100': C.feedback.neutral['100'], 'neutral-600': C.feedback.neutral['600'], 'caution-100': C.feedback.caution['100'], 'caution-500': C.feedback.caution['500'], 'caution-700': C.feedback.caution['700'] }, 'feedback')}
  <h3>Вещества и растворы</h3>
  ${swatches(C.substance, 'substance')}
  <h3>Шкала pH (универсальный индикатор)</h3>
  <div class="pv-ph"></div>
  <div class="pv-ph-labels">${phStops.map((_, i) => `<span>${i + 1}</span>`).join('')}</div>
  <p class="pv-note">Промежуточные значения — интерполяция в OKLCH между соседними точками. Рядом с цветом всегда число pH и слово: «кислая», «нейтральная», «щелочная».</p>
</section>

<section id="type">
  <h2>Шрифт</h2>
  <p class="lead">Unbounded — заголовки, названия миссий, номера. Golos Text — весь интерфейс и текст. Оба бесплатные (OFL), из Google Fonts, с полной кириллицей.</p>
  <div class="pv-type">
    <div><code>display 56/60 · Unbounded 700</code><span class="hl-display">Загадка порошков</span></div>
    <div><code>h1 36/44 · Unbounded 700</code><span class="hl-h1">Вещества вокруг нас</span></div>
    <div><code>h2 28/36 · Unbounded 600</code><span class="hl-h2">Йод нашёл крахмал!</span></div>
    <div><code>h3 21/28 · Unbounded 600</code><span class="hl-h3">Детективная доска</span></div>
    <div><code>title 20/26 · Golos 700</code><span class="hl-title">Подпиши все 5 банок</span></div>
    <div><code>lg 20/30 · Golos 400</code><span class="hl-lg">Ого! На вид одинаковые. А ведут себя по-разному!</span></div>
    <div><code>md 18/27 · Golos 400 — основной</code><span class="hl-md">Только крахмал так синеет от йода. Это его главная примета.</span></div>
    <div><code>sm 16/23 · Golos 400</code><span class="hl-sm">Соль, по-научному — хлорид натрия</span></div>
    <div><code>xs 15/20 · Golos 500 — минимум</code><span class="hl-xs">Подсказка 1 из 3</span></div>
    <div><code>readout 28 · Golos 700 tnum</code><span class="hl-readout__value hl-num">22,5 °C · pH 8</span></div>
  </div>
</section>

<section id="components">
  <h2>Компоненты</h2>
  <p class="lead">Все состояния показаны статично через классы <code>is-hover</code>, <code>is-active</code>, <code>is-focus</code>; в продукте они даются псевдоклассами и ARIA-атрибутами.</p>
  <h3>Кнопки</h3>
  <div class="pv-box"><div class="pv-row">${btnRow('hl-btn--primary', 'Проверить', 'check')}</div><div style="height:16px"></div><div class="pv-row">${btnRow('hl-btn--secondary', 'Ещё подсказку')}</div><div style="height:16px"></div><div class="pv-row">${btnRow('hl-btn--ghost', 'Пока не надо')}</div></div>
  <h3>Кнопка действия</h3>
  <div class="pv-box" style="background:var(--color-bench-edge)"><div class="pv-row">${actRow}</div></div>
  <h3>Карточка вещества</h3>
  <div class="pv-box pv-box--wood"><div class="pv-row">${subRow}</div></div>
  <h3>Переключатели, вкладки, выбор количества</h3>
  <div class="pv-box"><div class="pv-row">
    <div class="pv-state"><button class="hl-switch" role="switch" aria-checked="true"><span class="hl-switch__label">${icon('hint')}Подсказки</span><span class="hl-switch__track"></span></button><span>вкл</span></div>
    <div class="pv-state"><button class="hl-switch hl-switch--deep" role="switch" aria-checked="false"><span class="hl-switch__label">${icon('deeper')}Копнуть глубже</span><span class="hl-switch__track"></span></button><span>выкл</span></div>
    <div class="pv-state"><button class="hl-switch hl-switch--deep is-focus" role="switch" aria-checked="true"><span class="hl-switch__label">${icon('deeper')}Копнуть глубже</span><span class="hl-switch__track"></span></button><span>вкл + фокус</span></div>
    <div class="pv-state"><div class="hl-tabs" role="tablist"><button class="hl-tab" role="tab" aria-selected="true">Все</button><button class="hl-tab is-hover" role="tab" aria-selected="false">Порошки</button><button class="hl-tab" role="tab" aria-selected="false">Жидкости</button></div><span>вкладки: выбрана, hover, обычная</span></div>
  </div>
  <div style="height:20px"></div>
  <div class="pv-row">
    <div class="pv-state"><div class="hl-qty"><button class="hl-qty__btn" aria-label="Меньше">${icon('minus')}</button><div class="hl-qty__value" aria-live="polite"><b class="hl-num">2</b><span>ложки</span></div><button class="hl-qty__btn" aria-label="Больше">${icon('plus')}</button></div><span>выбор количества</span></div>
    <div class="pv-state"><div class="hl-qty__presets" role="group" aria-label="Быстрый выбор"><button class="hl-qty__preset" aria-pressed="false">1</button><button class="hl-qty__preset" aria-pressed="true">2</button><button class="hl-qty__preset" aria-pressed="false">3</button><button class="hl-qty__preset" aria-pressed="false">5</button></div><span>пресеты</span></div>
    <div class="pv-state"><div class="hl-qty"><button class="hl-qty__btn" disabled aria-label="Меньше">${icon('minus')}</button><div class="hl-qty__value"><b class="hl-num">1</b><span>капля</span></div><button class="hl-qty__btn" aria-label="Больше">${icon('plus')}</button></div><span>минимум</span></div>
  </div></div>
  <h3>Обратная связь</h3>
  <div class="pv-grid2">
    <div class="pv-box" style="display:flex;flex-direction:column;gap:10px">
      <div class="hl-observation hl-observation--change"><span class="hl-observation__icon">${icon('result-gas')}</span><div><div class="hl-observation__title">Пузырьки газа</div><div class="hl-observation__sub">Бурно, пена до середины</div></div></div>
      <div class="hl-observation hl-observation--nothing"><span class="hl-observation__icon">${icon('result-nothing')}</span><div><div class="hl-observation__title">Ничего не произошло</div><div class="hl-observation__sub">Соль с уксусом не реагирует. Это тоже результат</div></div></div>
      <div class="hl-observation hl-observation--success"><span class="hl-observation__icon">${icon('check')}</span><div><div class="hl-observation__title">Надпись верная</div><div class="hl-observation__sub">Банка В — крахмал: посинела от йода</div></div></div>
      <div class="hl-observation hl-observation--discovery"><span class="hl-observation__icon">${icon('star')}</span><div><div class="hl-observation__title">Открытие!</div><div class="hl-observation__sub">Новое вещество в песочнице: известковая вода</div></div></div>
      <div class="hl-observation hl-observation--caution"><span class="hl-observation__icon">${icon('caution')}</span><div><div class="hl-observation__title">Лаба остановила опыт</div><div class="hl-observation__sub">Так в настоящей лаборатории не делают</div></div></div>
    </div>
    <div class="pv-box pv-box--tile" style="display:flex;flex-direction:column;gap:16px;align-items:flex-start">
      <div class="hl-speech hl-speech--tail-bottom"><div class="hl-speech__head"><span class="hl-speech__who">Пипа</span><span class="hl-speech__level">Подсказка 2 из 3 <span class="hl-speech__dots"><i class="on"></i><i class="on"></i><i></i></span></span></div><p class="hl-speech__text">Капни йод на оба порошка.</p></div>
      <div style="height:6px"></div>
      <div class="hl-toast" role="status">${'<span class="hl-toast__icon">' + icon('check') + '</span>'}<span>Записано в журнал</span><button class="hl-btn">Открыть</button></div>
      <div class="hl-deeper" style="width:100%"><button class="hl-deeper__toggle" aria-expanded="true">${icon('deeper')}Копнуть глубже${icon('forward', 'hl-deeper__chev')}</button><div class="hl-deeper__body"><p>В соде и в меле есть одинаковая «деталь». Из неё и получается углекислый газ.</p><span class="hl-deeper__sci">По-научному: <b>карбонаты</b></span></div></div>
    </div>
  </div>
  <h3>Цель миссии, прогресс, значки</h3>
  <div class="pv-box" style="display:flex;flex-direction:column;gap:18px">
    <div class="hl-goal"><span class="hl-goal__icon">${icon('target')}</span><div class="hl-goal__text"><div class="hl-goal__title">Подпиши все 5 банок</div><div class="hl-goal__label">Каждую надпись докажи опытом</div></div><div class="hl-goal__progress"><span class="hl-goal__slots"><i class="done">А</i><i class="done">Б</i><i>В</i><i>Г</i><i>Д</i></span></div><button class="hl-btn hl-btn--secondary hl-btn--sm">${icon('hint')}Пипа, помоги</button><button class="hl-btn hl-btn--primary hl-btn--sm">${icon('check')}Проверить</button></div>
    <div class="pv-row" style="align-items:center;gap:32px"><div style="width:280px" class="hl-progress"><i class="hl-progress__seg done"></i><i class="hl-progress__seg done"></i><i class="hl-progress__seg current"></i><i class="hl-progress__seg"></i><i class="hl-progress__seg"></i><i class="hl-progress__seg"></i><i class="hl-progress__seg"></i></div><div style="width:280px" class="hl-progress-bar" style="--value:40%"><i></i></div></div>
    <div class="pv-row">${manifest.badges.map((b, i) => `<div class="hl-badge${i > 2 ? ' is-locked' : ''}">${svg(`badges/${b.replace('badge-', '')}.svg`, { cls: 'hl-badge__art', label: '' })}<span class="hl-badge__name">${({ 'first-experiment': 'Первый опыт', 'powder-detective': 'Сыщик порошков', 'safety-pro': 'Знаток безопасности', observer: 'Наблюдатель', discoverer: 'Первооткрыватель', 'solution-master': 'Мастер растворов' })[b.replace('badge-', '')]}</span><span class="hl-badge__hint">${i > 2 ? 'Ещё не получен' : 'Получен'}</span></div>`).join('')}</div>
  </div>
</section>

<section id="assets">
  <h2>Ассеты</h2>
  <p class="lead">Плоский вектор в коде. Контур 4 единицы viewBox, сетка 4, цвет жидкости и вещества — CSS-переменными. Слои для анимации подписаны <code>data-layer</code>. Подробно — <code>design/assets/README.md</code>.</p>
  <h3>Оборудование (с примерами состояний)</h3>
  <div class="pv-assets">${eqCards}</div>
  <h3>Тара веществ, лупа, бренд</h3>
  <div class="pv-assets">
    ${['jar', 'bottle', 'bag'].map((n) => `<figure class="pv-asset">${svg(`containers/${n}.svg`, { label: '' })}<figcaption>${n}</figcaption></figure>`).join('')}
    ${manifest.lens.map((n) => `<figure class="pv-asset">${svg(`lens/${n}.svg`, { label: '' })}<figcaption>${n}</figcaption></figure>`).join('')}
    <figure class="pv-asset">${svg('brand/logo-mark.svg', { label: '' })}<figcaption>logo-mark</figcaption></figure>
  </div>
  <h3>Иконки 32×32</h3>
  <div class="pv-icons">${iconCards}</div>
  <h3>Спрайты эффектов</h3>
  <div class="pv-assets">${manifest.fx.map((n) => `<figure class="pv-asset">${svg(`fx/${n}.svg`, { label: '' })}<figcaption>${n}</figcaption></figure>`).join('')}</div>
</section>

<section id="effects">
  <h2>Эффекты</h2>
  <p class="lead">Живые CSS-анимации из <code>components/effects.css</code>. При «уменьшить движение» в системе частицы замирают, остаётся итоговое состояние.</p>
  <div class="pv-fx">
    <figure>${svg('equipment/beaker.svg', { cls: 'fx-fizz fx-fizz--strong', style: '--level:.55;--bubbles:1;--foam:1', label: '' })}<figcaption>Пузырьки и пена<small>fx-fizz, --bubbles, --foam</small></figcaption></figure>
    <figure>${svg('equipment/test-tube.svg', { cls: 'fx-settle', style: '--level:.5;--turbidity:.5;--liquid-color:#D9DCD6;--sediment:1', label: '' })}<figcaption>Осадок<small>fx-settle, --sediment</small></figcaption></figure>
    <figure><span style="position:relative;display:block">${svg('fx/steam.svg', { style: 'position:absolute;left:18px;top:-50px;width:84px', label: '' })}${svg('equipment/beaker.svg', { cls: 'fx-fizz', style: '--level:.5;--bubbles:.8', label: '' })}</span><figcaption>Пар и кипение<small>fx/steam + fx-fizz</small></figcaption></figure>
    <figure>${svg('equipment/evaporating-dish.svg', { cls: 'fx-crystals', style: '--level:0;--crystals:1;width:160px;height:auto', label: '' })}<figcaption>Кристаллы<small>fx-crystals, --crystals</small></figcaption></figure>
  </div>
  <h3>Смена цвета индикатора по pH</h3>
  <div class="pv-box pv-box--tile pv-phdemo">
    <div id="ph-beaker">${svg('equipment/beaker.svg', { style: '--level:.6;--liquid-color:#8CC63F', label: 'Стакан с индикатором' })}</div>
    <div>
      <label for="ph" class="hl-title">pH <output id="ph-out" class="hl-num">7</output> · <span id="ph-word">нейтральная</span></label>
      <input id="ph" type="range" min="1" max="14" step="0.1" value="7">
      <div class="pv-ph" style="height:20px"></div>
      <p class="pv-note">Цвет плавно перетекает за 1,6 с (<code>--motion-duration-effect</code>). Число и слово меняются сразу.</p>
    </div>
  </div>
</section>

<section id="mockups">
  <h2>Макеты</h2>
  <p class="lead">Живые страницы из <code>design/mockups/</code>. Размер окна можно переключить: компьютер, планшет альбомно, планшет портретно.</p>
  <div class="pv-mk-tabs" role="tablist" aria-label="Экран">
    ${mockups.map(([id, t], i) => `<button class="hl-tab" role="tab" aria-selected="${i === 0}" data-mk="${id}">${t}</button>`).join('')}
  </div>
  <div class="pv-mk-tabs"><div class="hl-tabs" role="tablist" aria-label="Размер">
    <button class="hl-tab" role="tab" aria-selected="true" data-size="1440x900">1440 × 900</button>
    <button class="hl-tab" role="tab" aria-selected="false" data-size="1024x768">1024 × 768</button>
    <button class="hl-tab" role="tab" aria-selected="false" data-size="768x1024">768 × 1024</button>
  </div></div>
  <div class="pv-mk-frame" id="mk-frame"></div>
  ${mockups.map(([id]) => `<template id="mk-${id}"><iframe title="${id}" srcdoc="${inlineMockup(id)}"></iframe></template>`).join('\n')}
</section>
</main>
<script>
(() => {
  const stops = ${JSON.stringify(phStops)};
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => 'rgb(' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t)).join(',') + ')';
  const input = document.getElementById('ph'), out = document.getElementById('ph-out'), word = document.getElementById('ph-word');
  const beaker = document.querySelector('#ph-beaker svg');
  const upd = () => {
    const v = +input.value, i = Math.min(12, Math.floor(v - 1)), t = v - 1 - i;
    beaker.style.setProperty('--liquid-color', mix(stops[i], stops[i + 1], t));
    out.textContent = v.toFixed(1).replace('.', ',');
    word.textContent = v < 6.5 ? 'кислая' : v <= 7.5 ? 'нейтральная' : 'щелочная';
  };
  input.addEventListener('input', upd); upd();

  const frame = document.getElementById('mk-frame');
  let mk = '${mockups[0][0]}', size = '1440x900';
  const render = () => {
    const [w, h] = size.split('x').map(Number);
    frame.innerHTML = document.getElementById('mk-' + mk).innerHTML;
    const f = frame.querySelector('iframe');
    f.addEventListener('load', () => {
      const st = f.contentDocument.createElement('style');
      st.textContent = document.getElementById('pv-base').textContent;
      f.contentDocument.head.prepend(st);
    }, { once: true });
    const scale = Math.min(1, frame.clientWidth / w);
    f.style.width = w + 'px'; f.style.height = h + 'px'; f.style.transform = 'scale(' + scale + ')';
    frame.style.height = Math.round(h * scale) + 'px';
  };
  document.querySelectorAll('[data-mk]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-mk]').forEach((x) => x.setAttribute('aria-selected', x === b)); mk = b.dataset.mk; render();
  }));
  document.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('[data-size]').forEach((x) => x.setAttribute('aria-selected', x === b)); size = b.dataset.size; render();
  }));
  addEventListener('resize', render); render();
})();
</script>
</body>
</html>
`;
mkdirSync(join(D, 'preview'), { recursive: true });
writeFileSync(join(D, 'preview/index.html'), html);
console.log('preview: ' + Math.round(html.length / 1024) + ' КБ');
