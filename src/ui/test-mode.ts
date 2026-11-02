/**
 * Тестовый режим для автора: в песочнице открыто всё, прогресс ребёнка не меняется.
 * Включение — параметром адреса ?all=1 (до # или внутри: #/lab?all=1), выключение — ?all=0
 * или кнопкой на плашке. Ссылок на режим в интерфейсе нет.
 */
import { readKey, removeKey, writeKey } from '../platform/storage.ts';

const KEY = 'test-mode';

export function testMode(): boolean {
  return readKey(KEY) === '1';
}

export function setTestMode(on: boolean): void {
  if (on) writeKey(KEY, '1');
  else removeKey(KEY);
}

/** Прочитать ?all=1 / ?all=0 из адреса, запомнить и убрать параметр из адреса. Вернёт true, если режим менялся. */
export function applyTestModeParam(): boolean {
  const url = new URL(window.location.href);
  const [path = '', query] = url.hash.split('?');
  const hashParams = new URLSearchParams(query ?? '');
  const value = hashParams.get('all') ?? url.searchParams.get('all');
  if (value !== '1' && value !== '0') return false;
  const before = testMode();
  setTestMode(value === '1');
  url.searchParams.delete('all');
  hashParams.delete('all');
  const rest = hashParams.toString();
  url.hash = rest ? `${path}?${rest}` : path;
  window.history.replaceState(null, '', url.toString());
  return before !== testMode();
}
