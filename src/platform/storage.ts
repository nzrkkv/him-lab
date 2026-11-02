/**
 * Хранилище прогресса: localStorage с префиксом канала (himlab:<канал>:), отложенной записью
 * и запасным хранилищем в памяти, если localStorage недоступен (docs/spec/03-architecture.md, раздел 3.9).
 */
const CHANNEL = typeof __CHANNEL__ !== 'undefined' ? __CHANNEL__ : 'dev';
const PREFIX = `himlab:${CHANNEL}:`;
const memory = new Map<string, string>();

function ls(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = `${PREFIX}probe`;
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

const store = ls();
export const storageAvailable = store !== null;

export function readKey(key: string): string | null {
  return store ? store.getItem(PREFIX + key) : (memory.get(key) ?? null);
}

export function writeKey(key: string, value: string): void {
  try {
    if (store) store.setItem(PREFIX + key, value);
    else memory.set(key, value);
  } catch {
    memory.set(key, value);
  }
}

export function removeKey(key: string): void {
  if (store) store.removeItem(PREFIX + key);
  memory.delete(key);
}

/** Отложенная запись: не чаще раза в 500 мс и сразу при уходе со страницы. */
export function debouncedWriter(key: string, serialize: () => string): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    writeKey(key, serialize());
  };
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 500);
  };
}
