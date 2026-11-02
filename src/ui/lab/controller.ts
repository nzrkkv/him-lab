/**
 * Контроллер лаборатории: состояние экрана, вызовы движка и миссии, тексты результатов, сохранение.
 * Отрисовку делает src/ui/lab/view.ts по снимку этого состояния.
 */
import type { Mission } from '../../core/content-model/types.ts';
import { createLab, step } from '../../core/engine/step.ts';
import { computePh, phWord } from '../../core/engine/ph.ts';
import type { EngineEvent, LabAction, LabState } from '../../core/engine/types.ts';
import { deriveVisual, type VesselVisual } from '../../core/engine/visual.ts';
import {
  beginExperiments,
  checkLabels,
  placeLabel,
  recordEvents,
  requestHint,
  startMission,
  washHands,
  type HintView,
  type JarCheck,
  type MissionState,
} from '../../core/mission/mission.ts';
import {
  emptyProgress,
  loadProgress,
  type ProgressV1,
  type SandboxLogLine,
} from '../../core/progress/progress.ts';
import { debouncedWriter, readKey, writeKey } from '../../platform/storage.ts';
import { bundle, ix, plural, t } from '../content.ts';

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

const PROGRESS_KEY = 'progress';

export class LabController {
  state: LabUiState;
  progress: ProgressV1;
  readonly mission: Mission;
  private listeners: Array<(full: boolean) => void> = [];
  private save: () => void;

