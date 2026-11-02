/**
 * Логика урока без DOM: когда экран можно пройти, проверка ответов теста.
 * Ответы хранятся в прогрессе по id блока или вопроса (docs/spec/04-engine-and-content.md, раздел 8).
 */
import type { LessonBlock, LessonScreen, Question } from '../content-model/types.ts';

export interface ChoiceAnswer {
  picked: string[];
}
export type SortAnswer = Record<string, string>;
export interface LessonContext {
  missionCompleted: (missionId: string) => boolean;
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

export function choicePicked(answers: Record<string, unknown>, id: string): string[] {
  const a = answers[id];
  return isObj(a) && Array.isArray(a['picked']) ? (a['picked'] as string[]) : [];
}

/** Блок пройден? Текстовые блоки — сразу; интерактивы — по ответам. */
export function blockDone(b: LessonBlock, answers: Record<string, unknown>, ctx: LessonContext): boolean {
  switch (b.type) {
    case 'choice': {
      const picked = choicePicked(answers, b.id);
      const correct = b.options.filter((o) => o.correct).map((o) => o.id);
      return correct.length ? picked.some((p) => correct.includes(p)) : picked.length > 0;
    }
    case 'predict':
      return typeof answers[b.id] === 'string';
    case 'goggles':
      return answers['goggles'] === true;
    case 'sort': {
      const placed = (answers[b.id] ?? {}) as SortAnswer;
      return b.cards.every((c) => placed[c.id] === c.shelf);
    }
    case 'lab': {
      const done = (answers[b.id] ?? []) as string[];
      return b.actions.every((a) => done.includes(a.id));
    }
    case 'spot': {
      const found = (answers[b.id] ?? []) as string[];
      return b.cards.filter((c) => c.mistake).every((c) => found.includes(c.id));
    }
    case 'mission':
      return ctx.missionCompleted(b.missionId);
    case 'test':
      return answers['test_done'] === true;
    default:
      return true;
  }
}

export function screenDone(sc: LessonScreen, answers: Record<string, unknown>, ctx: LessonContext): boolean {
  return sc.blocks.every((b) => blockDone(b, answers, ctx));
}

/** Сортировка: карточка на полке — верно или объяснение ошибки. */
export function placeCard(
  cards: ReadonlyArray<{ id: string; shelf: string; wrong: string }>,
  placed: SortAnswer,
  cardId: string,
  shelfId: string,
): { placed: SortAnswer; ok: boolean; explain: string | null } {
  const card = cards.find((c) => c.id === cardId);
  if (!card) return { placed, ok: false, explain: null };
  if (card.shelf !== shelfId) return { placed, ok: false, explain: card.wrong };
  return { placed: { ...placed, [cardId]: shelfId }, ok: true, explain: null };
}

export type Verdict =
  | { kind: 'right'; explain: string[] }
  | { kind: 'wrong'; explain: string[] }
  | { kind: 'partial'; explain: string[] };

/** Проверка ответа на вопрос с выбором (один, «предскажи», несколько). */
export function gradeChoice(
  q: Extract<Question, { type: 'single' | 'predict' | 'multi' }>,
  picked: readonly string[],
): Verdict {
  const chosen = q.options.filter((o) => picked.includes(o.id));
  const wrong = chosen.filter((o) => !o.correct);
  if (wrong.length) return { kind: 'wrong', explain: wrong.map((o) => o.explain) };
  const allCorrect = q.options.filter((o) => o.correct);
  if (q.type === 'multi' && chosen.length < allCorrect.length)
    return { kind: 'partial', explain: [q.partial, ...chosen.map((o) => o.explain)] };
  return { kind: chosen.length ? 'right' : 'wrong', explain: chosen.map((o) => o.explain) };
}

/** Сопоставление: верна ли пара «левый — правый». */
export function gradePair(
  q: Extract<Question, { type: 'match' }>,
  leftId: string,
  rightId: string,
): { ok: boolean; explain: string } {
  const pair = q.pairs.find((p) => p.id === leftId);
  if (!pair) return { ok: false, explain: '' };
  return { ok: leftId === rightId, explain: pair.wrong };
}

/** Итог теста: верно с первой попытки. */
export function testScore(
  questions: readonly Question[],
  first: Record<string, boolean>,
): { count: number; total: number } {
  return { count: questions.filter((q) => first[q.id] === true).length, total: questions.length };
}
