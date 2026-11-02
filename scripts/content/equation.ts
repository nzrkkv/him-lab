/**
 * Проверка баланса атомов в уравнении вида "2NaHCO3 -> Na2CO3 + H2O + CO2^".
 * Поддерживает коэффициенты, скобки с множителем и пометку газа «^».
 */
export function parseFormula(formula: string): Map<string, number> {
  const counts = new Map<string, number>();
  const stack: Map<string, number>[] = [counts];
  const re = /([A-Z][a-z]?)(\d*)|(\()|(\))(\d*)/g;
  let pos = 0;
  for (let m = re.exec(formula); m; m = re.exec(formula)) {
    if (m.index !== pos) throw new Error(`непонятный символ в «${formula}» на позиции ${pos}`);
    pos = re.lastIndex;
    const top = stack[stack.length - 1] as Map<string, number>;
    if (m[1]) top.set(m[1], (top.get(m[1]) ?? 0) + (m[2] ? Number(m[2]) : 1));
    else if (m[3]) stack.push(new Map());
    else if (m[4]) {
      const group = stack.pop();
      const parent = stack[stack.length - 1];
      if (!group || !parent) throw new Error(`лишняя скобка в «${formula}»`);
      const k = m[5] ? Number(m[5]) : 1;
      for (const [el, n] of group) parent.set(el, (parent.get(el) ?? 0) + n * k);
    }
  }
  if (pos !== formula.length || stack.length !== 1) throw new Error(`не удалось разобрать «${formula}»`);
  return counts;
}

function sideAtoms(side: string): Map<string, number> {
  const total = new Map<string, number>();
  for (const raw of side.split(' + ')) {
    const term = raw.trim().replace(/\^$/, '');
    const m = /^(\d*)(.+)$/.exec(term);
    if (!m?.[2]) throw new Error(`пустой член «${raw}»`);
    const coeff = m[1] ? Number(m[1]) : 1;
    for (const [el, n] of parseFormula(m[2])) total.set(el, (total.get(el) ?? 0) + n * coeff);
  }
  return total;
}

export function checkEquation(eq: string): { ok: true } | { ok: false; reason: string } {
  const parts = eq.split('->');
  if (parts.length !== 2) return { ok: false, reason: `нужна одна стрелка «->»: ${eq}` };
  try {
    const left = sideAtoms(parts[0] ?? '');
    const right = sideAtoms(parts[1] ?? '');
    const elements = new Set([...left.keys(), ...right.keys()]);
    for (const el of elements) {
      if ((left.get(el) ?? 0) !== (right.get(el) ?? 0)) {
        return { ok: false, reason: `не сходится ${el}: ${left.get(el) ?? 0} слева, ${right.get(el) ?? 0} справа (${eq})` };
      }
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}
