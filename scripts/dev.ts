/** npm run dev — сборка с наблюдением и локальный сервер http://localhost:5173 (контент пересобирается при правке YAML). */
import { watch, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { context } from 'esbuild';
import { ROOT } from './content/compile.ts';
import { buildContent } from './content/build.ts';
import { copyStatic, esbuildOptions, indexHtml } from './build.ts';

const o = { outdir: join(ROOT, 'dist-dev'), base: './', channel: 'dev', fxInstant: false, minify: false };
mkdirSync(o.outdir, { recursive: true });
buildContent();
writeFileSync(join(o.outdir, 'index.html'), indexHtml(o, 'assets/app.js', 'assets/styles.css'));
copyStatic(o.outdir);
const ctx = await context(esbuildOptions(o));
await ctx.watch();
const { port } = await ctx.serve({ servedir: o.outdir, port: 5173 });
let timer: NodeJS.Timeout | undefined;
watch(join(ROOT, 'content'), { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (buildContent()) console.log('контент пересобран');
  }, 150);
});
console.log(`Хим лаба: http://localhost:${port}/`);