  constructor(mode: Mode) {
    const loaded = loadProgress(readKey(PROGRESS_KEY));
    if (!loaded.ok && loaded.reason === 'corrupt')
      writeKey(`backup:${Date.now()}`, readKey(PROGRESS_KEY) ?? '');
    this.progress = loaded.ok ? loaded.progress : emptyProgress();
    this.save = debouncedWriter(PROGRESS_KEY, () => JSON.stringify(this.progress));
    this.mission = bundle.missions[0] as Mission;
    this.state = {
      mode,
      lab: createLab(),
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
    this.normalizeLayers();
    for (const fn of this.listeners) fn(full);
  }

  /** Очередь реплик Пипы, которые ждут, пока закроется другой всплывающий слой. */
  speechQueue: Speech[] = [];
  private prevLayers: Record<string, unknown> = {};
  private reopenJournal = false;

  /**
   * Правило слоёв: одновременно виден только один всплывающий слой
   * (стоп, надпись, количество, выезжающий журнал, результат, реплика).
   * Новый слой закрывает старые; реплика Пипы не теряется, а встаёт в очередь.
   */
  private normalizeLayers(): void {
    const s = this.state;
    const narrow = typeof window !== 'undefined' && window.innerWidth < 1280;
    const layers: Record<string, unknown> = {
      stop: s.stop,
      labelPicker: s.labelPicker,
      qty: s.qty,
      journal: narrow && s.journalOpen ? true : null,
      result: s.result,
      speech: s.speech,
    };
    const order = ['stop', 'labelPicker', 'qty', 'journal', 'result', 'speech'];
    const open = order.filter((k) => layers[k]);
    const fresh = open.filter((k) => layers[k] !== this.prevLayers[k]);
    const winner = fresh[0] ?? open[0];
    // Надпись выбирают с доски в выезжающем журнале: после выбора журнал возвращается.
    if (winner === 'labelPicker' && layers['journal']) this.reopenJournal = true;
    if (winner !== 'labelPicker' && winner !== undefined) this.reopenJournal = false;
    if (!winner && this.reopenJournal) {
      this.reopenJournal = false;
      s.journalOpen = true;
    }
    for (const k of open) {
      if (k === winner) continue;
      if (k === 'speech' && s.speech) {
        if (!s.speech.transient && !this.speechQueue.some((q) => q.text === s.speech?.text))
          this.speechQueue.push(s.speech);
        s.speech = null;
      } else if (k === 'journal') s.journalOpen = false;
      else if (k === 'stop') s.stop = null;
      else if (k === 'labelPicker') s.labelPicker = null;
      else if (k === 'qty') s.qty = null;
      else if (k === 'result') s.result = null;
    }
    if (!winner && !s.journalOpen && this.speechQueue.length) s.speech = this.speechQueue.shift() ?? null;
    this.prevLayers = {
      stop: s.stop,
      labelPicker: s.labelPicker,
      qty: s.qty,
      journal: narrow && s.journalOpen ? true : null,
      result: s.result,
      speech: s.speech,
    };
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
    this.speechQueue = [];
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
    this.state.speech = null;
    this.persist();
    this.emit();
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
    this.describe(action, r.events);
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

  // ---------- тексты результатов ----------

  private describe(action: LabAction, events: readonly EngineEvent[]): void {
    const lines: ObsLine[] = [];
    let title = '';
    let why = '';
    let deeper: string | undefined;
    let vesselId: string | null = null;
    let lens: string | undefined;
    const announce: string[] = [];
    for (const e of events) {
      switch (e.type) {
        case 'observation': {
          vesselId = e.vesselId;
          const rule = ix.bundle.rules.find((r) => r.id === e.ruleId);
          const variant = rule?.variants?.find((v) => v.id === e.variantId);
          const effect =
            ix.effects.find((d) => d.kind === e.kind && (d.detail ?? null) === (e.detail ?? null)) ??
            ix.effects.find((d) => d.kind === e.kind && !d.detail);
          let lineTitle = effect?.title ?? '';
          if (e.colorName) lineTitle = t('result.indicator', { color: e.colorName });
          if (e.kind === 'cold' && e.deltaC !== undefined)
            lineTitle = `${lineTitle}: ${Math.round(e.deltaC * 10) / 10} °C`;
          lines.push({ icon: effect?.icon ?? 'result-color', title: lineTitle, tone: 'change' });
          if (!title && rule) {
            title = variant?.text?.what ?? rule.text.what;
            why = variant?.text?.why ?? rule.text.why;
            deeper = rule.text.deeper;
            if (rule.line && rule.id === 'acid_carbonate_gas') deeper = deeper ?? undefined;
          }
          break;
        }
        case 'nothing_happened': {
          if (action.type === 'wait' && events.some((x) => x.type === 'observation')) break;
          vesselId = e.vesselId || vesselId;
          const nr = ix.noReactions.find((n) => n.id === e.reasonId);
          title = t('result.nothing.title');
          why = nr?.text.why ?? t(`nothing.generic.${e.action}`);
          deeper = nr?.text.deeper;
          lines.push({
            icon: e.showsColor ? 'result-color' : 'result-nothing',
            title: t('result.nothing.sub'),
            tone: 'nothing',
          });
          break;
        }
        case 'safety_stop': {
          const rule = ix.bundle.rules.find((r) => r.id === e.ruleId);
          this.state.stop = {
            title: rule?.text.why.split(/[:.]/)[0] ?? t('stop.title'),
            text: rule?.text.why ?? '',
            ...(rule?.text.deeper ? { deeper: rule.text.deeper } : {}),
          };
          this.state.heatStartedAt = null;
          announce.push(`${t('stop.title')} ${rule?.text.why ?? ''}`);
          this.log(e.vesselId, 'caution', rule?.text.why ?? t('stop.title'), '');
          break;
        }
        case 'blocked':
          this.state.speech = {
            text: t(`blocked.${e.reason}`),
            pose: 'warn',
            actions: ['close'],
            transient: true,
          };
          announce.push(t(`blocked.${e.reason}`));
          break;
        case 'measurement': {
          const num = new Intl.NumberFormat('ru').format(e.value);
          const value = t(`readout.${e.quantity}`, { value: num });
          const note =
            e.quantity === 'ph'
              ? t(`result.ph.${phWord(e.value)}`)
              : e.quantity === 'temperature'
                ? t('act.temperature')
                : t('act.weigh');
          this.state.readout = {
            vesselId: e.vesselId,
            value,
            note,
            kind: e.quantity,
            ...(e.quantity === 'ph' ? { ph: e.value } : {}),
          };
          announce.push(`${this.vesselName(e.vesselId)}: ${value}, ${note}`);
          this.log(e.vesselId, 'change', `${value} — ${note}`, '');
          break;
        }
        case 'magnified': {
          lens = e.view;
          vesselId = e.vesselId ?? null;
          title = t('result.lens.title');
          why = t(`result.lens.${e.view}`);
          lines.push({ icon: 'magnify', title: why, tone: 'change' });
          break;
        }
        case 'smelled': {
          vesselId = e.vesselId;
          const odor = e.odor ? ix.species.get(e.odor)?.odor?.text : undefined;
          title = t('act.smell');
          why = odor ?? t('result.smell.none');
          deeper = t('result.smell.hint');
          lines.push({ icon: 'result-smell', title: why, tone: odor ? 'change' : 'nothing' });
          break;
        }
        case 'discovery': {
          const sp = ix.species.get(e.speciesId);
          const name = sp?.discoverable?.name ?? e.speciesId;
          if (!this.progress.discoveries.includes(e.speciesId)) {
            this.progress.discoveries.push(e.speciesId);
            this.state.toast = t('result.discovery', { name });
            this.save();
          }
          lines.push({
            icon: 'star',
            title: t('result.discovery', { name }),
            sub: sp?.discoverable?.text ?? '',
            tone: 'discovery',
          });
          break;
        }
        default:
          break;
      }
    }
    if (!title) return;
    const subject =
      action.type === 'magnify' && action.substanceId
        ? this.originName(action.substanceId)
        : vesselId
          ? this.vesselName(vesselId)
          : '';
    const kicker = vesselId ? `${subject}: ${this.contentsText(vesselId)}` : subject;
    this.state.result = {
      kicker,
      title,
      lines,
      why,
      ...(deeper ? { deeper } : {}),
      ...(lens ? { lens } : {}),
    };
    announce.push(`${subject}. ${title}. ${why}`);
    this.state.announce = announce.join(' ');
    if (vesselId && action.type !== 'tick')
      this.log(vesselId, lines[0]?.tone === 'nothing' ? 'nothing' : 'change', title, why);
    else if (vesselId && action.type === 'tick' && lines.length) this.log(vesselId, 'change', title, why);
  }

  private log(vesselId: string, tone: SandboxLogLine['tone'], title: string, detail: string): void {
    const list = this.progress.sandboxLog;
    const prefix = vesselId ? `${this.vesselName(vesselId)}: ${this.contentsText(vesselId)} — ` : '';
    list.push({
      id: (list[list.length - 1]?.id ?? 0) + 1,
      icon: tone,
      title: `${prefix}${title}`,
      detail,
      tone,
    });
    if (list.length > 50) list.splice(0, list.length - 50);
    this.save();
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
