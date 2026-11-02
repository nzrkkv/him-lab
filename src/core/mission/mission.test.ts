import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLab, step } from '../engine/step.ts';
import { expand, testIndex, type ShortAction } from '../engine/test-helpers.ts';
import type { Mission } from '../content-model/types.ts';
import {
  beginExperiments,
  checkLabels,
  currentSituation,
  placeLabel,
  recordEvents,
  requestHint,
  startMission,
  washHands,
  type MissionState,
} from './mission.ts';

function mission(): Mission {
  const m = testIndex().bundle.missions.find((x) => x.id === 'powder_mystery');
  if (!m) throw new Error('нет миссии');
  return m;
}

/** Стандартный опыт для проверки, как его сделал бы ребёнок. */
function script(test: string, s: string): ShortAction[] {
  const v = 'v1';
  switch (test) {
    case 'magnify':
      return [{ magnify_substance: s }];
    case 'water':
      return [
        { place: 'test_tube' },
        { add: { v, s, n: 1 } },
        { add: { v, s: 'water', n: 2 } },
        { stir: { v, times: 3 } },
      ];
    case 'vinegar':
      return [{ place: 'test_tube' }, { add: { v, s, n: 1 } }, { add: { v, s: 'vinegar', n: 1 } }];
    case 'iodine':
      return [{ place: 'test_tube' }, { add: { v, s, n: 1 } }, { add: { v, s: 'iodine_solution', n: 1 } }];
    default:
      return [
        { place: 'test_tube' },
        { add: { v, s, n: 1 } },
        { holder: v },
        { heat_start: v },
        { tick: 40 },
        { heat_stop: v },
      ];
  }
}

/** Прогоняет опыт через движок и доску; возвращает чип проверки для банки с веществом s. */
function chipFor(def: Mission, m0: MissionState, test: string, s: string): string | undefined {
  const ix = testIndex();
  let lab = createLab();
  let m = beginExperiments(m0);
  for (const a of script(test, s)) {
    for (const action of expand(ix, a)) {
      const r = step(lab, action, ix);
      lab = r.state;
      m = recordEvents(def, m, lab, action, r.events).mission;
    }
  }
  const jar = Object.entries(m.jarSubstance).find(([, x]) => x === s)?.[0] as string;
  return m.board[jar]?.[test];
}

describe('миссия «Загадка белых порошков»', () => {
  const def = mission();
  const m0 = startMission(def, 42);

  it('раскладка банок зависит только от зерна', () => {
    assert.deepEqual(startMission(def, 42).jarSubstance, m0.jarSubstance);
    assert.notDeepEqual(startMission(def, 7).jarSubstance, m0.jarSubstance);
    assert.deepEqual(Object.values(m0.jarSubstance).sort(), [...def.unknowns].sort());
  });

  it('подписи банок из данных совпадают с результатами движка', () => {
    for (const s of def.unknowns) {
      for (const t of def.tests) {
        assert.equal(chipFor(def, m0, t.id, s), def.signatures[s]?.[t.id], `${s} × ${t.id}`);
      }
    }
  });

  it('ни одна проверка в одиночку не различает все пять порошков', () => {
    for (const t of def.tests) {
      const chips = new Set(def.unknowns.map((s) => def.signatures[s]?.[t.id]));
      assert.ok(chips.size < def.unknowns.length, t.id);
    }
  });

  it('оба пути решения из урока различают все банки', () => {
    for (const path of def.solutionPaths) {
      const tuples = new Set(
        def.unknowns.map((s) => path.order.map((t) => def.signatures[s]?.[t]).join('|')),
      );
      assert.equal(tuples.size, def.unknowns.length, path.id);
    }
  });

  it('подсказки: сначала «начни с воды», уровни растут до третьего', () => {
    let m = beginExperiments(m0);
    assert.equal(currentSituation(def, m).situation, 'start');
    let r = requestHint(def, m);
    assert.equal(r.hint.level, 1);
    r = requestHint(def, r.mission);
    r = requestHint(def, r.mission);
    r = requestHint(def, r.mission);
    assert.equal(r.hint.level, 3);
    m = r.mission;
    // После проверки водой всех банок — ситуация «две нерастворившиеся».
    const board: MissionState['board'] = {};
    for (const [jar, s] of Object.entries(m.jarSubstance))
      board[jar] = { water: def.signatures[s]?.['water'] as string };
    m = { ...m, board, journal: [{ id: 1, jar: 'А', test: 'water', chip: 'dissolved' }] };
    assert.equal(currentSituation(def, m).situation, 'two_insoluble');
  });

  it('проверка: противоречие, нет данных и победа', () => {
    let m = beginExperiments(m0);
    const [jarA, sA] = Object.entries(m.jarSubstance)[0] as [string, string];
    const wrong = def.unknowns.find((s) => s !== sA) as string;
    // Нет данных.
    m = placeLabel(m, jarA, wrong);
    let c = checkLabels(def, m);
    assert.equal(c.results.find((x) => x.jar === jarA)?.status, def.signatures[wrong] && 'no_data');
    // Есть противоречащее наблюдение.
    const contradicting = def.tests.find((t) => def.signatures[sA]?.[t.id] !== def.signatures[wrong]?.[t.id]);
    assert.ok(contradicting);
    m = {
      ...c.mission,
      board: {
        ...c.mission.board,
        [jarA]: { [contradicting.id]: def.signatures[sA]?.[contradicting.id] as string },
      },
    };
    c = checkLabels(def, m);
    assert.equal(c.results.find((x) => x.jar === jarA)?.status, 'contradiction');
    // Все верно → мытьё рук → миссия пройдена.
    for (const [jar, s] of Object.entries(m.jarSubstance)) m = placeLabel(m, jar, s);
    c = checkLabels(def, m);
    assert.equal(c.allCorrect, true);
    assert.equal(c.mission.status, 'wrap_up');
    assert.equal(washHands(c.mission).status, 'completed');
  });

  it('третье нажатие «Проверить» без изменений — реплика «то же самое»', () => {
    let m = placeLabel(beginExperiments(m0), 'А', 'starch');
    const flags: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      const c = checkLabels(def, m);
      flags.push(c.sameAgain);
      m = c.mission;
    }
    assert.deepEqual(flags, [false, false, true]);
  });

  it('смесь двух банок в одной пробирке не попадает на доску', () => {
    const ix = testIndex();
    let lab = createLab();
    let m = beginExperiments(m0);
    let mixed = false;
    const [s1, s2] = def.unknowns as [string, string];
    for (const a of [
      { place: 'test_tube' },
      { add: { v: 'v1', s: s1, n: 1 } },
      { add: { v: 'v1', s: s2, n: 1 } },
      { add: { v: 'v1', s: 'vinegar', n: 1 } },
    ] as ShortAction[]) {
      for (const action of expand(ix, a)) {
        const r = step(lab, action, ix);
        lab = r.state;
        const rec = recordEvents(def, m, lab, action, r.events);
        m = rec.mission;
        mixed ||= rec.mixed;
      }
    }
    assert.equal(mixed, true);
    assert.equal(m.journal.length, 0);
  });
});
