/** Индекс скомпилированного контента для быстрого поиска (классы → частицы, правила по приоритету). */
import type {
  ContentBundle,
  EffectDef,
  Equipment,
  NoReaction,
  Rule,
  Species,
  Substance,
} from '../content-model/types.ts';

export interface ContentIndex {
  bundle: ContentBundle;
  species: Map<string, Species>;
  substances: Map<string, Substance>;
  equipment: Map<string, Equipment>;
  /** Частицы каждого класса с учётом составных классов. */
  classMembers: Map<string, Set<string>>;
  /** Правила без стоп-правил, отсортированы: приоритет ↓, id ↑. */
  rules: Rule[];
  hazards: Rule[];
  noReactions: NoReaction[];
  effects: EffectDef[];
  /** Правила со стадией (holdS) — для учёта времени. */
  holdRules: Rule[];
}

export function buildIndex(bundle: ContentBundle): ContentIndex {
  const species = new Map(bundle.species.map((s) => [s.id, s]));
  const classMembers = new Map<string, Set<string>>();
  for (const c of bundle.classes) classMembers.set(c.id, new Set());
  for (const s of bundle.species) for (const c of s.classes) classMembers.get(c)?.add(s.id);
  // Составные классы: несколько проходов, пока не стабилизируется.
  for (let pass = 0; pass < bundle.classes.length; pass++) {
    let changed = false;
    for (const c of bundle.classes) {
      const own = classMembers.get(c.id);
      if (!own) continue;
      for (const inc of c.includes) {
        for (const sp of classMembers.get(inc) ?? []) {
          if (!own.has(sp)) {
            own.add(sp);
            changed = true;
          }
        }
      }
    }
    if (!changed) break;
  }
  const byPriority = (a: { priority: number; id: string }, b: { priority: number; id: string }): number =>
    b.priority - a.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const rules = bundle.rules.filter((r) => r.kind !== 'hazard_stop').sort(byPriority);
  return {
    bundle,
    species,
    substances: new Map(bundle.substances.map((s) => [s.id, s])),
    equipment: new Map(bundle.equipment.map((e) => [e.id, e])),
    classMembers,
    rules,
    hazards: bundle.rules.filter((r) => r.kind === 'hazard_stop').sort(byPriority),
    noReactions: [...bundle.noReactions].sort(byPriority),
    effects: bundle.effects,
    holdRules: rules.filter((r) => r.when.holdS !== undefined),
  };
}

export function speciesHasClass(ix: ContentIndex, speciesId: string, classId: string): boolean {
  return ix.classMembers.get(classId)?.has(speciesId) ?? false;
}
