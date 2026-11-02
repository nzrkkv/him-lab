/**
 * Контроллер лаборатории: состояние экрана, вызовы движка и миссии, тексты результатов, сохранение.
 * Отрисовку делает src/ui/lab/view.ts по снимку этого состояния.
 */
import type { Mission } from '../../core/content-model/types.ts';
import { createLab, step } from '../../core/engine/step.ts';
import { computePh } from '../../core/engine/ph.ts';
import type { EngineEvent, LabAction } from '../../core/engine/types.ts';
import { deriveVisual, type VesselVisual } from '../../core/engine/visual.ts';
import {
  beginExperiments,
  checkLabels,
  placeLabel,
  recordEvents,
  requestHint,
  startMission,
  washHands,
} from '../../core/mission/mission.ts';
import { awardBadge, type ProgressV1 } from '../../core/progress/progress.ts';
import { availableSubstances, progress, saveProgress } from '../progress-store.ts';
import { bundle, ix, plural, t } from '../content.ts';
import { describeEvents } from './describe.ts';
import { initialUiState, type LabUiState, type Mode, type Speech } from './lab-types.ts';
import { LayerRule } from './layers.ts';

export type { LabUiState, Mode, ObsLine, Pose, Readout, ResultView, Speech } from './lab-types.ts';

export class LabController {
  state: LabUiState;
  progress: ProgressV1;
  readonly mission: Mission;
  private listeners: Array<(full: boolean) => void> = [];
  /** Сохранить прогресс (с задержкой). */
  save: () => void;
  private layers = new LayerRule();

  constructor(mode: Mode) {
    this.progress = progress();
    this.save = saveProgress;
    this.mission = bundle.missions[0] as Mission;
    this.state = initialUiState(mode, createLab());
    if (mode === 'mission') this.openMission(false);
    else
      this.state.speech = {
        text: t('guide.welcome.sandbox'),
        pose: 'happy',
        actions: ['close'],
        transient: true,
      };
    document.documentElement.classList.toggle('reduce-motion', this.progress.settings.calm);
  }

  onChange(fn: (full: boolean) => void): void {
    this.listeners.push(fn);
  }

  private emit(full = true): void {
    this.layers.normalize(this.state);
    for (const fn of this.listeners) fn(full);
  }

  /** Вступление миссии по шагам: 2–3 коротких реплики вместо стены текста. */
  private introSpeech(step: number): Speech {
    const last = step >= this.mission.intro.length - 1;
    return {
      text: this.mission.intro[step] ?? '',
      pose: 'explain',
      actions: [last ? 'start' : 'next'],
      introStep: step,
    };
  }

  nextIntro(): void {
    const step = (this.state.speech?.introStep ?? 0) + 1;
    this.state.speech = this.introSpeech(step);
    this.emit();
  }

  private persist(): void {
    this.progress.mission = this.state.mission;
    this.save();
  }

  // ---------- миссия ----------

  openMission(restart: boolean): void {
    const saved = this.progress.mission;
    const m =
      !restart && saved && saved.missionId === this.mission.id && saved.status !== 'completed'
        ? saved
        : startMission(this.mission, Date.now() % 2147483647);
    this.state.mission = m;
    this.state.lab = createLab();
    this.state.history = [];
    this.state.checks = null;
    for (let i = 0; i < this.mission.jars.length; i++)
      this.state.lab = step(this.state.lab, { type: 'place', equipmentId: 'test_tube' }, ix).state;
    this.state.speech =
      m.status === 'briefing'
        ? this.introSpeech(0)
        : { text: t('mission.resume'), pose: 'happy', actions: ['close'], transient: true };
    this.layers.speechQueue = [];
    this.persist();
    this.emit();
  }

  startExperiments(): void {
    if (!this.state.mission) return;
    this.state.mission = beginExperiments(this.state.mission);
    this.state.speech = null;
    this.persist();
    this.emit();
  }

  jarSubstance(jar: string): string | undefined {
    return this.state.mission?.jarSubstance[jar];
  }

  requestHint(): void {
    const m = this.state.mission;
    if (!m) return;
    const r = requestHint(this.mission, m);
    this.state.mission = r.mission;
    this.state.speech = {
      text: r.hint.text,
      pose: 'thinking',
      hint: r.hint,
      actions: r.hint.level < 3 ? ['more_hint', 'close'] : ['close'],
    };
    this.state.lastActionAt = Date.now();
    this.persist();
    this.emit();
  }

  setLabel(jar: string, substanceId: string | null): void {
    if (!this.state.mission) return;
    this.state.mission = placeLabel(this.state.mission, jar, substanceId);
    this.state.labelPicker = null;
    this.state.checks = null;
    this.persist();
    this.emit();
  }

