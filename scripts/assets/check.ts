/**
 * npm run assets:check — контракт дизайна → фронтенд (docs/spec/03-architecture.md, раздел 10; design/assets/README.md):
 * файлы манифеста существуют, у сосудов есть все слои и якоря, нет запрещённых элементов, классы эффектов на месте.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const A = join(ROOT, 'design', 'assets');
const errors: string[] = [];

const manifest = JSON.parse(readFileSync(join(A, 'manifest.json'), 'utf8')) as Record<string, unknown>;
const files: string[] = [];
for (const [kind, list] of Object.entries(manifest)) {
  if (Array.isArray(list)) for (const name of list) files.push(`${kind}/${String(name)}.svg`);
}
const VESSELS = ['beaker', 'test-tube', 'flask', 'graduated-cylinder', 'evaporating-dish'];
const VESSEL_LAYERS = [
  'glass-back',
  'contents',
  'liquid',
  'liquid-body',
  'turbidity',
  'liquid-surface',
  'foam',
  'sediment',
  'powder',
  'bubbles',
  'glass',
  'marks',
  'shine',
];
const VESSEL_ATTRS = ['data-fill-top', 'data-fill-bottom', 'data-mouth', 'data-base'];
const VESSEL_VARS = [
  '--level',
  '--liquid-color',
  '--turbidity',
  '--foam',
  '--sediment',
  '--powder',
  '--bubbles',
];

for (const f of files) {
  const p = join(A, f);
  if (!existsSync(p)) {
    errors.push(`нет файла ${f} из manifest.json`);
    continue;
  }
  const svg = readFileSync(p, 'utf8');
  if (!svg.trimStart().startsWith('<svg')) errors.push(`${f}: файл не начинается с <svg`);
  if (/<image|href="http|<script|<foreignObject/i.test(svg))
    errors.push(`${f}: запрещённый элемент или внешняя ссылка`);
  const name = f.split('/')[1]?.replace('.svg', '') ?? '';
  if (f.startsWith('equipment/') && VESSELS.includes(name)) {
    for (const l of VESSEL_LAYERS) if (!svg.includes(`data-layer="${l}"`)) errors.push(`${f}: нет слоя ${l}`);
    for (const a of VESSEL_ATTRS) if (!svg.includes(`${a}="`)) errors.push(`${f}: нет атрибута ${a}`);
    for (const v of VESSEL_VARS) if (!svg.includes(`var(${v}`)) errors.push(`${f}: нет переменной ${v}`);
  }
}
for (const icon of [
  'heat',
  'stir',
  'wait',
  'smell',
  'magnify',
  'temperature',
  'ph',
  'hint',
  'journal',
  'check',
  'home',
  'lab-only',
  'caution',
]) {
  if (!readFileSync(join(A, 'icons', 'sprite.svg'), 'utf8').includes(`id="i-${icon}"`))
    errors.push(`sprite.svg: нет символа i-${icon}`);
}
for (const font of ['GolosText-var.woff', 'Unbounded-var.woff'])
  if (!existsSync(join(ROOT, 'design', 'fonts', font))) errors.push(`нет шрифта ${font}`);

for (const e of errors) console.log(`ОШИБКА  ${e}`);
console.log(`Контракт ассетов: файлов ${files.length}, ошибок ${errors.length}.`);
if (errors.length) process.exitCode = 1;
