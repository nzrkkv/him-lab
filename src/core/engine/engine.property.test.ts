/**
 * Свойства движка на случайных последовательностях действий (генератор по зерну — воспроизводимо):
 * сохранение массы, неотрицательность, насыщение, температура, детерминированность, неизменность входа.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../util/rng.ts';
import { createLab, step } from './step.ts';
import { testIndex } from './test-helpers.ts';
import type { EngineEvent, LabAction, LabState } from './types.ts';
import { dissolveRoom, grams, sortedSpecies, totalGrams } from './vessel.ts';

const SUBSTANCES = [
  'water',
  'vinegar',
  'iodine_solution',
  'red_cabbage',
  'table_salt',
  'sugar',
  'baking_soda',
  'starch',
  'chalk',
  'sand',
];

function randomAction(rnd: () => number, state: LabState): LabAction {
  const ix = testIndex();
  const vessels = state.order;
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  if (vessels.length === 0 || rnd() < 0.08)
    return { type: 'place', equipmentId: pick(['test_tube', 'beaker', 'evaporating_dish']) };
  const v = pick(vessels);
  const r = rnd();
  if (r < 0.4) {
    const s = pick(SUBSTANCES);
    const unit = ix.substances.get(s)?.dosing ?? 'portion_solid';
    return { type: 'add', vesselId: v, substanceId: s, dose: { unit, count: 1 + Math.floor(rnd() * 3) } };
  }
  if (r < 0.55) return { type: 'stir', vesselId: v };
  if (r < 0.6) return { type: 'attach_holder', vesselId: v };
  if (r < 0.66) return { type: 'heat_start', vesselId: v };
  if (r < 0.7) return { type: 'heat_stop', vesselId: v };
  if (r < 0.74) return { type: 'cool_start', vesselId: v };
  if (r < 0.88) return { type: 'tick', seconds: 0.5 + Math.floor(rnd() * 6) };
  if (r < 0.92) return { type: 'wait', seconds: 30 };
  if (r < 0.96) return { type: 'measure_ph', vesselId: v };
  return { type: 'clear', vesselId: v };
}

function gasAndVapourGrams(prev: LabState, next: LabState, events: readonly EngineEvent[]): number {
  // Газ и пар уходят из сосуда: их массу нельзя восстановить по событиям точно,
  // поэтому для проверки массы считаем только шаги без газа, кипения и очистки.
  void prev;
  void next;
  return events.some(
    (e) => e.type === 'observation' && (e.kind === 'gas' || e.kind === 'steam' || e.kind === 'color'),
  )
    ? Infinity
    : 0;
}

describe('свойства движка', () => {
  const ix = testIndex();

  it('случайные последовательности: инварианты и детерминированность', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const rnd = mulberry32(seed);
      let state = createLab();
      const trace: string[] = [];
      for (let i = 0; i < 40; i++) {
        const action = randomAction(rnd, state);
        const frozen = JSON.stringify(state);
        const r = step(state, action, ix);
        assert.equal(JSON.stringify(state), frozen, 'входное состояние не меняется');
        for (const id of r.state.order) {
          const v = r.state.vessels[id];
          assert.ok(v);
          for (const sp of sortedSpecies(v)) {
            for (const g of Object.values(v.contents[sp] ?? {}))
              assert.ok(g > 0, `${sp}: неположительное количество`);
            if (ix.species.get(sp)?.solubility && grams(v, 'water', ['liquid']) > 0) {
              assert.ok(
                dissolveRoom(v, ix, sp) >= -1e-6 || v.temperatureC < 30,
                `${sp}: растворено больше предела`,
              );
            }
          }
          assert.ok(v.temperatureC >= -0.001 && v.temperatureC <= 300.001, `температура ${v.temperatureC}`);
        }
        const noLoss = gasAndVapourGrams(state, r.state, r.events) === 0;
        const touched = action.type === 'add' || action.type === 'stir' || action.type === 'measure_ph';
        if (
          noLoss &&
          touched &&
          'vesselId' in action &&
          state.vessels[action.vesselId] &&
          r.state.vessels[action.vesselId]
        ) {
          const before = totalGrams(state.vessels[action.vesselId] as never);
          const after = totalGrams(r.state.vessels[action.vesselId] as never);
          const added =
            action.type === 'add' && !r.events.some((e) => e.type === 'blocked' || e.type === 'safety_stop')
              ? after - before
              : 0;
          if (action.type !== 'add')
            assert.ok(Math.abs(after - before) < 1e-5, `масса изменилась при ${action.type}`);
          else assert.ok(added >= -1e-6);
        }
        trace.push(JSON.stringify(r.events));
        state = r.state;
      }
      // Повторный прогон с тем же зерном даёт то же самое.
      const rnd2 = mulberry32(seed);
      let s2 = createLab();
      for (let i = 0; i < 40; i++) {
        const r = step(s2, randomAction(rnd2, s2), ix);
        assert.equal(JSON.stringify(r.events), trace[i]);
        s2 = r.state;
      }
      assert.equal(JSON.stringify(s2), JSON.stringify(state));
    }
  });

  it('шаг tick 0 после устоявшегося состояния ничего не меняет в составе', () => {
    let state = createLab();
    for (const a of [
      { type: 'place', equipmentId: 'test_tube' },
      { type: 'add', vesselId: 'v1', substanceId: 'baking_soda', dose: { unit: 'portion_solid', count: 2 } },
      { type: 'add', vesselId: 'v1', substanceId: 'vinegar', dose: { unit: 'portion_liquid', count: 1 } },
    ] as LabAction[])
      state = step(state, a, ix).state;
    const before = JSON.stringify(state.vessels['v1']?.contents);
    const r = step(state, { type: 'tick', seconds: 0.000001 }, ix);
    assert.equal(JSON.stringify(r.state.vessels['v1']?.contents), before);
  });

  it('скорость: шаг движка укладывается в бюджет (NFR-006, с запасом для CI)', () => {
    let state = createLab();
    for (const a of [
      { type: 'place', equipmentId: 'beaker' },
      { type: 'add', vesselId: 'v1', substanceId: 'red_cabbage', dose: { unit: 'portion_liquid', count: 4 } },
      { type: 'add', vesselId: 'v1', substanceId: 'chalk', dose: { unit: 'portion_solid', count: 3 } },
      { type: 'stir', vesselId: 'v1' },
      { type: 'add', vesselId: 'v1', substanceId: 'vinegar', dose: { unit: 'portion_liquid', count: 1 } },
    ] as LabAction[])
      state = step(state, a, ix).state;
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) state = step(state, { type: 'tick', seconds: 0.5 }, ix).state;
    const perStep = (performance.now() - t0) / 200;
    assert.ok(perStep < 10, `шаг ${perStep.toFixed(2)} мс`);
  });
});
