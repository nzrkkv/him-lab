/** Глобальные константы сборки и импорт SVG как текста (esbuild loader: text). */
declare const __CHANNEL__: string;
declare const __FX_INSTANT__: boolean;
declare module '*.svg' {
  const svg: string;
  export default svg;
}