  check(): void {
    const m = this.state.mission;
    if (!m) return;
    const r = checkLabels(this.mission, m);
    this.state.mission = r.mission;
    this.state.checks = r.results;
    this.state.journalOpen = false;
    this.state.result = null;
    const testLabel = (id: string | undefined): string =>
      this.mission.tests.find((x) => x.id === id)?.label ?? '';
    const chipLabel = (test: string | undefined, chip: string | undefined): string =>
      this.mission.tests.find((x) => x.id === test)?.chips.find((c) => c.id === chip)?.label ?? '';
    const name = (s: string | null | undefined): string =>
      s ? (ix.substances.get(s)?.shortName ?? s).toLowerCase() : '';
    if (r.allCorrect) {
      this.state.speech = {
        text: `${this.mission.check.allCorrect} ${this.mission.check.washHands}`,
        pose: 'happy',
        actions: ['wash'],
      };
    } else if (r.sameAgain) {
      this.state.speech = { text: this.mission.check.sameAgain, pose: 'thinking', actions: ['close'] };
    } else {
      const lines = r.results
        .filter((x) => x.status !== 'no_label')
        .map((x) => {
          const label = name(m.labels[x.jar]);
          const tpl =
            x.status === 'correct'
              ? this.mission.check.correct
              : x.status === 'contradiction'
                ? this.mission.check.contradiction
                : this.mission.check.noData;
          return tpl
            .replace('{jar}', x.jar)
            .replace('{label}', label)
            .replace('{test}', testLabel(x.test))
            .replace('{observed}', chipLabel(x.test, x.chip));
        });
      this.state.speech = {
        text: t('mission.check.title'),
        pose: 'explain',
        checks: lines,
        actions: ['close'],
      };
    }
    this.persist();
    this.emit();
  }

  wash(): void {
    const m = this.state.mission;
    if (!m) return;
    this.state.mission = washHands(m);
    if (this.state.mission.status === 'completed' && !this.progress.missionsCompleted.includes(m.missionId)) {
      this.progress.missionsCompleted.push(m.missionId);
    }
    if (this.state.mission.status === 'completed') awardBadge(this.progress, 'powder-detective');
    this.state.speech = null;
    this.persist();
    this.emit();
  }

  /** Вещества песочницы: стартовый набор + открытые за пройденные уроки и миссии. */
  availableSubstances(): string[] {
    return availableSubstances(this.progress);
  }

  // ---------- выбор и количество ----------

  select(kind: 'vessel' | 'substance', id: string): void {
    const sel = this.state.selected;
    this.state.readout = null;
    if (kind === 'vessel' && sel?.kind === 'substance') {
      this.addFromShelf(sel.id, id);
      this.state.selected = { kind: 'vessel', id };
    } else if (kind === 'substance' && sel?.kind === 'vessel') {
      this.addFromShelf(id, sel.id);
    } else {
      this.state.selected = sel?.kind === kind && sel.id === id ? null : { kind, id };
      this.emit();
    }
  }

  /** Вещество с полки (или банка миссии) → сосуд. В миссии «1 тап = 1 порция», в песочнице — выбор количества. */
  addFromShelf(substanceOrJar: string, vesselId: string): void {
    const substanceId = this.jarSubstance(substanceOrJar) ?? substanceOrJar;
    const sub = ix.substances.get(substanceId);
    if (!sub) return;
    if (this.state.mode === 'mission') {
      this.act({ type: 'add', vesselId, substanceId, dose: { unit: sub.dosing, count: 1 } });
      return;
    }
    this.state.qty = { substanceId, vesselId, count: 1 };
    this.emit();
  }

  setQty(count: number): void {
    if (!this.state.qty) return;
    this.state.qty = { ...this.state.qty, count: Math.max(1, Math.min(10, count)) };
    this.emit();
  }

  confirmQty(): void {
    const q = this.state.qty;
    this.state.qty = null;
    if (!q?.vesselId) return this.emit();
    const unit = ix.substances.get(q.substanceId)?.dosing ?? 'portion_solid';
    this.act({
      type: 'add',
      vesselId: q.vesselId,
      substanceId: q.substanceId,
      dose: { unit, count: q.count },
    });
  }

  closeOverlays(): void {
    Object.assign(this.state, { qty: null, result: null, stop: null, labelPicker: null, readout: null });
    if (window.innerWidth < 1280) this.state.journalOpen = false;
    if (
      this.state.speech &&
      !this.state.speech.actions?.includes('start') &&
      !this.state.speech.actions?.includes('wash')
    )
      this.state.speech = null;
    this.emit();
  }

