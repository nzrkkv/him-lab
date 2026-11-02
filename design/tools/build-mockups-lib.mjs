// Встраивание SVG-ассетов инлайном (чтобы CSS-переменные --level, --liquid-color… доходили до слоёв).
// Тот же приём нужен во фронтенде: <img src="beaker.svg"> не пропускает CSS-переменные внутрь.
// id внутри SVG получают уникальный суффикс, чтобы clipPath не конфликтовали на странице.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESIGN = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(DESIGN, 'assets');
const SRC = join(DESIGN, 'mockups', 'src');
const OUT = join(DESIGN, 'mockups');

let counter = 0;
const attr = (s, name) => (s.match(new RegExp(`\\b${name}="([^"]*)"`)) || [])[1];

export function inlineSvg(src, attrs = '') {
  const file = join(ASSETS, src);
  if (!existsSync(file)) throw new Error('Нет ассета: ' + src);
  let svg = readFileSync(file, 'utf8').trim();
  const uid = 'u' + (++counter).toString(36);
  svg = svg.replace(/\bid="([^"]+)"/g, (_, id) => `id="${id}-${uid}"`).replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${id}-${uid})`);
  const cls = attr(attrs, 'class');
  const style = attr(attrs, 'style');
  const label = attr(attrs, 'label');
  svg = svg.replace(/<svg([^>]*)>/, (m, a) => {
    let out = a;
    if (cls) out = out.replace(/class="([^"]*)"/, (_, c) => `class="${c} ${cls}"`);
    if (style) out = /style="/.test(out) ? out.replace(/style="([^"]*)"/, (_, s) => `style="${s};${style}"`) : out + ` style="${style}"`;
    if (label === '') out = out.replace(/role="img" aria-label="[^"]*"/, 'aria-hidden="true" focusable="false"');
    else if (label) out = out.replace(/aria-label="[^"]*"/, `aria-label="${label}"`);
    out = out.replace(/\swidth="[\d.]+"\sheight="[\d.]+"/, '');
    return `<svg${out}>`;
  });
  if (label === '') svg = svg.replace(/<title>[^<]*<\/title>\n?/, '');
  return svg.replace(/\n/g, '');
}

export function inlineIcon(name, extraClass = '') {
  const file = join(ASSETS, 'icons', name + '.svg');
  if (!existsSync(file)) throw new Error('Нет иконки: ' + name);
  return readFileSync(file, 'utf8')
    .trim()
    .replace(/<title>[^<]*<\/title>\n?/, '')
    .replace(/\swidth="32" height="32"/, '')
    .replace('class="hl-icon"', `class="hl-icon${extraClass ? ' ' + extraClass : ''}" focusable="false"`)
    .replace(/\n/g, '');
}

export function render(html) {
  return html
    .replace(/<hl-svg\s+([^>]*?)><\/hl-svg>/g, (_, a) => inlineSvg(attr(a, 'src'), a))
    .replace(/<hl-icon\s+([^>]*?)><\/hl-icon>/g, (_, a) => inlineIcon(attr(a, 'name'), attr(a, 'class') || ''));
}

