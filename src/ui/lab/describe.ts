/**
 * Тексты результата по событиям движка: карточка, реплика, показания, стоп, запись в журнал.
 * Меняет состояние экрана через host (контроллер лаборатории).
 */
import { phWord } from '../../core/engine/ph.ts';
import type { EngineEvent, LabAction } from '../../core/engine/types.ts';
import type { ProgressV1, SandboxLogLine } from '../../core/progress/progress.ts';
import { ix, t } from '../content.ts';
import type { LabUiState, ObsLine } from './lab-types.ts';

export interface DescribeHost {
  state: LabUiState;
  progress: ProgressV1;
  save(): void;
  vesselName(id: string): string;
  contentsText(id: string): string;
  originName(substanceId: string): string;
  speciesName(sp: string): string;
}

export function describeEvents(host: DescribeHost, action: LabAction, events: readonly EngineEvent[]): void {
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
        host.state.stop = {
          title: rule?.text.why.split(/[:.]/)[0] ?? t('stop.title'),
          text: rule?.text.why ?? '',
          ...(rule?.text.deeper ? { deeper: rule.text.deeper } : {}),
        };
        host.state.heatStartedAt = null;
        announce.push(`${t('stop.title')} ${rule?.text.why ?? ''}`);
        logLine(host, e.vesselId, 'caution', rule?.text.why ?? t('stop.title'), '');
        break;
      }
      case 'blocked':
        host.state.speech = {
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
        host.state.readout = {
          vesselId: e.vesselId,
          value,
          note,
          kind: e.quantity,
          ...(e.quantity === 'ph' ? { ph: e.value } : {}),
        };
        announce.push(`${host.vesselName(e.vesselId)}: ${value}, ${note}`);
        logLine(host, e.vesselId, 'change', `${value} — ${note}`, '');
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
      case 'separated': {
        // Разделение смеси перекрывает наблюдения по пути (кипение при выпаривании и т. п.).
        vesselId = e.vesselId;
        const names = e.speciesIds.map((sp) => host.speciesName(sp)).join(', ');
        const m = e.method;
        title = t(`result.sep.${m}.title`);
        why =
          m === 'filter'
            ? names
              ? t('result.sep.filter.kept', {
                  names,
                  to: host.vesselName(e.toVesselId ?? '').toLowerCase(),
                })
              : t('result.sep.filter.none')
            : m === 'magnet'
              ? t('result.sep.magnet.why', { names })
              : names
                ? t('result.sep.evaporate.why', { names })
                : t('result.sep.evaporate.empty');
        deeper = t(`result.sep.${m}.deeper`);
        lines.unshift({ icon: m, title: t(`result.sep.${m}.line`), tone: 'change' });
        if (m === 'filter' && e.toVesselId) host.state.selected = { kind: 'vessel', id: e.toVesselId };
        break;
      }
      case 'discovery': {
        const sp = ix.species.get(e.speciesId);
        const name = sp?.discoverable?.name ?? e.speciesId;
        if (!host.progress.discoveries.includes(e.speciesId)) {
          host.progress.discoveries.push(e.speciesId);
          host.state.toast = t('result.discovery', { name });
          host.save();
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
      ? host.originName(action.substanceId)
      : vesselId
        ? host.vesselName(vesselId)
        : '';
  const kicker = vesselId ? `${subject}: ${host.contentsText(vesselId)}` : subject;
  host.state.result = {
    kicker,
    title,
    lines,
    why,
    ...(deeper ? { deeper } : {}),
    ...(lens ? { lens } : {}),
  };
  announce.push(`${subject}. ${title}. ${why}`);
  host.state.announce = announce.join(' ');
  if (vesselId && action.type !== 'tick')
    logLine(host, vesselId, lines[0]?.tone === 'nothing' ? 'nothing' : 'change', title, why);
  else if (vesselId && action.type === 'tick' && lines.length) logLine(host, vesselId, 'change', title, why);
}

export function logLine(
  host: DescribeHost,
  vesselId: string,
  tone: SandboxLogLine['tone'],
  title: string,
  detail: string,
): void {
  const list = host.progress.sandboxLog;
  const prefix = vesselId ? `${host.vesselName(vesselId)}: ${host.contentsText(vesselId)} — ` : '';
  list.push({
    id: (list[list.length - 1]?.id ?? 0) + 1,
    icon: tone,
    title: `${prefix}${title}`,
    detail,
    tone,
  });
  if (list.length > 50) list.splice(0, list.length - 50);
  host.save();
}
