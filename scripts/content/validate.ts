/**
 * Проверки контента поверх схемы: ссылки, состав, уравнения, ассеты и классы дизайна,
 * линтеры текстов и безопасности. Ошибка (error) валит сборку, предупреждение (warning) — нет.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ContentBundle } from '../../src/core/content-model/types.ts';
import { checkEquation } from './equation.ts';

export interface Issue {
  level: 'error' | 'warning';
  where: string;
  message: string;
}

const ROOT = join(import.meta.dirname, '..', '..');

function designManifest(): { assets: Set<string>; icons: Set<string> } {
  const m = JSON.parse(readFileSync(join(ROOT, 'design', 'assets', 'manifest.json'), 'utf8')) as Record<string, unknown>;
  const assets = new Set<string>();
  for (const [kind, list] of Object.entries(m)) {
    if (Array.isArray(list)) for (const name of list) assets.add(`${kind}/${String(name)}`);
  }
  const icons = new Set(Object.keys((m['icons'] ?? {}) as Record<string, string>));
  return { assets, icons };
}

function designFxClasses(): Set<string> {
  const css = readFileSync(join(ROOT, 'design', 'components', 'effects.css'), 'utf8');
  return new Set([...css.matchAll(/\.(fx-[a-z-]+)/g)].map((m) => m[1] ?? ''));
}

const FORMULA = /\b(?:[A-Z][a-z]?\d*){2,}\b/;
const GENDERED = /(?:^|[^а-яё])(нашёл|нашла|сделал|сделала|смог|смогла|понял|поняла|увидел|увидела|проверил|проверила)(?:[^а-яё]|$)/i;
const NUMBER_WITH_UNIT = /\d+\s*(г\b|мл|%|°|капл|порц|ложк)/i;

function lintChildText(where: string, text: string | undefined, issues: Issue[]): void {
  if (!text) return;
  if (FORMULA.test(text)) issues.push({ level: 'error', where, message: `формула в тексте для ребёнка: «${text}»` });
  if (GENDERED.test(text)) issues.push({ level: 'warning', where, message: `родовая форма обращения: «${text}»` });
  for (const sentence of text.split(/[.!?…]+/)) {
    const words = sentence.trim().split(/\s+/).filter(Boolean).length;
    if (words > 16) issues.push({ level: 'warning', where, message: `длинное предложение (${words} слов): «${sentence.trim()}»` });
  }
}

export function validateBundle(b: ContentBundle, _source: unknown): Issue[] {
  const issues: Issue[] = [];
  const err = (where: string, message: string): void => void issues.push({ level: 'error', where, message });

  const uniq = (kind: string, ids: string[]): Set<string> => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) err(kind, `повтор id ${id}`);
      seen.add(id);
    }
    return seen;
  };
  const classIds = uniq('classes', b.classes.map((c) => c.id));
  const speciesIds = uniq('species', b.species.map((s) => s.id));
  const substanceIds = uniq('substances', b.substances.map((s) => s.id));
  const equipmentIds = uniq('equipment', b.equipment.map((e) => e.id));
  const ruleIds = uniq('rules', [...b.rules.map((r) => r.id), ...b.noReactions.map((r) => r.id)]);
  const { assets, icons } = designManifest();
  const fxClasses = designFxClasses();

  for (const c of b.classes) for (const inc of c.includes) if (!classIds.has(inc)) err(`classes.${c.id}`, `нет класса ${inc}`);
  const speciesById = new Map(b.species.map((s) => [s.id, s]));
  for (const s of b.species) {
    for (const c of s.classes) if (!classIds.has(c)) err(`species.${s.id}`, `нет класса ${c}`);
    if (s.acidBase?.role === 'conjugate_base' && !speciesIds.has(s.acidBase.of)) err(`species.${s.id}`, `нет частицы ${s.acidBase.of}`);
    lintChildText(`species.${s.id}.discoverable`, s.discoverable?.text, issues);
  }
  for (const s of b.substances) {
    const sum = s.composition.reduce((a, c) => a + c.massFraction, 0);
    if (Math.abs(sum - 1) > 0.001) err(`substances.${s.id}`, `сумма долей состава ${sum.toFixed(4)} ≠ 1`);
    for (const c of s.composition) if (!speciesIds.has(c.species)) err(`substances.${s.id}`, `нет частицы ${c.species}`);
    if (s.dosing !== 'portion_solid' && !s.density) err(`substances.${s.id}`, 'у жидкости нет плотности');
    for (const t of [s.card.looks, s.card.foundAt, s.card.warning, ...s.card.properties]) lintChildText(`substances.${s.id}.card`, t, issues);
  }
  for (const e of b.equipment) if (!assets.has(e.asset)) err(`equipment.${e.id}`, `нет ассета ${e.asset} в design/assets/manifest.json`);

  const checkMatch = (where: string, m: { species?: string | undefined; class?: string | undefined; notClass?: string[] | undefined }): void => {
    if (m.species && !speciesIds.has(m.species)) err(where, `нет частицы ${m.species}`);
    if (m.class && !classIds.has(m.class)) err(where, `нет класса ${m.class}`);
    for (const c of m.notClass ?? []) if (!classIds.has(c)) err(where, `нет класса ${c}`);
  };
  for (const r of b.rules) {
    const where = `rules.${r.id}`;
    const binds = new Set(r.when.reactants.map((x) => x.bind));
    r.when.reactants.forEach((x) => checkMatch(where, x.match));
    (r.when.absent ?? []).forEach((m) => checkMatch(where, m));
    if ('bind' in r.effect && !binds.has(r.effect.bind)) err(where, `effect.bind ${r.effect.bind} не объявлен в reactants`);
    if (r.effect.type === 'transform' && !speciesIds.has(r.effect.to)) err(where, `нет частицы ${r.effect.to}`);
    if (r.effect.type === 'react' && !r.variants?.length) err(where, 'у реакции нет вариантов');
    for (const v of r.variants ?? []) {
      for (const [bind, sp] of Object.entries(v.bind)) {
        if (!binds.has(bind)) err(`${where}.${v.id}`, `привязка ${bind} не объявлена`);
        if (!speciesIds.has(sp)) err(`${where}.${v.id}`, `нет частицы ${sp}`);
      }
      for (const p of v.products) if (!speciesIds.has(p.species)) err(`${where}.${v.id}`, `нет продукта ${p.species}`);
      for (const x of [...v.reactants.map((q) => v.bind[q.bind]), ...v.products.map((p) => p.species)]) {
        if (x && speciesById.get(x)?.molarMass == null) err(`${where}.${v.id}`, `у ${x} нет молярной массы для стехиометрии`);
      }
      const eq = checkEquation(v.equation);
      if (!eq.ok) err(`${where}.${v.id}`, `уравнение: ${eq.reason}`);
    }
    lintChildText(`${where}.what`, r.text.what, issues);
    lintChildText(`${where}.why`, r.text.why, issues);
    lintChildText(`${where}.deeper`, r.text.deeper, issues);
    lintChildText(`${where}.line`, r.line, issues);
    if (r.kind === 'hazard_stop') {
      if (r.effect.type !== 'stop') err(where, 'стоп-правило должно иметь effect: stop');
      if (r.priority < 1000) err(where, 'приоритет стоп-правила должен быть ≥ 1000');
      for (const t of [r.text.what, r.text.why, r.text.deeper]) {
        if (t && NUMBER_WITH_UNIT.test(t)) err(where, `количества в тексте стоп-правила запрещены: «${t}»`);
      }
    }
  }
  for (const n of b.noReactions) {
    n.when.reactants.forEach((x) => checkMatch(`noReactions.${n.id}`, x.match));
    lintChildText(`noReactions.${n.id}.why`, n.text.why, issues);
  }
  for (const e of b.effects) {
    for (const c of e.fxClasses) if (!fxClasses.has(c)) err(`effects.${e.id}`, `нет класса .${c} в design/components/effects.css`);
    if (!icons.has(e.icon)) err(`effects.${e.id}`, `нет иконки ${e.icon}`);
  }
  for (const m of b.missions) {
    const where = `missions.${m.id}`;
    if (m.jars.length !== m.unknowns.length) err(where, 'число банок и неизвестных веществ различается');
    for (const s of [...m.unknowns, ...m.helpers]) if (!substanceIds.has(s)) err(where, `нет вещества ${s}`);
    for (const e of m.equipment) if (!equipmentIds.has(e)) err(where, `нет оборудования ${e}`);
    const testIds = new Set(m.tests.map((t) => t.id));
    for (const t of m.tests) {
      if (t.reagent && !substanceIds.has(t.reagent)) err(where, `нет реагента ${t.reagent}`);
      for (const c of t.chips) {
        if (!icons.has(c.icon)) err(`${where}.${t.id}.${c.id}`, `нет иконки ${c.icon}`);
        for (const mm of c.match) for (const id of [mm.ruleId, ...(mm.reasonIds ?? [])]) if (id && !ruleIds.has(id)) err(`${where}.${t.id}.${c.id}`, `нет правила ${id}`);
      }
    }
    for (const u of m.unknowns) {
      const sig = m.signatures[u];
      if (!sig) err(where, `нет подписи для ${u}`);
      else for (const [test, chip] of Object.entries(sig)) {
        const t = m.tests.find((x) => x.id === test);
        if (!t) err(where, `подпись ${u}: нет проверки ${test}`);
        else if (!t.chips.some((c) => c.id === chip)) err(where, `подпись ${u}: нет чипа ${chip} в проверке ${test}`);
      }
    }
    for (const p of m.solutionPaths) for (const t of p.order) if (!testIds.has(t)) err(where, `путь ${p.id}: нет проверки ${t}`);
    for (const t of m.intro) lintChildText(`${where}.intro`, t, issues);
  }
  for (const s of [...b.sandbox.substances]) if (!substanceIds.has(s)) err('sandbox', `нет вещества ${s}`);
  for (const e of b.sandbox.equipment) if (!equipmentIds.has(e)) err('sandbox', `нет оборудования ${e}`);
  for (const [k, v] of Object.entries(b.strings)) lintChildText(`strings.${k}`, v, issues);
  return issues;
}
