/** Публичный API движка реакций. */
export { buildIndex, type ContentIndex } from './content-index.ts';
export { createLab, step, doseAmount } from './step.ts';
export { deriveVisual, type VesselVisual } from './visual.ts';
export { computePh, phWord } from './ph.ts';
export { grams, liquidMl, totalGrams } from './vessel.ts';
export type * from './types.ts';
