/** Подстановка параметров в строку: «Банка {jar}» → «Банка А». */
export function format(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in params ? String(params[key]) : m));
}
