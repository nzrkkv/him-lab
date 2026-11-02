/** Типы состояния экрана лаборатории (их читает view.ts, меняет controller.ts). */
import type { LabState } from '../../core/engine/types.ts';
import type { HintView, JarCheck, MissionState } from '../../core/mission/mission.ts';

export type Mode = 'sandbox' | 'mission';
export type Pose = 'explain' | 'happy' | 'thinking' | 'warn';

export interface ObsLine {
  icon: string;
  title: string;
  sub?: string;
  tone: 'change' | 'nothing' | 'success' | 'discovery' | 'caution';
}
export interface ResultView {
  kicker: string;
  title: string;
  lines: ObsLine[];
  why: string;
  deeper?: string;
  lens?: string;
}
export interface Speech {
  text: string;
  pose: Pose;
  hint?: HintView;
  actions?: Array<'more_hint' | 'close' | 'start' | 'wash' | 'next'>;
  checks?: string[];
  /** Короткая реплика: при появлении другого слоя исчезает, а не ждёт в очереди. */
  transient?: boolean;
  /** Шаг вступления миссии (кнопка «Дальше»). */
  introStep?: number;
}
export interface Readout {
  vesselId: string;
  value: string;
  note: string;
  kind: 'temperature' | 'ph' | 'mass';
  ph?: number;
}

export interface LabUiState {
  mode: Mode;
  lab: LabState;
  history: LabState[];
  selected: { kind: 'vessel' | 'substance'; id: string } | null;
  qty: { substanceId: string; vesselId: string | null; count: number } | null;
  result: ResultView | null;
  stop: { title: string; text: string; deeper?: string } | null;
  speech: Speech | null;
  toast: string | null;
  readout: Readout | null;
  labelPicker: string | null;
  journalOpen: boolean;
  mission: MissionState | null;
  checks: JarCheck[] | null;
  heatStartedAt: number | null;
  lastActionAt: number;
  announce: string;
  mixedWarned: boolean;
}

/** Начальное состояние экрана: пустой стол, ничего не открыто. */
export function initialUiState(mode: Mode, lab: LabState): LabUiState {
  return {
    mode,
    lab,
    history: [],
    selected: null,
    qty: null,
    result: null,
    stop: null,
    speech: null,
    toast: null,
    readout: null,
    labelPicker: null,
    journalOpen: false,
    mission: null,
    checks: null,
    heatStartedAt: null,
    lastActionAt: Date.now(),
    announce: '',
    mixedWarned: false,
  };
}
