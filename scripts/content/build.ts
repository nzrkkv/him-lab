/** npm run content:build — пишет src/generated/content.ru.json. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, compileContent } from './compile.ts';

export function buildContent(): boolean {
  const { bundle, issues } = compileContent('ru');
  for (const i of issues.filter((x) => x.level === 'error')) console.error(`ОШИБКА  ${i.where}: ${i.message}`);
  if (!bundle) return false;
  mkdirSync(join(ROOT, 'src', 'generated'), { recursive: true });
  writeFileSync(join(ROOT, 'src', 'generated', 'content.ru.json'), JSON.stringify(bundle));
  return !issues.some((x) => x.level === 'error');
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  if (!buildContent()) process.exitCode = 1;
  else console.log('src/generated/content.ru.json готов');
}
