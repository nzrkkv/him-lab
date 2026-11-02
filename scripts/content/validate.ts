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
// Родовое обращение к ребёнку: «ты нашёл», «ты сделала» (третье лицо — «йод нашёл» — допустимо).
const GENDERED = /(?:^|[^а-яё])ты\s+(нашёл|нашла|сделал|сделала|смог|смогла|понял|поняла|увидел|увидела|проверил|проверила)(?:[^а-яё]|$)/i;
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
  const missionIds = new Set(b.missions.map((m) => m.id));
  for (const l of b.lessons) {
    const where = `lessons.${l.id}`;
    const stages = l.stages.map((st) => st.id);
    let lastStage = 0;
    const blockTypes = new Set<string>();
    for (const sc of l.screens) {
      const w = `${where}.${sc.id}`;
      const si = stages.indexOf(sc.stage);
      if (si < 0) err(w, `нет этапа ${sc.stage}`);
      if (si < lastStage) err(w, `этап ${sc.stage} идёт раньше предыдущего: шаблон «сначала опыт, потом объяснение»`);
      lastStage = Math.max(lastStage, si);
      for (const id of sc.sci ?? []) if (!substanceIds.has(id)) err(w, `нет вещества ${id}`);
      for (const t of [sc.lead, sc.next, ...(sc.guide?.lines ?? []), ...(sc.deeper?.body ?? [])]) lintChildText(w, t, issues);
      const predicts = new Set(sc.blocks.flatMap((bl) => (bl.type === 'predict' ? [bl.id] : [])));
      for (const bl of sc.blocks) {
        blockTypes.add(bl.type);
        if (bl.type === 'choice') {
          for (const o of bl.options) lintChildText(`${w}.${bl.id}`, o.reply, issues);
        } else if (bl.type === 'sort') {
          const shelves = new Set(bl.shelves.map((x) => x.id));
          for (const c of bl.cards) if (!shelves.has(c.shelf)) err(`${w}.${bl.id}`, `нет полки ${c.shelf}`);
        } else if (bl.type === 'lab') {
          for (const v of bl.vessels) for (const x of v.contents) if (!substanceIds.has(x.substance)) err(`${w}.${bl.id}`, `нет вещества ${x.substance}`);
          for (const a of bl.actions) {
            if (a.vessel >= bl.vessels.length) err(`${w}.${bl.id}`, `действие ${a.id}: нет сосуда ${a.vessel}`);
            if (a.add && !substanceIds.has(a.add)) err(`${w}.${bl.id}`, `нет вещества ${a.add}`);
            if (!a.add && !a.stir && !a.magnify && !a.smell) err(`${w}.${bl.id}`, `действие ${a.id} ничего не делает`);
          }
          if (bl.predict && !predicts.has(bl.predict.from)) err(`${w}.${bl.id}`, `нет предсказания ${bl.predict.from} на экране`);
        } else if (bl.type === 'mission' && !missionIds.has(bl.missionId)) err(w, `нет миссии ${bl.missionId}`);
        else if (bl.type === 'spot' && !bl.cards.some((c) => c.mistake)) err(w, 'в «найди ошибки» нет ни одной ошибки');
      }
    }
    for (const need of ['lab', 'mission', 'test', 'home', 'reward']) if (!blockTypes.has(need)) err(where, `в уроке нет обязательного блока ${need}`);
    for (const q of l.test.questions) {
      const w = `${where}.test.${q.id}`;
      if (q.type === 'single' || q.type === 'predict') {
        if (q.options.filter((o) => o.correct).length !== 1) err(w, 'нужен ровно один верный ответ');
      } else if (q.type === 'multi') {
        if (q.options.filter((o) => o.correct).length < 2) err(w, 'в вопросе с несколькими ответами нужно 2+ верных');
      } else if (q.type === 'sort') {
        const shelves = new Set(q.shelves.map((x) => x.id));
        for (const c of q.cards) if (!shelves.has(c.shelf)) err(w, `нет полки ${c.shelf}`);
      }
      lintChildText(w, q.prompt, issues);
    }
    if (l.test.questions.length < 10) issues.push({ level: 'warning', where, message: `в тесте ${l.test.questions.length} вопросов (ориентир 10)` });
    // Грубая оценка: чтение базовых текстов экранов (без «копнуть глубже» и домашнего опыта) + интерактивы.
    const visible = l.screens.map((sc) => ({ ...sc, deeper: undefined }));
    const words = JSON.stringify(visible).replace(/"[a-z_]+":/g, ' ').split(/\s+/).length;
    const minutes = words / 110 + l.screens.length * 0.3 + l.test.questions.length * 0.2;
    if (minutes > l.minutes * 1.4) issues.push({ level: 'warning', where, message: `оценка длительности ${minutes.toFixed(0)} мин` });
  }
  const lessonIds = new Set(b.lessons.map((l) => l.id));
  for (const m of b.modules) for (const l of m.lessons) if (m.order === 1 && l.id === 'm1_l01' && !lessonIds.has(l.id)) err('modules', `нет урока ${l.id}`);
  const lessonOrMission = new Set([...b.lessons.map((l) => l.id), ...b.missions.map((m) => m.id)]);
  for (const s of [...b.sandbox.starter, ...b.sandbox.unlocks.flatMap((u) => u.substances)]) if (!substanceIds.has(s)) err('sandbox', `нет вещества ${s}`);
  for (const u of b.sandbox.unlocks) if (!lessonOrMission.has(u.by)) err('sandbox', `открытие за неизвестное ${u.by}`);
  const allSandbox = [...b.sandbox.starter, ...b.sandbox.unlocks.flatMap((u) => u.substances)];
  if (new Set(allSandbox).size !== allSandbox.length) err('sandbox', 'вещество открывается дважды');
  for (const e of b.sandbox.equipment) if (!equipmentIds.has(e)) err('sandbox', `нет оборудования ${e}`);
  for (const [k, v] of Object.entries(b.strings)) lintChildText(`strings.${k}`, v, issues);
  return issues;
}
