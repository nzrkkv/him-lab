import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { testIndex } from '../engine/test-helpers.ts';
import { createLab, step } from '../engine/step.ts';
import type { LessonBlock, Question } from '../content-model/types.ts';
import { blockDone, gradeChoice, gradePair, placeCard, screenDone, testScore } from './lesson.ts';

const lesson = (): NonNullable<ReturnType<typeof testIndex>['bundle']['lessons'][number]> => {
  const l = testIndex().bundle.lessons.find((x) => x.id === 'm1_l01');
  if (!l) throw new Error('нет урока');
  return l;
};
const ctx = { missionCompleted: () => false };

describe('урок 1: данные и логика', () => {
  it('порядок этапов по шаблону: крючок → попробуй → разбираемся → миссия → тест → дома → награда', () => {
    const l = lesson();
    const order = l.stages.map((s) => s.id);
    const seen = l.screens.map((s) => order.indexOf(s.stage));
    assert.deepEqual(
      [...seen].sort((a, b) => a - b),
      seen,
    );
    assert.deepEqual([...new Set(l.screens.map((s) => s.stage))], order);
  });

  it('экран с интерактивом не проходится без ответа, проходится с верным', () => {
    const r1 = lesson().screens.find((s) => s.id === 'r1');
    assert.ok(r1);
    assert.equal(screenDone(r1, {}, ctx), false);
    const sort = r1.blocks.find((b) => b.type === 'sort') as Extract<LessonBlock, { type: 'sort' }>;
    const placed = Object.fromEntries(sort.cards.map((c) => [c.id, c.shelf]));
    assert.equal(
      screenDone(r1, { r1_sort: placed, r1_q: { picked: ['no'] } }, ctx),
      false,
      'неверный ответ на мини-вопрос',
    );
    assert.equal(screenDone(r1, { r1_sort: placed, r1_q: { picked: ['no', 'yes'] } }, ctx), true);
  });

  it('сортировка: ошибка объясняется, карточка не встаёт', () => {
    const cards = [{ id: 'sugar', shelf: 'substance', wrong: 'У сахара нет своей формы.' }];
    assert.deepEqual(placeCard(cards, {}, 'sugar', 'object'), {
      placed: {},
      ok: false,
      explain: 'У сахара нет своей формы.',
    });
    assert.equal(placeCard(cards, {}, 'sugar', 'substance').ok, true);
  });

  it('тест: 10 вопросов разных типов, у каждого неверного ответа есть объяснение', () => {
    const qs = lesson().test.questions;
    assert.equal(qs.length, 10);
    assert.deepEqual([...new Set(qs.map((q) => q.type))].sort(), [
      'match',
      'multi',
      'predict',
      'single',
      'sort',
    ]);
  });

  it('проверка ответов: один, несколько, частично, сопоставление', () => {
    const qs = lesson().test.questions;
    const t2 = qs.find((q) => q.id === 't2') as Extract<Question, { type: 'single' }>;
    assert.equal(gradeChoice(t2, ['c']).kind, 'right');
    assert.equal(gradeChoice(t2, ['a']).kind, 'wrong');
    const t8 = qs.find((q) => q.id === 't8') as Extract<Question, { type: 'multi' }>;
    assert.equal(gradeChoice(t8, ['a']).kind, 'partial');
    assert.equal(gradeChoice(t8, ['a', 'b']).kind, 'right');
    assert.equal(gradeChoice(t8, ['a', 'c']).kind, 'wrong');
    const t5 = qs.find((q) => q.id === 't5') as Extract<Question, { type: 'match' }>;
    assert.equal(gradePair(t5, 'lens', 'lens').ok, true);
    assert.equal(gradePair(t5, 'lens', 'rod').ok, false);
    assert.deepEqual(testScore(qs, { t2: true, t5: false }), { count: 1, total: 10 });
  });

  it('мини-опыты урока дают на движке ожидаемые результаты', () => {
    const ix = testIndex();
    const p1 = lesson().screens.find((s) => s.id === 'p1');
    const lab = p1?.blocks.find((b) => b.type === 'lab') as Extract<LessonBlock, { type: 'lab' }>;
    let st = createLab();
    for (const v of lab.vessels) {
      st = step(st, { type: 'place', equipmentId: 'test_tube' }, ix).state;
      const id = st.order[st.order.length - 1] as string;
      for (const c of v.contents) {
        const unit = ix.substances.get(c.substance)?.dosing ?? 'portion_solid';
        st = step(
          st,
          { type: 'add', vesselId: id, substanceId: c.substance, dose: { unit, count: c.n } },
          ix,
        ).state;
      }
    }
    const r1 = step(
      st,
      { type: 'add', vesselId: 'v1', substanceId: 'vinegar', dose: { unit: 'portion_liquid', count: 1 } },
      ix,
    );
    assert.ok(r1.events.some((e) => e.type === 'nothing_happened' && e.reasonId === 'nr_salt_acid'));
    const r2 = step(
      r1.state,
      { type: 'add', vesselId: 'v2', substanceId: 'vinegar', dose: { unit: 'portion_liquid', count: 1 } },
      ix,
    );
    assert.ok(r2.events.some((e) => e.type === 'observation' && e.kind === 'gas'));
  });

  it('миссия в уроке засчитывается по прогрессу миссии', () => {
    const b: LessonBlock = { type: 'mission', missionId: 'powder_mystery' };
    assert.equal(blockDone(b, {}, ctx), false);
    assert.equal(blockDone(b, {}, { missionCompleted: (id) => id === 'powder_mystery' }), true);
  });
});
