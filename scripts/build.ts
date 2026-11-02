/**
 * npm run build — сборка сайта в dist/: контент → esbuild (JS, CSS, шрифты) → index.html с CSP.
 * Переменные окружения: BASE_PATH (например, /him-lab/ на GitHub Pages; по умолчанию — относительные пути),
 * CHANNEL (prod | dev | test) — префикс хранилища прогресса, FX_INSTANT=1 — эффекты сразу в итоговом состоянии (для e2e).
 */
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { build, type BuildOptions, type Metafile } from 'esbuild';
import { ROOT } from './content/compile.ts';
import { buildContent } from './content/build.ts';

export interface SiteOptions {
  outdir: string;
  base: string;
  channel: string;
  fxInstant: boolean;
  minify: boolean;
}

export function esbuildOptions(o: SiteOptions): BuildOptions {
  return {
    entryPoints: { app: join(ROOT, 'src/app/main.ts'), styles: join(ROOT, 'src/styles/app.css') },
    bundle: true,
    format: 'esm',
    target: ['es2022', 'safari16.4'],
    outdir: join(o.outdir, 'assets'),
    entryNames: o.minify ? '[name]-[hash]' : '[name]',
    assetNames: '[name]-[hash]',
    minify: o.minify,
    sourcemap: o.minify ? 'linked' : 'inline',
    metafile: true,
    legalComments: 'none',
    loader: { '.svg': 'text', '.woff': 'file', '.woff2': 'file' },
    define: {
      __CHANNEL__: JSON.stringify(o.channel),
      __FX_INSTANT__: JSON.stringify(o.fxInstant),
    },
    logLevel: 'warning',
  };
}

export function indexHtml(o: SiteOptions, js: string, css: string): string {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="description" content="Хим лаба — виртуальная химическая лаборатория для детей 9–12 лет: опыты без реактивов, с понятными объяснениями.">
<meta name="referrer" content="no-referrer">
<title>Хим лаба</title>
<link rel="icon" href="${o.base}favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${o.base}${css}">
<script type="module" src="${o.base}${js}"></script>
</head>
<body>
<div id="app"></div>
<noscript>Для Хим лабы нужен JavaScript.</noscript>
</body>
</html>
`;
}

export function copyStatic(outdir: string): void {
  mkdirSync(join(outdir, 'assets', 'icons'), { recursive: true });
  copyFileSync(join(ROOT, 'design/assets/icons/sprite.svg'), join(outdir, 'assets/icons/sprite.svg'));
  copyFileSync(join(ROOT, 'design/assets/brand/logo-mark.svg'), join(outdir, 'favicon.svg'));
  writeFileSync(join(outdir, '.nojekyll'), '');
}

export function outputFile(meta: Metafile, outdir: string, entry: string): string {
  const out = Object.entries(meta.outputs).find(([, v]) => v.entryPoint?.endsWith(entry))?.[0];
  if (!out) throw new Error(`нет выходного файла для ${entry}`);
  return relative(outdir, join(ROOT, out)).split('\\').join('/');
}

async function main(): Promise<void> {
  const o: SiteOptions = {
    outdir: join(ROOT, 'dist'),
    base: process.env['BASE_PATH'] ?? './',
    channel: process.env['CHANNEL'] ?? 'prod',
    fxInstant: process.env['FX_INSTANT'] === '1',
    minify: true,
  };
  if (!buildContent()) {
    process.exitCode = 1;
    return;
  }
  rmSync(o.outdir, { recursive: true, force: true });
  const result = await build(esbuildOptions(o));
  const meta = result.metafile as Metafile;
  const js = outputFile(meta, o.outdir, 'src/app/main.ts');
  const css = outputFile(meta, o.outdir, 'src/styles/app.css');
  writeFileSync(join(o.outdir, 'index.html'), indexHtml(o, js, css));
  copyStatic(o.outdir);
  const sizes = Object.entries(meta.outputs)
    .filter(([f]) => !f.endsWith('.map'))
    .map(([f, v]) => `${relative(ROOT, f)} ${(v.bytes / 1024).toFixed(1)} КБ`);
  console.log(`dist/ готов (канал ${o.channel}, base ${o.base})\n${sizes.join('\n')}`);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) await main();
