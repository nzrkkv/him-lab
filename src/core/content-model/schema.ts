/**
 * Схемы контента (Zod). Одна фабрика описывает и исходный YAML (тексты — `{ ru, en? }`),
 * и скомпилированный пакет (тексты уже строки одного языка). Типы выводятся из схем.
 * Описание полей — docs/spec/04-engine-and-content.md.
 */
import { z } from 'zod';

export const LocalizedTextSchema = z
  .object({ ru: z.string().min(1), en: z.string().min(1).optional() })
  .strict();

import {
  ACTION_TYPES,
  MAGNIFIER_VIEWS,
  OBSERVATION_DETAILS,
  OBSERVATION_KINDS,
  PHASES,
} from './constants.ts';

export { ACTION_TYPES, MAGNIFIER_VIEWS, OBSERVATION_DETAILS, OBSERVATION_KINDS, PHASES };

const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'id: только a-z, 0-9 и _');
const TokenRef = z.string().regex(/^color\.[a-z0-9.-]+$/, 'ссылка на токен цвета: color.…');
const Phase = z.enum(PHASES);
const Intensity = z.enum(['weak', 'medium', 'strong']);
const ActionType = z.enum(ACTION_TYPES);

const ReviewSchema = z
  .object({
    status: z.enum(['draft', 'self_checked', 'chemist_approved']),
    notes: z.string().optional(),
  })
  .strict();

