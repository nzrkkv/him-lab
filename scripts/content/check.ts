/** npm run content:check — проверка контента с отчётом. Код выхода 1 при ошибках. */
import { appendFileSync } from 'node:fs';
import { compileContent } from './compile.ts';

const { bundle, issues } = compileContent('ru');
const errors = issues.filter((i) => i.level === 'error');
const warnings = issues.filter((i) => i.level === 'warning');
const lines = [
  ...errors.map((i) => `ОШИБКА  ${i.where}: ${i.message}`),
  ...warnings.map((i) => `предупр. ${i.where}: ${i.message}`),
];
if (bundle) {
  lines.push(
    `Контент: частиц ${bundle.species.length}, веществ ${bundle.substances.length}, правил ${bundle.rules.length}, ` +
      `объяснений «ничего» ${bundle.noReactions.length}, миссий ${bundle.missions.length}, строк ${Object.keys(bundle.strings).length}.`,
  );
}
lines.push(`Итог: ошибок ${errors.length}, предупреждений ${warnings.length}.`);
console.log(lines.join('\n'));
if (process.env['GITHUB_STEP_SUMMARY']) {
  appendFileSync(process.env['GITHUB_STEP_SUMMARY'], `### Проверка контента\n\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n`);
}
if (errors.length > 0) process.exitCode = 1;
