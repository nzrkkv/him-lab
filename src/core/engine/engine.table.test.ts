/**
 * Табличные тесты движка: content/tests/engine/*.yaml.
 * Каждая запись: действия → ожидаемые события и состояние сосудов.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'yaml';
import { run, testIndex, type ShortAction } from './test-helpers.ts';
import { grams } from './vessel.ts';
import type { EngineEvent } from './types.ts';

type ValueMatcher =
  | number
  | string
  | boolean
  | { approx: number; tol?: number }
  | { gt: number }
  | { lt: number }
  | { between: [number, number] };

interface Case {
  id: string;
  rules?: string[];
  actions: ShortAction[];
  expect: {
    events?: { include?: Record<string, unknown>[]; exclude?: Record<string, unknown>[] };
    vessels?: Record<
      string,
      {
        grams?: Record<string, ValueMatcher>;
        phases?: Record<string, Record<string, ValueMatcher>>;
        [k: string]: unknown;
      }
    >;
    fumeHoodOn?: boolean;
  };
}

const DIR = join(import.meta.dirname, '..', '..', '..', 'content', 'tests', 'engine');

function matchValue(actual: unknown, m: ValueMatcher): boolean {
  if (typeof m !== 'object') return actual === m;
  const x = Number(actual ?? 0);
  if ('approx' in m) return Math.abs(x - m.approx) <= Math.max(1e-6, Math.abs(m.approx) * (m.tol ?? 0.03));
  if ('gt' in m) return x > m.gt;
  if ('lt' in m) return x < m.lt;
  return x >= m.between[0] && x <= m.between[1];
}

function eventMatches(e: EngineEvent, partial: Record<string, unknown>): boolean {
  return Object.entries(partial).every(([k, v]) => (e as Record<string, unknown>)[k] === v);
}

export const coveredRules = new Set<string>();

for (const file of readdirSync(DIR)
  .filter((f) => f.endsWith('.yaml'))
  .sort()) {
  const cases = parse(readFileSync(join(DIR, file), 'utf8')) as Case[];
  describe(`движок: ${file}`, () => {
    for (const c of cases) {
      it(c.id, () => {
        const ix = testIndex();
        const { state, events } = run(c.actions, ix);
        const brief = events.map((e) => JSON.stringify(e)).join('\n');
        for (const inc of c.expect.events?.include ?? []) {
          assert.ok(
            events.some((e) => eventMatches(e, inc)),
            `нет события ${JSON.stringify(inc)}\nсобытия:\n${brief}`,
          );
        }
        for (const exc of c.expect.events?.exclude ?? []) {
          assert.ok(
            !events.some((e) => eventMatches(e, exc)),
            `лишнее событие ${JSON.stringify(exc)}\nсобытия:\n${brief}`,
          );
        }
        for (const [vid, exp] of Object.entries(c.expect.vessels ?? {})) {
          const v = state.vessels[vid];
          assert.ok(v, `нет сосуда ${vid}`);
          for (const [sp, m] of Object.entries(exp.grams ?? {})) {
            assert.ok(
              matchValue(grams(v, sp), m),
              `${vid}.${sp}: ${grams(v, sp)} не подходит под ${JSON.stringify(m)}`,
            );
          }
          for (const [sp, phases] of Object.entries(exp.phases ?? {})) {
            for (const [phase, m] of Object.entries(phases)) {
              const g: number = (v.contents[sp] as Record<string, number> | undefined)?.[phase] ?? 0;
              assert.ok(matchValue(g, m), `${vid}.${sp}.${phase}: ${g} не подходит под ${JSON.stringify(m)}`);
            }
          }
          for (const [field, m] of Object.entries(exp)) {
            if (field === 'grams' || field === 'phases') continue;
            // Поле может быть путём: indicatorBand.cabbage_anthocyanins.
            const actual: unknown = field
              .split('.')
              .reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], v);
            assert.ok(
              matchValue(actual, m as ValueMatcher),
              `${vid}.${field}: ${String(actual)} ≠ ${JSON.stringify(m)}`,
            );
          }
        }
        if (c.expect.fumeHoodOn !== undefined) assert.equal(state.fumeHoodOn, c.expect.fumeHoodOn);
        for (const r of c.rules ?? []) coveredRules.add(r);
      });
    }
  });
}

describe('покрытие правил табличными тестами', () => {
  it('каждое правило и объяснение «ничего» упомянуто хотя бы в одном тесте', () => {
    const all = new Set<string>();
    for (const file of readdirSync(DIR).filter((f) => f.endsWith('.yaml'))) {
      for (const c of parse(readFileSync(join(DIR, file), 'utf8')) as Case[])
        for (const r of c.rules ?? []) all.add(r);
    }
    const ix = testIndex();
    const missing = [...ix.bundle.rules.map((r) => r.id), ...ix.bundle.noReactions.map((r) => r.id)].filter(
      (id) => !all.has(id),
    );
    // Правило модуля 8 проверяется отдельно: на полке MVP нет хлорсодержащих средств.
    assert.deepEqual(
      missing.filter((id) => id !== 'hz_chlorine_with_acid'),
      [],
    );
  });
});
