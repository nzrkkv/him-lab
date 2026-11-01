// Генерирует design/tokens/tokens.css из design/tokens/tokens.json
// и проверяет контраст ключевых пар цветов (WCAG 2.1).
// Запуск: node design/tools/build-tokens.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(readFileSync(join(root, 'tokens/tokens.json'), 'utf8'));

const flat = new Map(); // 'color.ink.900' -> value
function walk(node, path) {
  if (node && typeof node === 'object' && '$value' in node) {
    flat.set(path.join('.'), node.$value);
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$') || k === 'meta') continue;
    if (v && typeof v === 'object') walk(v, [...path, k]);
  }
}
walk(tokens, []);

const varName = (p) => '--' + p.replace(/\./g, '-');
const resolve = (v) => {
  if (typeof v !== 'string') return v;
  return v.replace(/\{([^}]+)\}/g, (_, ref) => `var(${varName(ref)})`);
};
const resolveRaw = (v, depth = 0) => {
  if (typeof v !== 'string' || depth > 5) return v;
  const m = v.match(/^\{([^}]+)\}$/);
  return m ? resolveRaw(flat.get(m[1]), depth + 1) : v;
};

const px2rem = (v) => (typeof v === 'string' && /^-?\d+(\.\d+)?px$/.test(v) ? `${parseFloat(v) / 16}rem` : v);

const lines = [];
const groups = {};
for (const [path, value] of flat) {
  const top = path.split('.')[0];
  (groups[top] ||= []).push([path, value]);
}

const order = ['color', 'font', 'text', 'space', 'radius', 'border', 'shadow', 'motion', 'z', 'size', 'breakpoint', 'lab'];
for (const g of order) {
  if (!groups[g]) continue;
  lines.push(`\n  /* ${g} */`);
  for (const [path, value] of groups[g]) {
    let v = resolve(value);
    if (path.startsWith('text.') && path.endsWith('.family')) v = `var(--font-family-${value})`;
    if ((path.startsWith('text.') && (path.endsWith('.size') || path.endsWith('.line'))) || path.startsWith('space.')) v = px2rem(v);
    if (path.startsWith('breakpoint.')) {
      lines.push(`  /* ${varName(path)}: ${v}; — только для справки, в @media пишите литерал */`);
      continue;
    }
    lines.push(`  ${varName(path)}: ${v};`);
  }
}

const css = `/* Хим лаба — дизайн-токены. СГЕНЕРИРОВАНО из tokens.json (node design/tools/build-tokens.mjs). Не править руками. */

/* Шрифты: Unbounded (заголовки) и Golos Text (текст), лицензия OFL 1.1.
   В продакшене подключайте с Google Fonts:
   <link rel="preconnect" href="https://fonts.googleapis.com">
   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
   <link href="https://fonts.googleapis.com/css2?family=Golos+Text:wght@400..800&family=Unbounded:wght@500..800&display=swap" rel="stylesheet">
   Либо самостоятельно хостите файлы из design/fonts/ (подмножество кириллица + латиница). Ниже — локальный вариант. */
@font-face {
  font-family: 'Unbounded';
  src: url('../fonts/Unbounded-var.woff') format('woff');
  font-weight: 500 800;
  font-display: swap;
}
@font-face {
  font-family: 'Golos Text';
  src: url('../fonts/GolosText-var.woff') format('woff');
  font-weight: 400 900;
  font-display: swap;
}

:root {${lines.join('\n')}

  /* производные */
  --focus-ring: 0 0 0 3px var(--color-semantic-focus-halo), 0 0 0 6px var(--color-semantic-focus);
  --liquid-color: var(--color-substance-water);
}

/* Сниженное движение: длительности эффектов сжимаются, но события остаются видимыми.
   Компоненты дополнительно отключают частицы и колебания (см. 05-effects.md). */
@media (prefers-reduced-motion: reduce) {
  :root {
    --motion-duration-fast: 1ms;
    --motion-duration-base: 1ms;
    --motion-duration-slow: 120ms;
    --motion-duration-pour: 200ms;
    --motion-duration-effect: 400ms;
    --motion-duration-effect-long: 600ms;
    --motion-easing-pop: var(--motion-easing-standard);
  }
}
`;
writeFileSync(join(root, 'tokens/tokens.css'), css);
console.log('tokens.css: ' + flat.size + ' токенов');

// ---- проверка контраста ----
function lum(hex) {
  const n = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
const get = (p) => resolveRaw(flat.get(p));
const pairs = [
  ['color.ink.900', 'color.paper', 4.5],
  ['color.ink.900', 'color.tile.100', 4.5],
  ['color.ink.700', 'color.paper', 4.5],
  ['color.ink.700', 'color.tile.100', 4.5],
  ['color.ink.500', 'color.paper', 4.5],
  ['color.ink.500', 'color.tile.100', 4.5],
  ['color.ink.500', 'color.tile.50', 4.5],
  ['color.paper', 'color.copper.600', 4.5],
  ['color.paper', 'color.copper.700', 4.5],
  ['color.copper.600', 'color.paper', 4.5],
  ['color.copper.700', 'color.copper.50', 4.5],
  ['color.paper', 'color.deep.600', 4.5],
  ['color.deep.800', 'color.deep.50', 4.5],
  ['color.deep.600', 'color.paper', 4.5],
  ['color.paper', 'color.grape.600', 4.5],
  ['color.grape.800', 'color.grape.50', 4.5],
  ['color.lamp.800', 'color.lamp.100', 4.5],
  ['color.ink.900', 'color.lamp.400', 4.5],
  ['color.feedback.success.600', 'color.paper', 4.5],
  ['color.feedback.success.600', 'color.feedback.success.100', 4.5],
  ['color.feedback.caution.700', 'color.paper', 4.5],
  ['color.feedback.caution.700', 'color.feedback.caution.100', 4.5],
  ['color.feedback.neutral.600', 'color.feedback.neutral.100', 4.5],
  ['color.wood.700', 'color.wood.200', 4.5],
  ['color.ink.900', 'color.wood.200', 4.5],
  ['color.ink.900', 'color.bench.top', 4.5],
  ['color.feedback.caution.500', 'color.paper', 3],
  ['color.ink.300', 'color.paper', 1.5],
  ['color.ink.900', 'color.oksi.body', 3],
  ['color.lamp.400', 'color.paper', 1.5],
];
let fail = 0;
const report = [];
for (const [fg, bg, min] of pairs) {
  const r = ratio(get(fg), get(bg));
  const ok = r >= min;
  if (!ok) fail++;
  report.push(`${ok ? 'OK  ' : 'FAIL'} ${r.toFixed(2).padStart(5)} (мин ${min})  ${fg} на ${bg}`);
}
console.log(report.join('\n'));
writeFileSync(join(root, 'tokens/contrast-report.txt'), report.join('\n') + '\n');
if (fail) process.exitCode = 1;
