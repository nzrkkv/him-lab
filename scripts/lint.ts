/**
 * npm run lint (часть 1) — правила проекта, которых нет в tsc и Prettier:
 *  1. Нет пользовательских текстов на кириллице в src/ (кроме тестов и текстов ошибок для разработчика) — NFR-030.
 *  2. Ядро src/core/ чистое: нет Date, Math.random, window, document, хранилищ и таймеров — NFR-070.
 *  3. Границы слоёв: core → core; platform → core; fx → core, platform; ui → core, fx, platform; app → всё — NFR-061.
 *  4. Предупреждение о файлах длиннее 400 строк — NFR-062.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import ts from 'typescript';

const ROOT = join(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
const errors: string[] = [];
const warnings: string[] = [];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? (f === 'generated' ? [] : walk(p)) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

const LAYERS = ['core', 'platform', 'fx', 'ui', 'app'] as const;
type Layer = (typeof LAYERS)[number];
const ALLOWED: Record<Layer, Layer[]> = {
  core: ['core'],
  platform: ['core', 'platform'],
  fx: ['core', 'platform', 'fx'],
  ui: ['core', 'platform', 'fx', 'ui'],
  app: ['core', 'platform', 'fx', 'ui', 'app'],
};
const BANNED_IN_CORE = new Set([
  'Date',
  'window',
  'document',
  'localStorage',
  'sessionStorage',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'fetch',
  'navigator',
]);
const CYRILLIC = /[А-Яа-яЁё]/;

const layerOf = (file: string): Layer | null => {
  const top = relative(SRC, file).split(/[/\\]/)[0];
  return (LAYERS as readonly string[]).includes(top ?? '') ? (top as Layer) : null;
};

for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');
  const isTest = /\.test\.ts$|test-helpers\.ts$/.test(file);
  // Сообщения схемы адресованы авторам контента при сборке, а не детям.
  const devTexts = rel.endsWith('content-model/schema.ts');
  const lines = text.split('\n').length;
  if (lines > 400) warnings.push(`${rel}: ${lines} строк (ориентир ≤ 400)`);
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const layer = layerOf(file);
  const at = (n: ts.Node): string => `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;

  const visit = (n: ts.Node): void => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) {
      const spec = n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier) ? n.moduleSpecifier.text : null;
      const typeOnly = ts.isImportDeclaration(n) ? n.importClause?.isTypeOnly : n.isTypeOnly;
      if (spec && layer && !isTest) {
        if (spec.startsWith('.')) {
          const target = layerOf(resolve(dirname(file), spec));
          const inGenerated = resolve(dirname(file), spec).startsWith(join(SRC, 'generated'));
          if (target && !ALLOWED[layer].includes(target))
            errors.push(`${at(n)}: слой ${layer} не может импортировать ${target} (${spec})`);
          if (!target && !inGenerated) errors.push(`${at(n)}: импорт вне src/ (${spec})`);
        } else if (
          layer === 'core' &&
          !typeOnly &&
          !(spec === 'zod' && rel.endsWith('content-model/schema.ts'))
        ) {
          errors.push(`${at(n)}: ядро не зависит от пакетов (${spec})`);
        }
      }
    }
    if (
      !isTest &&
      (ts.isStringLiteral(n) ||
        ts.isNoSubstitutionTemplateLiteral(n) ||
        ts.isTemplateHead(n) ||
        ts.isTemplateMiddle(n) ||
        ts.isTemplateTail(n))
    ) {
      let p: ts.Node | undefined = n.parent;
      let devMessage = false;
      while (p && !ts.isSourceFile(p)) {
        if ((ts.isNewExpression(p) && p.expression.getText() === 'Error') || ts.isThrowStatement(p))
          devMessage = true;
        if (ts.isCallExpression(p) && /^console\./.test(p.expression.getText())) devMessage = true;
        p = p.parent;
      }
      if (!devMessage && !devTexts && CYRILLIC.test(n.text))
        errors.push(`${at(n)}: текст на кириллице в коде — вынесите в content/ui/strings.yaml`);
    }
    if (!isTest && ts.isJsxText(n) && CYRILLIC.test(n.text))
      errors.push(`${at(n)}: текст на кириллице в разметке`);
    if (layer === 'core' && !isTest) {
      if (
        ts.isIdentifier(n) &&
        BANNED_IN_CORE.has(n.text) &&
        !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n) &&
        !ts.isPropertyAssignment(n.parent)
      ) {
        errors.push(`${at(n)}: ${n.text} в ядре запрещён (ядро чистое)`);
      }
      if (ts.isPropertyAccessExpression(n) && n.getText() === 'Math.random')
        errors.push(`${at(n)}: Math.random в ядре запрещён`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

for (const w of warnings) console.log(`предупр. ${w}`);
for (const e of errors) console.log(`ОШИБКА  ${e}`);
console.log(`Линт проекта: ошибок ${errors.length}, предупреждений ${warnings.length}.`);
if (errors.length) process.exitCode = 1;
