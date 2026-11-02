/**
 * Типы скомпилированного контента (тексты — уже строки одного языка).
 * Импортируйте только как `import type`, чтобы Zod не попал в сборку сайта.
 */
import type { z } from 'zod';
import type { CompiledSchemas, PHASES, OBSERVATION_KINDS, OBSERVATION_DETAILS, ACTION_TYPES, MAGNIFIER_VIEWS } from './schema.ts';

type S = typeof CompiledSchemas;
export type ContentBundle = z.output<S['Bundle']>;
export type Species = z.output<S['Species']>;
export type Substance = z.output<S['Substance']>;
export type Equipment = z.output<S['Equipment']>;
export type Rule = z.output<S['Rule']>;
export type NoReaction = z.output<S['NoReaction']>;
export type Mission = z.output<S['Mission']>;
export type Physics = ContentBundle['physics'];
export type Dosing = ContentBundle['dosing'];
export type EffectDef = ContentBundle['effects'][number];
export type RuleVariant = NonNullable<Rule['variants']>[number];
export type ReactantPattern = Rule['when']['reactants'][number];
export type MissionTest = Mission['tests'][number];
export type MissionChip = MissionTest['chips'][number];

export type Phase = (typeof PHASES)[number];
export type ObservationKind = (typeof OBSERVATION_KINDS)[number];
export type ObservationDetail = (typeof OBSERVATION_DETAILS)[number];
export type ActionType = (typeof ACTION_TYPES)[number];
export type MagnifierView = (typeof MAGNIFIER_VIEWS)[number];
export type Intensity = 'weak' | 'medium' | 'strong';
export type { Predicate } from './schema.ts';
