/**
 * Сборка контента: YAML → схема → проверки ссылок → тексты одного языка → JSON.
 * Используется сборкой сайта, командой content:check и тестами.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import { SourceSchemas, CompiledSchemas } from '../../src/core/content-model/schema.ts';
import type { ContentBundle } from '../../src/core/content-model/types.ts';
import { validateBundle, type Issue } from './validate.ts';

export const ROOT = join(import.meta.dirname, '..', '..');
const CONTENT = join(ROOT, 'content');

function readYaml(path: string): unknown {
  return parse(readFileSync(path, 'utf8'), { prettyErrors: true });
}

function listYaml(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((f) => join(dir, f));
}

function concatLists(files: string[]): unknown[] {
  const out: unknown[] = [];
  for (const f of files) {
    const data = readYaml(f);
    if (!Array.isArray(data)) throw new Error(`${relative(ROOT, f)}: ожидается список`);
    out.push(...data);
  }
  return out;
}

/** Собирает исходный пакет контента из файлов content/. */
export function readSourceBundle(): unknown {
  const physicsFile = readYaml(join(CONTENT, 'chem', 'physics.yaml')) as { physics: unknown; dosing: unknown };
  return {
    classes: readYaml(join(CONTENT, 'chem', 'classes.yaml')),
    species: readYaml(join(CONTENT, 'chem', 'species.yaml')),
    substances: readYaml(join(CONTENT, 'chem', 'substances.yaml')),
    equipment: readYaml(join(CONTENT, 'chem', 'equipment.yaml')),
    physics: physicsFile.physics,
    dosing: physicsFile.dosing,
    rules: concatLists(listYaml(join(CONTENT, 'chem', 'rules'))),
    noReactions: readYaml(join(CONTENT, 'chem', 'no-reaction.yaml')),
    effects: readYaml(join(CONTENT, 'chem', 'effects.yaml')),
    missions: listYaml(join(CONTENT, 'learning', 'missions')).map(readYaml),
    sandbox: readYaml(join(CONTENT, 'learning', 'sandbox.yaml')),
    strings: readYaml(join(CONTENT, 'ui', 'strings.yaml')),
  };
}

function isText(v: unknown): v is { ru: string; en?: string } {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.includes('ru') && keys.every((k) => k === 'ru' || k === 'en') && keys.every((k) => typeof (v as Record<string, unknown>)[k] === 'string');
}

/** Заменяет каждое значение `{ ru, en? }` строкой нужного языка (с откатом на русский). */
export function resolveTexts(v: unknown, lang: 'ru' | 'en'): unknown {
  if (isText(v)) return v[lang] ?? v.ru;
  if (Array.isArray(v)) return v.map((x) => resolveTexts(x, lang));
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveTexts(x, lang)]));
  }
  return v;
}

function collectTokenRefs(v: unknown, out: Set<string>): void {
  if (typeof v === 'string' && /^color\.[a-z0-9.-]+$/.test(v)) out.add(v);
  else if (Array.isArray(v)) v.forEach((x) => collectTokenRefs(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => collectTokenRefs(x, out));
}

/** Значения токенов дизайна по пути (алиасы раскрываются). */
export function loadTokenColors(): Map<string, string> {
  const tokens = JSON.parse(readFileSync(join(ROOT, 'design', 'tokens', 'tokens.json'), 'utf8')) as Record<string, unknown>;
  const flat = new Map<string, unknown>();
  const walk = (node: unknown, path: string[]): void => {
    if (node && typeof node === 'object' && '$value' in node) {
      flat.set(path.join('.'), (node as { $value: unknown }).$value);
      return;
    }
    if (node && typeof node === 'object') {
      for (const [k, x] of Object.entries(node)) if (!k.startsWith('$') && k !== 'meta') walk(x, [...path, k]);
    }
  };
  walk(tokens, []);
  const resolveRef = (v: unknown, depth = 0): unknown => {
    if (typeof v !== 'string' || depth > 5) return v;
    const m = /^\{([^}]+)\}$/.exec(v);
    return m?.[1] ? resolveRef(flat.get(m[1]), depth + 1) : v;
  };
  const colors = new Map<string, string>();
  for (const [k, v] of flat) {
    const r = resolveRef(v);
    if (k.startsWith('color.') && typeof r === 'string' && /^#[0-9a-fA-F]{6}$/.test(r)) colors.set(k, r.toUpperCase());
  }
  return colors;
}

export interface CompileResult {
  bundle: ContentBundle | null;
  issues: Issue[];
}

/** Полная сборка и проверка контента для языка. */
export function compileContent(lang: 'ru' | 'en' = 'ru'): CompileResult {
  const issues: Issue[] = [];
  const source = readSourceBundle();
  const parsed = SourceSchemas.Bundle.safeParse(source);
  if (!parsed.success) {
    for (const e of parsed.error.issues) {
      issues.push({ level: 'error', where: e.path.join('.'), message: e.message });
    }
    return { bundle: null, issues };
  }
  const tokenColors = loadTokenColors();
  const refs = new Set<string>();
  collectTokenRefs(parsed.data, refs);
  const colors: Record<string, string> = {};
  for (const ref of [...refs].sort()) {
    const hex = tokenColors.get(ref);
    if (hex) colors[ref] = hex;
    else issues.push({ level: 'error', where: 'colors', message: `нет токена ${ref} в design/tokens/tokens.json` });
  }
  const resolved = resolveTexts({ ...parsed.data, colors }, lang);
  const compiled = CompiledSchemas.Bundle.safeParse(resolved);
  if (!compiled.success) {
    for (const e of compiled.error.issues) issues.push({ level: 'error', where: e.path.join('.'), message: e.message });
    return { bundle: null, issues };
  }
  issues.push(...validateBundle(compiled.data, parsed.data));
  return { bundle: compiled.data, issues };
}
