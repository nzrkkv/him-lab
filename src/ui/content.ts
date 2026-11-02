/** Скомпилированный контент (src/generated/content.ru.json) и строки интерфейса. */
import bundleJson from '../generated/content.ru.json';
import type { ContentBundle } from '../core/content-model/types.ts';
import { buildIndex } from '../core/engine/content-index.ts';
import { format } from '../core/i18n/format.ts';

export const bundle = bundleJson as unknown as ContentBundle;
export const ix = buildIndex(bundle);

/** Строка интерфейса по ключу с подстановками {name}. Неизвестный ключ виден сразу. */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const s = bundle.strings[key];
  return s === undefined ? `[${key}]` : format(s, params);
}

/** «1 порция», «2 порции», «5 порций». */
export function plural(count: number, base: 'unit.portion' | 'unit.drop'): string {
  const form = new Intl.PluralRules('ru').select(count);
  const key = form === 'one' ? 'one' : form === 'few' ? 'few' : 'many';
  return `${count} ${t(`${base}.${key}`)}`;
}