  set<K extends keyof LabUiState>(key: K, value: LabUiState[K]): void {
    this.state[key] = value;
    this.emit();
  }

  toggleSetting(key: keyof ProgressV1['settings']): void {
    this.progress.settings[key] = !this.progress.settings[key];
    if (key === 'calm')
      document.documentElement.classList.toggle('reduce-motion', this.progress.settings.calm);
    this.save();
    this.emit();
  }

  // ---------- действия движка ----------

  placeVessel(equipmentId: string): void {
    if (this.state.lab.order.length >= 5) {
      this.state.toast = t('bench.full');
      return this.emit();
    }
    this.act({ type: 'place', equipmentId });
  }

  undo(): void {
    const prev = this.state.history.pop();
    if (!prev) return;
    this.state.lab = prev;
    this.state.result = null;
    this.emit();
  }

  /** Главная точка: действие → движок → миссия → тексты → эффекты (через слушателей). */
  act(action: LabAction): EngineEvent[] {
    const before = this.state.lab;
    const r = step(before, action, ix);
    if (action.type !== 'tick') {
      this.state.history.push(before);
      if (this.state.history.length > 20) this.state.history.shift();
      this.state.lastActionAt = Date.now();
    }
    this.state.lab = r.state;
    if (action.type === 'place') {
      const placed = r.events.find((e) => e.type === 'placed');
      if (placed?.type === 'placed') this.state.selected = { kind: 'vessel', id: placed.vesselId };
    }
    if (
      action.type === 'heat_start' &&
      !r.events.some((e) => e.type === 'blocked' || e.type === 'safety_stop')
    )
      this.state.heatStartedAt = Date.now();
    if (action.type === 'heat_stop') this.state.heatStartedAt = null;
    describeEvents(this, action, r.events);
    if (this.state.mission && this.state.mission.status !== 'briefing') {
      const rec = recordEvents(this.mission, this.state.mission, r.state, action, r.events);
      this.state.mission = rec.mission;
      if (rec.mixed && !this.state.mixedWarned) {
        this.state.mixedWarned = true;
        this.state.speech = { text: this.mission.mixWarning, pose: 'thinking', actions: ['close'] };
      } else if (rec.twistLine && this.progress.settings.hints) {
        this.state.speech = { text: rec.twistLine, pose: 'thinking', actions: ['close'] };
      }
      if (rec.added.length) this.persist();
    }
    this.lastEvents = r.events;
    this.needsTicks =
      r.needsTicks || this.state.lab.order.some((id) => this.state.lab.vessels[id]?.heat === 'burner');
    this.emit(action.type !== 'tick');
    return r.events;
  }

  lastEvents: EngineEvent[] = [];
  needsTicks = false;

  visual(vesselId: string): VesselVisual | null {
    const v = this.state.lab.vessels[vesselId];
    return v ? deriveVisual(v, ix) : null;
  }

  vesselName(id: string): string {
    const v = this.state.lab.vessels[id];
    if (!v) return '';
    return t('bench.vessel', { name: ix.equipment.get(v.equipmentId)?.name ?? '', no: v.no });
  }

  /** Что внутри сосуда — короткими именами (в миссии банки называются буквами). */
  contentsText(id: string): string {
    const v = this.state.lab.vessels[id];
    if (!v || v.origins.length === 0) return t('bench.empty.vessel');
    return v.origins.map((o) => this.originName(o)).join(' + ');
  }

  originName(substanceId: string): string {
    const m = this.state.mission;
    const jar = m ? Object.entries(m.jarSubstance).find(([, s]) => s === substanceId)?.[0] : undefined;
    if (jar) return t('shelf.jar', { jar });
    return ix.substances.get(substanceId)?.shortName.toLowerCase() ?? substanceId;
  }

  /** Имя частицы для ребёнка: имя вещества с полки, если оно из одной частицы, иначе научное. */
  speciesName(sp: string): string {
    for (const sub of ix.substances.values())
      if (sub.composition[0]?.species === sp && sub.composition.length === 1) return this.originName(sub.id);
    return ix.species.get(sp)?.names.scientific ?? sp;
  }

  /** pH для шкалы показаний. */
  ph(vesselId: string): number | null {
    const v = this.state.lab.vessels[vesselId];
    return v ? computePh(v, ix) : null;
  }

  portionsText(count: number, unit: 'portion_solid' | 'portion_liquid' | 'drop'): string {
    return plural(count, unit === 'drop' ? 'unit.drop' : 'unit.portion');
  }
}
