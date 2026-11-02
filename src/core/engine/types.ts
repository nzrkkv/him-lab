/** Состояние лаборатории, действия и события движка (docs/spec/04-engine-and-content.md, разделы 3–4). */
import type {
  ActionType,
  Intensity,
  MagnifierView,
  ObservationDetail,
  ObservationKind,
  Phase,
} from '../content-model/types.ts';

export type VesselId = string;
export type SpeciesId = string;
export type SubstanceId = string;

/** Граммы по фазам для каждой частицы. */
export type Contents = Record<SpeciesId, Partial<Record<Phase, number>>>;

export interface Process {
  ruleId: string;
  variantId: string;
  /** Скорость реакции, моль за секунду опыта. */
  ratePerS: number;
}

export interface VesselState {
  id: VesselId;
  no: number;
  equipmentId: string;
  capacityMl: number;
  heatCapacityJPerK: number;
  contents: Contents;
  temperatureC: number;
  heat: 'none' | 'burner' | 'ice_bath';
  inHolder: boolean;
  stirsSinceAdd: number;
  /** Сколько граммов растворимой частицы разрешено растворить (копится от перемешиваний и времени). */
  dissolveBudget: Record<SpeciesId, number>;
  /** Сколько секунд держится условие правила со стадией (holdS). */
  holds: Record<string, number>;
  processes: Process[];
  /** Вещества с полки, попавшие в сосуд, по порядку. */
  origins: SubstanceId[];
  indicatorBand: number | null;
  /** Ключи «один раз»: для сосуда и для текущего нагрева. */
  seen: string[];
  heatSeen: string[];
  heatObserved: boolean;
  overflowed: boolean;
}

export interface LabState {
  timeS: number;
  vessels: Record<VesselId, VesselState>;
  order: VesselId[];
  fumeHoodOn: boolean;
  nextVesselNo: number;
}

export interface Dose {
  unit: 'portion_solid' | 'portion_liquid' | 'drop';
  count: number;
}

export type LabAction =
  | { type: 'place'; equipmentId: string }
  | { type: 'remove'; vesselId: VesselId }
  | { type: 'add'; vesselId: VesselId; substanceId: SubstanceId; dose: Dose }
  | { type: 'pour'; from: VesselId; to: VesselId }
  | { type: 'stir'; vesselId: VesselId }
  | { type: 'attach_holder'; vesselId: VesselId }
  | { type: 'detach_holder'; vesselId: VesselId }
  | { type: 'heat_start'; vesselId: VesselId }
  | { type: 'heat_stop'; vesselId: VesselId }
  | { type: 'cool_start'; vesselId: VesselId }
  | { type: 'cool_stop'; vesselId: VesselId }
  | { type: 'tick'; seconds: number }
  | { type: 'wait'; seconds?: number }
  | { type: 'smell'; vesselId: VesselId }
  | { type: 'magnify'; vesselId?: VesselId; substanceId?: SubstanceId }
  | { type: 'measure_temperature'; vesselId: VesselId }
  | { type: 'measure_ph'; vesselId: VesselId }
  | { type: 'weigh'; vesselId: VesselId }
  | { type: 'clear'; vesselId: VesselId }
  | { type: 'return_to_jar'; vesselId: VesselId; substanceId: SubstanceId };

// Проверка, что типы действий движка совпадают со списком в схеме контента.
type _CheckActions = LabAction['type'] extends ActionType ? true : never;
export const ACTIONS_MATCH_SCHEMA: _CheckActions = true;

export type BlockReason =
  | 'needs_holder'
  | 'capacity'
  | 'no_return_to_jar'
  | 'not_available'
  | 'empty_vessel'
  | 'needs_liquid'
  | 'station_busy'
  | 'unknown_vessel';

export type EngineEvent =
  | {
      type: 'observation';
      vesselId: VesselId;
      kind: ObservationKind;
      detail?: ObservationDetail;
      intensity: Intensity;
      ruleId: string;
      variantId?: string;
      gasMl?: number;
      deltaC?: number;
      colorName?: string;
    }
  | {
      type: 'nothing_happened';
      vesselId: VesselId;
      action: LabAction['type'];
      reasonId: string;
      showsColor: boolean;
    }
  | { type: 'safety_stop'; vesselId: VesselId; ruleId: string }
  | { type: 'blocked'; reason: BlockReason; vesselId?: VesselId }
  | { type: 'measurement'; vesselId: VesselId; quantity: 'temperature' | 'ph' | 'mass'; value: number }
  | {
      type: 'magnified';
      view: MagnifierView | 'liquid' | 'mixed';
      vesselId?: VesselId;
      substanceId?: SubstanceId;
    }
  | { type: 'smelled'; vesselId: VesselId; odor: string | null }
  | { type: 'fume_hood'; on: boolean }
  | { type: 'discovery'; vesselId: VesselId; speciesId: SpeciesId }
  | { type: 'placed'; vesselId: VesselId }
  | { type: 'process'; vesselId: VesselId; ruleId: string; phase: 'started' | 'finished' };

export interface StepResult {
  state: LabState;
  events: EngineEvent[];
  /** Идут процессы или нагрев — интерфейсу нужно присылать tick. */
  needsTicks: boolean;
}