export function makeSchemas<T extends z.ZodTypeAny>(Text: T) {
  const ClassDef = z
    .object({ id: Id, includes: z.array(Id).default([]), note: z.string().optional() })
    .strict();

  const AcidBase = z.discriminatedUnion('role', [
    z.object({ role: z.literal('weak_acid'), pKa: z.number() }).strict(),
    z.object({ role: z.literal('amphiprotic'), pKa1: z.number(), pKa2: z.number() }).strict(),
    z.object({ role: z.literal('weak_base'), pKb: z.number() }).strict(),
    z.object({ role: z.literal('strong_base'), equivalents: z.number().positive() }).strict(),
    z.object({ role: z.literal('conjugate_base'), of: Id, perMol: z.number().positive() }).strict(),
  ]);

  const Species = z
    .object({
      id: Id,
      formula: z.string().min(1),
      molarMass: z.number().positive().nullable(),
      classes: z.array(Id),
      stateAt20C: z.enum(['solid', 'liquid', 'gas']),
      density: z.number().positive().optional(),
      names: z.object({ scientific: Text }).strict(),
      solubility: z
        .object({
          table: z.array(z.tuple([z.number(), z.number().nonnegative()])).min(1),
          stirsToDissolve: z.number().int().min(1),
          noStirFractionPerMin: z.number().min(0).max(1),
        })
        .strict()
        .optional(),
      insoluble: z
        .object({
          form: z.enum(['suspension', 'sediment']),
          settleTimeS: z.number().positive(),
          turbidity: z.number().positive(),
        })
        .strict()
        .optional(),
      color: z
        .object({
          powder: TokenRef.optional(),
          solution: TokenRef.optional(),
          tint: z.number().nonnegative().optional(),
        })
        .strict()
        .default({}),
      magnifierView: z.enum(MAGNIFIER_VIEWS).optional(),
      odor: z.object({ kind: Id, text: Text }).strict().optional(),
      specificHeat: z.number().positive().default(1),
      acidBase: AcidBase.optional(),
      indicator: z
        .object({
          colors: z.array(z.object({ phMax: z.number(), color: TokenRef, name: Text }).strict()).min(2),
        })
        .strict()
        .optional(),
      hazard: z.enum(['none', 'low', 'caution', 'high']),
      discoverable: z.object({ name: Text, text: Text }).strict().optional(),
      sources: z.array(Id),
      review: ReviewSchema,
    })
    .strict();

  const Substance = z
    .object({
      id: Id,
      name: Text,
      shortName: Text,
      scientificName: Text,
      availability: z.enum(['home', 'lab_only']),
      safeForHome: z.boolean(),
      container: z.enum(['jar', 'bottle', 'bag']),
      lidColor: TokenRef,
      form: z.enum(['powder', 'crystals', 'liquid', 'solution']),
      composition: z
        .array(z.object({ species: Id, phase: Phase, massFraction: z.number().positive() }).strict())
        .min(1),
      density: z.number().positive().optional(),
      dosing: z.enum(['portion_solid', 'portion_liquid', 'drop']),
      group: z.enum(['liquids', 'powders']),
      card: z
        .object({
          looks: Text,
          properties: z.array(Text),
          foundAt: Text,
          warning: Text.optional(),
          adult: Text,
        })
        .strict(),
      sources: z.array(Id),
      review: ReviewSchema,
    })
    .strict();

  const Equipment = z
    .object({
      id: Id,
      asset: z.string().regex(/^[a-z]+\/[a-z0-9-]+$/),
      name: Text,
      kind: z.enum(['vessel', 'tool', 'station', 'fixture']),
      capacityMl: z.number().positive().optional(),
      heatCapacityJPerK: z.number().positive().optional(),
      needsHolderForHeat: z.boolean().default(false),
      tip: Text.optional(),
    })
    .strict();

  const Physics = z
    .object({
      ambientC: z.number(),
      burnerPowerW: z.number().positive(),
      heatTimeScale: z.number().positive(),
      heatAutoStopS: z.number().positive(),
      dryMaxC: z.number(),
      iceBathC: z.number(),
      coolingPerS: z.number().positive(),
      iceCoolingPerS: z.number().positive(),
      waitStepS: z.number().positive(),
      tickS: z.number().positive(),
      aqueousMinWaterG: z.number().positive(),
      latentHeatWaterJPerG: z.number().positive(),
      gasMlPerMol: z.number().positive(),
    })
    .strict();

  const Dosing = z
    .object({
      portion_solid_g: z.number().positive(),
      portion_liquid_ml: z.number().positive(),
      drop_ml: z.number().positive(),
    })
    .strict();

  const Match = z
    .object({ species: Id.optional(), class: Id.optional(), notClass: z.array(Id).optional() })
    .strict();
  const Reactant = z
    .object({
      bind: z.string().min(1),
      match: Match,
      phases: z.array(Phase).optional(),
      minGrams: z.number().optional(),
    })
    .strict();
  const Condition = z
    .object({
      trigger: z.array(ActionType).optional(),
      reactants: z.array(Reactant).default([]),
      absent: z.array(Match).optional(),
      medium: z.enum(['aqueous', 'dry', 'any']).default('any'),
      temperature: z.object({ minC: z.number().optional(), maxC: z.number().optional() }).strict().optional(),
      holdS: z.number().positive().optional(),
      heating: z.boolean().optional(),
    })
    .strict();

  const ObserveSpec = z
    .object({
      kind: z.enum(OBSERVATION_KINDS),
      detail: z.enum(OBSERVATION_DETAILS).optional(),
      intensity: z.enum(['weak', 'medium', 'strong', 'from_variant']).default('medium'),
    })
    .strict();

  const RuleText = z.object({ what: Text, why: Text, deeper: Text.optional(), adult: Text }).strict();

  const Variant = z
    .object({
      id: Id,
      bind: z.record(z.string(), Id),
      reactants: z.array(z.object({ bind: z.string(), coeff: z.number().positive() }).strict()).min(1),
      products: z
        .array(
          z
            .object({ species: Id, coeff: z.number().positive(), phase: z.union([Phase, z.literal('gas')]) })
            .strict(),
        )
        .min(1),
      kinetics: z
        .object({ mode: z.enum(['instant', 'over_time']), durationS: z.number().positive().optional() })
        .strict()
        .default({ mode: 'instant' }),
      intensity: Intensity.default('medium'),
      heatJPerMol: z.number().default(0),
      foamMlPerMlGas: z.number().nonnegative().default(0),
      equation: z.string().min(1),
      text: RuleText.partial().optional(),
    })
    .strict();

  const Effect = z.discriminatedUnion('type', [
    z.object({ type: z.literal('react') }).strict(),
    z.object({ type: z.literal('dissolve'), bind: z.string() }).strict(),
    z.object({ type: z.literal('saturation'), bind: z.string() }).strict(),
    z.object({ type: z.literal('suspend'), bind: z.string() }).strict(),
    z.object({ type: z.literal('settle'), bind: z.string() }).strict(),
    z.object({ type: z.literal('phase_change'), bind: z.string(), to: Phase }).strict(),
    z
      .object({
        type: z.literal('transform'),
        bind: z.string(),
        to: Id,
        toPhase: Phase.optional(),
        fumeHood: z.boolean().default(false),
      })
      .strict(),
    z.object({ type: z.literal('crystallize') }).strict(),
    z.object({ type: z.literal('crystallize_cooling'), bind: z.string() }).strict(),
    z.object({ type: z.literal('indicator'), bind: z.string() }).strict(),
    z
      .object({
        type: z.literal('observe_only'),
        once: z.enum(['vessel', 'heat_session']),
        fumeHood: z.boolean().default(false),
        coolToC: z.number().optional(),
      })
      .strict(),
    z.object({ type: z.literal('stop') }).strict(),
  ]);

  const Rule = z
    .object({
      id: Id,
      kind: z.enum(['reaction', 'physical', 'indicator', 'sensory', 'hazard_stop']),
      priority: z.number().int(),
      group: Id.optional(),
      when: Condition,
      effect: Effect,
      observe: z.array(ObserveSpec).default([]),
      variants: z.array(Variant).optional(),
      text: RuleText,
      equation: z.string().optional(),
      line: Text.optional(),
      sources: z.array(Id),
      review: ReviewSchema,
    })
    .strict();

  const NoReaction = z
    .object({
      id: Id,
      priority: z.number().int(),
      when: z
        .object({
          trigger: z.array(ActionType).min(1),
          reactants: z.array(Reactant).default([]),
          medium: z.enum(['aqueous', 'dry', 'any']).default('any'),
        })
        .strict(),
      observe: z.array(ObserveSpec).default([]),
      text: z.object({ why: Text, deeper: Text.optional(), adult: Text }).strict(),
    })
    .strict();

  const EffectDef = z
    .object({
      id: Id,
      kind: z.enum(OBSERVATION_KINDS),
      detail: z.enum(OBSERVATION_DETAILS).optional(),
      intensity: Intensity.optional(),
      fxClasses: z.array(z.string().regex(/^fx-[a-z-]+$/)),
      vars: z.record(z.string().regex(/^--[a-z-]+$/), z.number()).default({}),
      durationMs: z.number().int().positive(),
      icon: z.string().regex(/^result-[a-z-]+$/),
      title: Text,
    })
    .strict();

  const Chip = z
    .object({
      id: Id,
      label: Text,
      /** Короткая подпись для клетки доски (слова не длиннее 9 букв). */
      short: Text,
      icon: z.string().regex(/^result-[a-z-]+$/),
      match: z
        .array(
          z
            .object({
              event: z.enum(['observation', 'nothing_happened', 'magnified']),
              kind: z.enum(OBSERVATION_KINDS).optional(),
              detail: z.enum(OBSERVATION_DETAILS).optional(),
              intensity: Intensity.optional(),
              ruleId: Id.optional(),
              reasonIds: z.array(Id).optional(),
              view: z.enum(MAGNIFIER_VIEWS).optional(),
            })
            .strict(),
        )
        .min(1),
    })
    .strict();

  const MissionTest = z
    .object({
      id: Id,
      label: Text,
      reagent: Id.optional(),
      action: z.enum(['magnify', 'heat']).optional(),
      chips: z.array(Chip).min(1),
    })
    .strict();

  const Predicate: z.ZodType<Predicate> = z.lazy(() =>
    z.union([
      z.object({ all: z.array(Predicate) }).strict(),
      z.object({ any: z.array(Predicate) }).strict(),
      z.object({ not: Predicate }).strict(),
      z
        .object({
          experimentsDone: z.object({ gte: z.number().optional(), lte: z.number().optional() }).strict(),
        })
        .strict(),
      z
        .object({
          jarsWith: z
            .object({
              where: z.record(Id, z.array(Id)),
              gte: z.number().optional(),
              lte: z.number().optional(),
            })
            .strict(),
        })
        .strict(),
      z.object({ labelsAllPlaced: z.boolean() }).strict(),
      z.object({ labelsWrong: z.object({ gte: z.number() }).strict() }).strict(),
    ]),
  );

  const Mission = z
    .object({
      id: Id,
      title: Text,
      goalTitle: Text,
      goalLabel: Text,
      intro: z.array(Text).min(1),
      jars: z.array(z.string().min(1)).min(2),
      unknowns: z.array(Id).min(2),
      helpers: z.array(Id),
      equipment: z.array(Id),
      tests: z.array(MissionTest).min(1),
      signatures: z.record(Id, z.record(Id, Id)),
      hints: z
        .array(z.object({ situation: Id, when: Predicate, levels: z.tuple([Text, Text, Text]) }).strict())
        .min(1),
      twists: z.array(z.object({ id: Id, when: Predicate, line: Text }).strict()).default([]),
      check: z
        .object({
          correct: Text,
          contradiction: Text,
          noData: Text,
          sameAgain: Text,
          allCorrect: Text,
          washHands: Text,
        })
        .strict(),
      finale: z.array(Text),
      mixWarning: Text,
      solutionPaths: z.array(z.object({ id: Id, order: z.array(Id).min(1) }).strict()).min(1),
    })
    .strict();

  // ---------- уроки ----------
  const Option = z.object({ id: Id, label: Text, reply: Text, correct: z.boolean().default(false) }).strict();
  const SortCard = z.object({ id: Id, label: Text, shelf: Id, wrong: Text }).strict();
  const Shelf = z.object({ id: Id, label: Text }).strict();
  const LabAct = z
    .object({
      id: Id,
      label: Text,
      icon: z.string(),
      vessel: z.number().int().min(0),
      add: Id.optional(),
      stir: z.boolean().optional(),
      magnify: z.boolean().optional(),
      smell: z.boolean().optional(),
    })
    .strict();
  const Block = z.discriminatedUnion('type', [
    z.object({ type: z.literal('jars'), letters: z.array(z.string()) }).strict(),
    z.object({ type: z.literal('goggles'), prompt: Text }).strict(),
    z
      .object({
        type: z.literal('choice'),
        id: Id,
        question: Text,
        options: z.array(Option).min(2),
        after: z.array(Text).optional(),
        art: z.enum(['fan']).optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal('predict'),
        id: Id,
        question: Text,
        options: z.array(z.object({ id: Id, label: Text }).strict()).min(2),
      })
      .strict(),
    z
      .object({
        type: z.literal('sort'),
        id: Id,
        prompt: Text,
        shelves: z.array(Shelf).min(2),
        cards: z.array(SortCard).min(2),
      })
      .strict(),
    z
      .object({
        type: z.literal('lab'),
        id: Id,
        vessels: z
          .array(
            z
              .object({
                label: z.string(),
                contents: z.array(z.object({ substance: Id, n: z.number().int().positive() }).strict()),
              })
              .strict(),
          )
          .min(1),
        actions: z.array(LabAct).min(1),
        tip: Text.optional(),
        done: z.array(Text).min(1),
        predict: z.object({ from: Id, match: Id, yes: Text, no: Text }).strict().optional(),
      })
      .strict(),
    z.object({ type: z.literal('rule'), title: Text, lines: z.array(Text).min(1) }).strict(),
    z
      .object({
        type: z.literal('spot'),
        id: Id,
        cards: z
          .array(z.object({ id: Id, art: Id, mistake: z.boolean(), label: Text, rule: Text }).strict())
          .min(2),
        done: z.array(Text).min(1),
      })
      .strict(),
    z.object({ type: z.literal('mission'), missionId: Id }).strict(),
    z.object({ type: z.literal('test') }).strict(),
    z.object({ type: z.literal('home') }).strict(),
    z.object({ type: z.literal('reward') }).strict(),
  ]);
  const Screen = z
    .object({
      id: Id,
      stage: Id,
      title: Text,
      lead: Text.optional(),
      guide: z
        .object({ pose: z.enum(['explain', 'happy', 'thinking', 'warn']), lines: z.array(Text).min(1) })
        .strict()
        .optional(),
      blocks: z.array(Block).min(1),
      sci: z.array(Id).optional(),
      deeper: z
        .object({ title: Text, body: z.array(Text).min(1) })
        .strict()
        .optional(),
      next: Text.optional(),
    })
    .strict();
  const QOption = z
    .object({ id: Id, label: Text, correct: z.boolean().default(false), explain: Text })
    .strict();
  const Question = z.discriminatedUnion('type', [
    z.object({ id: Id, type: z.literal('single'), prompt: Text, options: z.array(QOption).min(2) }).strict(),
    z
      .object({
        id: Id,
        type: z.literal('predict'),
        prompt: Text,
        art: Id.optional(),
        options: z.array(QOption).min(2),
      })
      .strict(),
    z
      .object({
        id: Id,
        type: z.literal('multi'),
        prompt: Text,
        partial: Text,
        options: z.array(QOption).min(2),
      })
      .strict(),
    z
      .object({
        id: Id,
        type: z.literal('sort'),
        prompt: Text,
        shelves: z.array(Shelf).min(2),
        cards: z.array(SortCard).min(2),
      })
      .strict(),
    z
      .object({
        id: Id,
        type: z.literal('match'),
        prompt: Text,
        pairs: z.array(z.object({ id: Id, left: Text, right: Text, wrong: Text }).strict()).min(2),
      })
      .strict(),
  ]);
  const Lesson = z
    .object({
      id: Id,
      moduleId: Id,
      order: z.number().int().positive(),
      title: Text,
      subtitle: Text,
      minutes: z.number().positive(),
      stages: z.array(z.object({ id: Id, label: Text }).strict()).min(2),
      screens: z.array(Screen).min(1),
      test: z.object({ intro: Text, summary: Text, questions: z.array(Question).min(1) }).strict(),
      home: z
        .object({
          title: Text,
          intro: Text,
          meta: Text,
          materials: z.array(Text).min(1),
          steps: z.array(Text).min(1),
          expectedTitle: Text,
          columns: z.array(Text).min(2),
          rows: z.array(z.array(Text)).min(1),
          notes: z.array(Text),
          safety: z.array(Text).min(1),
        })
        .strict(),
      reward: z.object({ badge: z.string(), title: Text, text: Text, ideas: z.array(Text) }).strict(),
    })
    .strict();
  const Module = z
    .object({
      id: Id,
      order: z.number().int().positive(),
      title: Text,
      subtitle: Text.optional(),
      lessons: z.array(z.object({ id: Id, title: Text, subtitle: Text }).strict()),
    })
    .strict();

  const Bundle = z
    .object({
      classes: z.array(ClassDef),
      species: z.array(Species),
      substances: z.array(Substance),
      equipment: z.array(Equipment),
      physics: Physics,
      dosing: Dosing,
      rules: z.array(Rule),
      noReactions: z.array(NoReaction),
      effects: z.array(EffectDef),
      missions: z.array(Mission),
      lessons: z.array(Lesson),
      modules: z.array(Module),
      sandbox: z
        .object({
          starter: z.array(Id),
          equipment: z.array(Id),
          unlocks: z.array(z.object({ by: Id, substances: z.array(Id) }).strict()),
          ideas: z.array(Text),
        })
        .strict(),
      strings: z.record(z.string(), Text),
      colors: z.record(z.string(), z.string()).default({}),
    })
    .strict();

  return { Species, Substance, Equipment, Rule, NoReaction, Mission, Lesson, Module, Bundle };
}

/** Язык условий миссии (docs/spec/04-engine-and-content.md, раздел 8.2 — подмножество для прототипа). */
export type Predicate =
  | { all: Predicate[] }
  | { any: Predicate[] }
  | { not: Predicate }
  | { experimentsDone: { gte?: number | undefined; lte?: number | undefined } }
  | { jarsWith: { where: Record<string, string[]>; gte?: number | undefined; lte?: number | undefined } }
  | { labelsAllPlaced: boolean }
  | { labelsWrong: { gte: number } };

export const SourceSchemas = makeSchemas(LocalizedTextSchema);
export const CompiledSchemas = makeSchemas(z.string());
