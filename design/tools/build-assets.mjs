// Генератор SVG-ассетов Хим лабы. Выход — обычные SVG-файлы в design/assets/.
// Запуск: node design/tools/build-assets.mjs
// Править геометрию лучше здесь, а не в готовых файлах: так сохраняется единая сетка и слои.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets');

// ---------- константы стиля ----------
const INK = '#16213F';
const GLASS = '#EAF6FF';
const METAL = '#C9D3DD';
const METAL_D = '#8E9DAE';
const WOOD = '#ECD5A9';
const WOOD_D = '#CDA266';
const TAPE = '#FFF6DE';
const W = 4; // основной контур, единиц viewBox
const O = (w = W) => `stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const glassFill = `style="fill:var(--glass-fill, ${GLASS})" fill-opacity="0.6"`;
const shine = (d, w = 5) => `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="${w}" stroke-linecap="round" opacity="0.9"/>`;

// детерминированный «рандом» для пузырьков и крупинок
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function write(rel, svg) {
  const p = join(ROOT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, svg.trim().replace(/\n\s*\n/g, '\n') + '\n');
}

function svgRoot({ name, w, h, title, cls, extraAttrs = '', style = '' }, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" class="${cls}" data-asset="${name}" ${extraAttrs}${style ? ` style="${style}"` : ''} role="img" aria-label="${title}">
<title>${title}</title>
${body}
</svg>`;
}

// ---------- пузырьки, крупинки ----------
function bubbles(area, n, seed) {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < n; i++) {
    const cx = (area.x0 + r() * (area.x1 - area.x0)).toFixed(1);
    const cy = (area.y0 + r() * (area.y1 - area.y0)).toFixed(1);
    const rad = (2.5 + r() * 3.5).toFixed(1);
    const d = (r() * 1.6).toFixed(2);
    out += `<circle class="hl-bubble" cx="${cx}" cy="${cy}" r="${rad}" fill="#FFFFFF" fill-opacity="0.7" stroke="${INK}" stroke-opacity="0.45" stroke-width="1.5" style="--i:${i};--d:${d}s"/>`;
  }
  return out;
}
function grains(area, n, seed, color = INK, op = 0.14) {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < n; i++) {
    const cx = (area.x0 + r() * (area.x1 - area.x0)).toFixed(1);
    const cy = (area.y0 + r() * (area.y1 - area.y0)).toFixed(1);
    out += `<circle cx="${cx}" cy="${cy}" r="${(1 + r() * 0.9).toFixed(1)}" fill="${color}" fill-opacity="${op}"/>`;
  }
  return out;
}
function bumpyTop(x0, x1, y, amp, step, seed) {
  // волнистая кромка насыпи/осадка слева направо
  const r = rng(seed);
  let d = `M${x0} ${y}`;
  for (let x = x0; x < x1; x += step) {
    const nx = Math.min(x + step, x1);
    d += ` Q${(x + nx) / 2} ${(y - amp - r() * amp).toFixed(1)} ${nx} ${y}`;
  }
  return d;
}

// ---------- сосуд ----------
// Слои (data-layer): glass-back, contents[clip]{liquid{liquid-body, turbidity, liquid-surface, foam}, sediment, powder, bubbles}, glass, marks, shine
function vessel(o) {
  const {
    name, title, w, h, outline, interior, top, bottom, marks = '', shinePath, extraFront = '', extraBack = '',
    mouth, base, bubbleArea, level = 0.55, sedimentH = 30, powderW = 40, seed = 7,
  } = o;
  const fillH = bottom - top;
  const cx = base[0];
  const clipId = `${name}-interior`;
  const sedTop = bottom - sedimentH;
  const sediment = `${bumpyTop(cx - (w / 2 - 6), cx + (w / 2 - 6), sedTop + 10, 4, 12, seed)} V${bottom + 4} H${cx - (w / 2 - 6)} Z`;
  const pw = powderW;
  const powder = `M${cx - pw} ${bottom + 2} C${cx - pw * 0.6} ${bottom - pw * 0.55} ${cx - pw * 0.2} ${bottom - pw * 0.62} ${cx} ${bottom - pw * 0.62} C${cx + pw * 0.25} ${bottom - pw * 0.62} ${cx + pw * 0.6} ${bottom - pw * 0.5} ${cx + pw} ${bottom + 2} Z`;
  const foamR = rng(seed + 3);
  let foam = '';
  for (let x = 4; x < w; x += 11) {
    const rr = 6 + foamR() * 5;
    foam += `<circle cx="${x + foamR() * 4}" cy="${top - 2 + foamR() * 6}" r="${rr.toFixed(1)}" fill="#FFFFFF" stroke="${INK}" stroke-width="2" stroke-opacity="0.5"/>`;
  }
  return svgRoot({
    name, w, h, title, cls: 'hl-asset hl-asset--vessel',
    extraAttrs: `data-fill-top="${top}" data-fill-bottom="${bottom}" data-mouth="${mouth.join(',')}" data-base="${base.join(',')}"`,
    style: `--fill-h:${fillH}px`,
  }, `
<defs><clipPath id="${clipId}"><path d="${interior}"/></clipPath></defs>
${extraBack}
<g data-layer="glass-back" class="hl-glass-back"><path d="${interior}" ${glassFill}/></g>
<g data-layer="contents" clip-path="url(#${clipId})">
  <g data-layer="liquid" class="hl-liquid" style="transform:translateY(calc((1 - var(--level, ${level})) * ${fillH}px))">
    <rect data-layer="liquid-body" x="0" y="${top}" width="${w}" height="${h}" style="fill:var(--liquid-color, #CDE9FB);fill-opacity:var(--liquid-opacity, 0.85)"/>
    <g data-layer="turbidity" class="hl-turbidity" style="opacity:var(--turbidity, 0)">
      <rect x="0" y="${top}" width="${w}" height="${h}" style="fill:var(--turbidity-color, #FFFFFF)" fill-opacity="0.55"/>
      ${grains({ x0: 2, x1: w - 2, y0: top + 6, y1: bottom }, Math.round(w * fillH / 260), seed + 11, '#FFFFFF', 0.9)}
    </g>
    <rect data-layer="liquid-surface" x="0" y="${top}" width="${w}" height="5" fill="#FFFFFF" fill-opacity="0.45"/>
    <g data-layer="foam" class="hl-foam" style="opacity:var(--foam, 0)">${foam}</g>
  </g>
  <g data-layer="sediment" class="hl-sediment" style="transform-box:fill-box;transform-origin:50% 100%;transform:scaleY(var(--sediment, 0))">
    <path d="${sediment}" style="fill:var(--sediment-color, #F3F1EA)" stroke="${INK}" stroke-width="2" stroke-opacity="0.55"/>
    ${grains({ x0: cx - w / 2 + 10, x1: cx + w / 2 - 10, y0: sedTop + 12, y1: bottom - 2 }, 14, seed + 5)}
  </g>
  <g data-layer="powder" class="hl-powder" style="transform-box:fill-box;transform-origin:50% 100%;transform:scale(var(--powder, 0))">
    <path d="${powder}" style="fill:var(--powder-color, #FFFFFF)" stroke="${INK}" stroke-width="2.5"/>
    ${grains({ x0: cx - pw * 0.6, x1: cx + pw * 0.6, y0: bottom - pw * 0.45, y1: bottom - 3 }, 10, seed + 9)}
  </g>
  <g data-layer="bubbles" class="hl-bubbles" style="opacity:var(--bubbles, 0)">${bubbles(bubbleArea, o.nBubbles || 10, seed + 1)}</g>
</g>
<g data-layer="glass" class="hl-glass" fill="none" ${O()}><path d="${outline}"/>${extraFront}</g>
<g data-layer="marks" class="hl-marks" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" opacity="0.5">${marks}</g>
<g data-layer="shine" class="hl-shine">${shine(shinePath)}</g>
`);
}

// ================= ОБОРУДОВАНИЕ =================
const eq = {};

eq.beaker = vessel({
  name: 'beaker', title: 'Стакан', w: 120, h: 160,
  outline: 'M8 18 C14 18 18 22 18 30 V136 Q18 150 32 150 H88 Q102 150 102 136 V22 H110',
  interior: 'M20 24 V136 Q20 148 32 148 H88 Q100 148 100 136 V24 Z',
  top: 40, bottom: 148, mouth: [60, 22], base: [60, 150],
  marks: 'M86 60 H100 M92 74 H100 M86 88 H100 M92 102 H100 M86 116 H100 M92 130 H100',
  shinePath: 'M31 46 V116 M31 128 V132', bubbleArea: { x0: 26, x1: 94, y0: 60, y1: 144 }, powderW: 30, seed: 3,
});

eq['test-tube'] = vessel({
  name: 'test-tube', title: 'Пробирка', w: 48, h: 184,
  outline: 'M4 12 H10 V158 A14 14 0 0 0 38 158 V12 H44',
  interior: 'M12 14 V158 A12 12 0 0 0 36 158 V14 Z',
  top: 30, bottom: 170, mouth: [24, 12], base: [24, 172],
  shinePath: 'M18 34 V146', bubbleArea: { x0: 15, x1: 33, y0: 70, y1: 166 }, powderW: 12, sedimentH: 20, nBubbles: 8, seed: 5, level: 0.4,
});

eq.flask = vessel({
  name: 'flask', title: 'Колба', w: 120, h: 168,
  outline: 'M42 10 H48 V54 L14 144 Q9 158 24 158 H96 Q111 158 106 144 L72 54 V10 H78',
  interior: 'M50 12 V55 L16.6 144.8 Q13 156 25 156 H95 Q107 156 103.4 144.8 L70 55 V12 Z',
  top: 70, bottom: 156, mouth: [60, 10], base: [60, 158],
  marks: 'M58 96 H74 M62 112 H74 M58 128 H74',
  shinePath: 'M47 82 L33 120', bubbleArea: { x0: 30, x1: 90, y0: 100, y1: 152 }, powderW: 30, seed: 11, level: 0.6,
});

eq['graduated-cylinder'] = vessel({
  name: 'graduated-cylinder', title: 'Мерный цилиндр', w: 64, h: 204,
  outline: 'M8 10 C13 10 16 13 16 18 V182 M48 182 V12 H54',
  extraBack: `<path d="M6 182 H58 V194 Q58 198 54 198 H10 Q6 198 6 194 Z" ${glassFill} ${O()}/>`,
  interior: 'M18 14 V182 H46 V14 Z',
  top: 30, bottom: 182, mouth: [32, 10], base: [32, 198],
  marks: [40, 57, 74, 91, 108, 125, 142, 159, 176].map((y, i) => `M${i % 2 ? 40 : 34} ${y} H46`).join(' '),
  shinePath: 'M25 32 V170', bubbleArea: { x0: 20, x1: 44, y0: 80, y1: 178 }, powderW: 12, sedimentH: 18, nBubbles: 7, seed: 13, level: 0.5,
});

eq['evaporating-dish'] = (() => {
  const v = vessel({
    name: 'evaporating-dish', title: 'Выпарительная чашка', w: 150, h: 64,
    outline: 'M6 18 H144 M10 18 Q12 48 44 52 H106 Q138 48 140 18',
    extraBack: `<path d="M10 18 Q12 48 44 52 H106 Q138 48 140 18 Z" fill="#FFFFFF" stroke="none"/><path d="M56 52 H94 V58 Q94 60 92 60 H58 Q56 60 56 58 Z" fill="#FFFFFF" ${O(3)}/>`,
    interior: 'M14 20 Q16 46 45 49 H105 Q134 46 136 20 Z',
    top: 24, bottom: 49, mouth: [75, 18], base: [75, 60],
    shinePath: 'M26 26 Q30 38 40 42', bubbleArea: { x0: 40, x1: 110, y0: 30, y1: 47 }, powderW: 24, sedimentH: 10, nBubbles: 6, seed: 17, level: 0.6,
  });
  // кристаллы, остающиеся после выпаривания
  const r = rng(29);
  let cr = '';
  for (let i = 0; i < 11; i++) {
    const x = 36 + i * 7.5 + r() * 3;
    const y = 41 + r() * 5 - (i % 3 === 0 ? 3 : 0);
    const s = 4 + r() * 3;
    const rot = (r() * 40 - 20).toFixed(0);
    cr += `<rect x="${(x - s / 2).toFixed(1)}" y="${(y - s / 2).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" rx="0.8" transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})" style="fill:var(--crystal-color, #FFFFFF)" stroke="${INK}" stroke-width="1.6"/>`;
  }
  return v.replace('<g data-layer="glass"', `<g data-layer="crystals" class="hl-crystals" style="opacity:var(--crystals, 0)">${cr}</g>\n<g data-layer="glass"`);
})();

eq.spoon = svgRoot({ name: 'spoon', w: 140, h: 44, title: 'Ложка', cls: 'hl-asset hl-asset--tool', extraAttrs: 'data-tip="112,22" data-grip="10,22"' }, `
<g data-layer="body">
  <path d="M6 19 Q7 15.5 13 15.5 L90 19 V25 L13 28.5 Q7 28.5 6 25 Z" fill="${METAL}" ${O(3)}/>
  <ellipse cx="112" cy="22" rx="24" ry="15" fill="${METAL}" ${O()}/>
  <ellipse cx="112" cy="21" rx="17" ry="9" fill="${METAL_D}" fill-opacity="0.35"/>
</g>
<g data-layer="powder" class="hl-powder" style="transform-box:fill-box;transform-origin:50% 100%;transform:scale(var(--powder, 0))">
  <path d="M93 22 C96 11 104 6.5 112 6.5 C120 6.5 128 11 131 22 Z" style="fill:var(--powder-color, #FFFFFF)" ${O(2.5)}/>
  ${grains({ x0: 100, x1: 124, y0: 12, y1: 20 }, 7, 41)}
</g>
<g data-layer="shine">${shine('M20 21 L70 21.5', 3)}</g>
`);

eq.pipette = (() => {
  const clip = 'pipette-interior';
  const top = 66, bottom = 150, fillH = bottom - top;
  return svgRoot({ name: 'pipette', w: 40, h: 176, title: 'Пипетка', cls: 'hl-asset hl-asset--tool', extraAttrs: 'data-tip="20,152"', style: `--fill-h:${fillH}px` }, `
<defs><clipPath id="${clip}"><path d="M16 60 V128 L19.5 150 H20.5 L24 128 V60 Z"/></clipPath></defs>
<g data-layer="glass-back"><path d="M16 60 V128 L19.5 150 H20.5 L24 128 V60 Z" ${glassFill}/></g>
<g data-layer="contents" clip-path="url(#${clip})">
  <g data-layer="liquid" class="hl-liquid" style="transform:translateY(calc((1 - var(--level, 0.5)) * ${fillH}px))">
    <rect x="0" y="${top}" width="40" height="120" style="fill:var(--liquid-color, #CDE9FB);fill-opacity:var(--liquid-opacity, 0.85)"/>
  </g>
</g>
<g data-layer="glass" fill="none" ${O(3.5)}><path d="M14 60 V128 L18.5 152 H21.5 L26 128 V60"/></g>
<g data-layer="bulb">
  <path d="M10 54 V30 C10 8 30 8 30 30 V54 Z" style="fill:var(--bulb-color, #F07A5A)" ${O()}/>
  <rect x="8" y="52" width="24" height="9" rx="2.5" style="fill:var(--bulb-color, #F07A5A)" ${O(3.5)}/>
  ${shine('M15 22 V40', 3.5)}
</g>
<g data-layer="drop" class="hl-drop" style="opacity:var(--drop, 0)">
  <path d="M20 157 C20 157 14 164.5 14 167.5 A6 6 0 0 0 26 167.5 C26 164.5 20 157 20 157 Z" style="fill:var(--liquid-color, #CDE9FB)" ${O(2.5)}/>
</g>
<g data-layer="shine">${shine('M18.5 68 V120', 2.5)}</g>
`);
})();

eq.stirrer = svgRoot({ name: 'stirrer', w: 24, h: 196, title: 'Стеклянная палочка (мешалка)', cls: 'hl-asset hl-asset--tool', extraAttrs: 'data-tip="12,186" data-grip="12,14"' }, `
<g data-layer="body"><rect x="6" y="4" width="12" height="188" rx="6" ${glassFill} ${O()}/></g>
<g data-layer="shine">${shine('M10.5 18 V150', 2.5)}</g>
`);

eq.scales = svgRoot({ name: 'scales', w: 200, h: 120, title: 'Весы', cls: 'hl-asset hl-asset--device', extraAttrs: 'data-anchor="100,18" data-slot-display="62,58,76,30"' }, `
<g data-layer="body">
  <rect x="92" y="26" width="16" height="16" fill="${METAL_D}" ${O(3)}/>
  <rect x="28" y="16" width="144" height="11" rx="5.5" fill="${METAL}" ${O()}/>
  <path d="M18 40 H182 L191 104 Q192 112 184 112 H16 Q8 112 9 104 Z" fill="#FFFFFF" ${O()}/>
  <rect x="58" y="54" width="84" height="38" rx="7" fill="#DDF3E6" ${O(3)} data-layer="display"/>
  <circle cx="164" cy="73" r="8" fill="#3B78E3" ${O(3)}/>
  <circle cx="36" cy="73" r="4" fill="${INK}" opacity="0.25"/>
</g>
<g data-layer="shine">${shine('M40 21.5 H70', 3)}</g>
`);

eq.burner = (() => {
  const clip = 'burner-fuel';
  return svgRoot({ name: 'burner', w: 180, h: 220, title: 'Спиртовка на треножнике', cls: 'hl-asset hl-asset--device', extraAttrs: 'data-anchor="90,40"' }, `
<defs><clipPath id="${clip}"><path d="M52 204 V170 Q52 150 72 146 H108 Q128 150 128 170 V204 Q128 208 124 208 H56 Q52 208 52 204 Z"/></clipPath></defs>
<g data-layer="tripod" fill="none" ${O(5)}><path d="M36 50 L20 212 M144 50 L160 212"/></g>
<g data-layer="flame" class="hl-flame" style="opacity:var(--flame, 1);transform-box:fill-box;transform-origin:50% 100%">
  <path d="M90 56 C104 77 110 92 106 104 C103 114 97 118 90 118 C83 118 77 114 74 104 C70 92 76 77 90 56 Z" fill="#FF8A1F" ${O(3)}/>
  <path d="M90 80 C96.5 91 99.5 98.5 98 106 C96.5 111.5 93.5 113.5 90 113.5 C86.5 113.5 83.5 111.5 82 106 C80.5 98.5 83.5 91 90 80 Z" fill="#FFD23F"/>
  <path d="M84 113 Q90 118 96 113" fill="none" stroke="#4FA3FF" stroke-width="4" stroke-linecap="round"/>
</g>
<g data-layer="lamp">
  <path d="M52 204 V170 Q52 150 72 146 H108 Q128 150 128 170 V204 Q128 212 120 212 H60 Q52 212 52 204 Z" ${glassFill}/>
  <g clip-path="url(#${clip})"><rect x="40" y="176" width="100" height="40" style="fill:var(--fuel-color, #E4DDFB)" fill-opacity="0.9"/><rect x="40" y="176" width="100" height="4" fill="#FFFFFF" fill-opacity="0.5"/></g>
  <path d="M52 204 V170 Q52 150 72 146 H108 Q128 150 128 170 V204 Q128 212 120 212 H60 Q52 212 52 204 Z" fill="none" ${O()}/>
  <rect x="78" y="130" width="24" height="17" rx="3" fill="${METAL}" ${O(3.5)}/>
  <path d="M90 130 V119" stroke="#6F4A18" stroke-width="5" stroke-linecap="round"/>
  ${shine('M62 166 V196', 4)}
</g>
<g data-layer="gauze">
  <rect x="22" y="40" width="136" height="11" rx="3" fill="${METAL}" ${O()}/>
  <rect x="52" y="42" width="76" height="7" fill="${METAL_D}" opacity="0.6"/>
  <rect data-layer="heat" class="hl-heat" x="52" y="42" width="76" height="7" fill="#FF6B3D" style="opacity:var(--heat, 0)"/>
</g>
`);
})();

eq['ice-bath'] = svgRoot({ name: 'ice-bath', w: 220, h: 112, title: 'Ледяная баня', cls: 'hl-asset hl-asset--device', extraAttrs: 'data-anchor="110,100" data-split="back,front"' }, `
<g data-layer="back">
  <path d="M10 30 H210 L198 100 Q196 106 188 106 H32 Q24 106 22 100 Z" fill="#DCEAF3"/>
  <rect x="40" y="38" width="22" height="20" rx="4" transform="rotate(-12 51 48)" fill="#E1F5FF" ${O(3)}/>
  <rect x="150" y="36" width="24" height="22" rx="4" transform="rotate(10 162 47)" fill="#E1F5FF" ${O(3)}/>
  <path d="M6 30 H214" fill="none" ${O(5)}/>
</g>
<g data-layer="front">
  <path d="M15.5 54 Q30 50 45 54 T75 54 T105 54 T135 54 T165 54 T195 54 H205 L198 100 Q196 106 188 106 H32 Q24 106 22 100 Z" style="fill:var(--bath-water, #9FD3F5)" fill-opacity="0.55"/>
  <path d="M15.5 54 Q30 50 45 54 T75 54 T105 54 T135 54 T165 54 T195 54 H205" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" opacity="0.6"/>
  <rect x="22" y="46" width="22" height="20" rx="4" transform="rotate(14 33 56)" fill="#E1F5FF" ${O(3)}/>
  <rect x="176" y="47" width="20" height="18" rx="4" transform="rotate(-10 186 56)" fill="#E1F5FF" ${O(3)}/>
  <path d="M10 30 L22 100 Q24 106 32 106 H188 Q196 106 198 100 L210 30" fill="none" ${O()}/>
  ${shine('M30 66 L34 92', 4)}
</g>
`);

eq.funnel = (() => {
  const clip = 'funnel-filter';
  const top = 26, bottom = 86, fillH = bottom - top;
  return svgRoot({ name: 'funnel', w: 120, h: 176, title: 'Воронка с фильтром', cls: 'hl-asset hl-asset--device', extraAttrs: 'data-mouth="60,14" data-outlet="60,158"', style: `--fill-h:${fillH}px` }, `
<defs><clipPath id="${clip}"><path d="M16 20 L60 86 L104 20 Z"/></clipPath></defs>
<g data-layer="glass-back"><path d="M6 14 H114 L68 84 V156 H52 V84 Z" ${glassFill}/></g>
<g data-layer="stream" class="hl-stream" style="opacity:var(--flow, 0)"><path d="M60 90 V154" style="stroke:var(--liquid-color, #CDE9FB)" stroke-width="6" stroke-linecap="round"/></g>
<g data-layer="filter">
  <path d="M14 18 L22 23 L30 17 L38 23 L46 17 L54 23 L62 17 L70 23 L78 17 L86 23 L94 17 L102 23 L106 18 L60 88 Z" fill="#F8F5EE" ${O(2.5)}/>
</g>
<g data-layer="contents" clip-path="url(#${clip})">
  <g data-layer="liquid" class="hl-liquid" style="transform:translateY(calc((1 - var(--level, 0)) * ${fillH}px))">
    <rect x="0" y="${top}" width="120" height="80" style="fill:var(--liquid-color, #CDE9FB);fill-opacity:var(--liquid-opacity, 0.85)"/>
    <rect x="0" y="${top}" width="120" height="4" fill="#FFFFFF" fill-opacity="0.45"/>
  </g>
  <g data-layer="residue" class="hl-residue" style="opacity:var(--residue, 0)">
    <path d="M38 64 Q46 56 52 60 Q58 52 66 58 Q74 55 82 64 L60 88 Z" style="fill:var(--residue-color, #F3F1EA)" stroke="${INK}" stroke-width="2" stroke-opacity="0.6"/>
    ${grains({ x0: 48, x1: 72, y0: 62, y1: 78 }, 8, 51)}
  </g>
</g>
<g data-layer="glass" fill="none" ${O()}><path d="M6 14 H114 M6 14 L52 84 V158 M114 14 L68 84 V152 M52 158 L68 152"/></g>
<g data-layer="drip" class="hl-drip" style="opacity:var(--drip, 0)"><path d="M60 162 C60 162 55.5 168 55.5 170.5 A4.5 4.5 0 0 0 64.5 170.5 C64.5 168 60 162 60 162 Z" style="fill:var(--liquid-color, #CDE9FB)" ${O(2)}/></g>
<g data-layer="shine">${shine('M57 96 V140', 3)}</g>
`);
})();

eq.magnet = svgRoot({ name: 'magnet', w: 100, h: 112, title: 'Магнит', cls: 'hl-asset hl-asset--tool', extraAttrs: 'data-tip="50,108"' }, `
<g data-layer="body">
  <path d="M12 44 A38 38 0 0 1 88 44 V84 H66 V44 A16 16 0 0 0 34 44 V84 H12 Z" fill="#E2483D" ${O()}/>
  <path d="M12 84 H34 V103 Q34 108 29 108 H17 Q12 108 12 103 Z" fill="${METAL}" ${O()}/>
  <path d="M66 84 H88 V103 Q88 108 83 108 H71 Q66 108 66 103 Z" fill="${METAL}" ${O()}/>
</g>
<g data-layer="shine">${shine('M22 46 A28 28 0 0 1 40 18', 4.5)}</g>
`);

eq.magnifier = svgRoot({ name: 'magnifier', w: 132, h: 132, title: 'Лупа', cls: 'hl-asset hl-asset--tool', extraAttrs: 'data-lens="52,52,36"' }, `
<defs><clipPath id="magnifier-lens"><circle cx="52" cy="52" r="36"/></clipPath></defs>
<g data-layer="handle">
  <path d="M84 84 L94 94" stroke="${INK}" stroke-width="16" stroke-linecap="round"/>
  <path d="M84 84 L94 94" stroke="${METAL}" stroke-width="9" stroke-linecap="round"/>
  <path d="M96 96 L120 120" stroke="${INK}" stroke-width="22" stroke-linecap="round"/>
  <path d="M96 96 L120 120" style="stroke:var(--handle-color, #1F5FCC)" stroke-width="14" stroke-linecap="round"/>
</g>
<g data-layer="lens"><circle cx="52" cy="52" r="38" style="fill:var(--lens-fill, ${GLASS})" fill-opacity="0.55"/></g>
<g data-layer="lens-content" clip-path="url(#magnifier-lens)"></g>
<g data-layer="rim"><circle cx="52" cy="52" r="40" fill="none" stroke="${INK}" stroke-width="13"/><circle cx="52" cy="52" r="40" fill="none" stroke="${METAL}" stroke-width="6"/></g>
<g data-layer="shine">${shine('M30 44 A24 24 0 0 1 44 29', 5)}</g>
`);

eq.thermometer = (() => {
  const top = 24, bottom = 172, span = bottom - top;
  return svgRoot({ name: 'thermometer', w: 40, h: 208, title: 'Термометр', cls: 'hl-asset hl-asset--tool', extraAttrs: `data-tip="18,190" data-scale="${top},${bottom}"`, style: `--fill-h:${span}px` }, `
<defs><clipPath id="thermometer-column"><rect x="15" y="16" width="6" height="170" rx="3"/><circle cx="18" cy="188" r="13"/></clipPath></defs>
<g data-layer="body">
  <rect x="7" y="4" width="22" height="178" rx="11" fill="#FFFFFF" ${O()}/>
  <rect x="15" y="16" width="6" height="160" rx="3" fill="#E6E9F2"/>
</g>
<g data-layer="column" clip-path="url(#thermometer-column)">
  <g class="hl-thermo-column" style="transform:translateY(calc((1 - var(--temp, 0.3)) * ${span}px))"><rect x="10" y="${top}" width="16" height="190" style="fill:var(--thermo-color, #E2483D)"/></g>
  <circle cx="18" cy="188" r="13" style="fill:var(--thermo-color, #E2483D)"/>
</g>
<g data-layer="bulb"><circle cx="18" cy="188" r="15" fill="none" ${O()}/></g>
<g data-layer="marks" fill="none" stroke="${INK}" stroke-width="2.5" stroke-linecap="round" opacity="0.55">
  ${Array.from({ length: 11 }, (_, i) => `M23 ${top + (span / 10) * i} H${i % 5 === 0 ? 28 : 26}`).map((d) => `<path d="${d}"/>`).join('')}
</g>
<g data-layer="shine">${shine('M11.5 22 V60', 2.5)}</g>
`);
})();

eq['ph-strip'] = svgRoot({ name: 'ph-strip', w: 28, h: 132, title: 'Индикаторная бумага (pH-полоска)', cls: 'hl-asset hl-asset--tool', extraAttrs: 'data-tip="14,126"' }, `
<g data-layer="body"><rect x="6" y="4" width="16" height="124" rx="3" fill="#FFFFFF" ${O(3)}/></g>
<g data-layer="pad" class="hl-ph-pad"><rect x="6" y="80" width="16" height="48" rx="3" style="fill:var(--ph-color, #F2C66D);transition:fill var(--motion-duration-effect, 1.6s) var(--motion-easing-liquid, ease)" ${O(3)}/></g>
<g data-layer="grip" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" opacity="0.35"><path d="M11 14 H17 M11 20 H17 M11 26 H17"/></g>
`);

eq['test-tube-rack'] = svgRoot({ name: 'test-tube-rack', w: 320, h: 100, title: 'Штатив для пробирок', cls: 'hl-asset hl-asset--device', extraAttrs: 'data-split="back,front" data-slots="40,100,160,220,280" data-slot-base="84"' }, `
<g data-layer="back">
  <rect x="8" y="20" width="12" height="70" rx="3" fill="${WOOD_D}" ${O(3.5)}/>
  <rect x="300" y="20" width="12" height="70" rx="3" fill="${WOOD_D}" ${O(3.5)}/>
  <rect x="4" y="84" width="312" height="12" rx="4" fill="${WOOD}" ${O()}/>
</g>
<g data-layer="front">
  <rect x="4" y="14" width="312" height="17" rx="4" fill="${WOOD}" ${O()}/>
  <path d="M14 22.5 H306" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.6"/>
</g>
`);

eq['test-tube-holder'] = svgRoot({ name: 'test-tube-holder', w: 200, h: 48, title: 'Держатель для пробирок', cls: 'hl-asset hl-asset--tool', extraAttrs: 'data-grip="40,24" data-clamp="168,24"' }, `
<g data-layer="body">
  <path d="M8 18 H120 L150 12 H186 Q192 12 192 18 V20 H150 L124 26 H8 Q4 26 4 22 Q4 18 8 18 Z" fill="${WOOD}" ${O(3.5)}/>
  <path d="M8 30 H120 L150 36 H186 Q192 36 192 30 V28 H150 L124 22" fill="none" ${O(3.5)}/>
  <rect x="10" y="14" width="64" height="20" rx="6" fill="${WOOD_D}" ${O(3.5)}/>
  <path d="M22 18 V30 M34 18 V30 M46 18 V30 M58 18 V30" stroke="${INK}" stroke-width="2" stroke-linecap="round" opacity="0.35"/>
  <circle cx="132" cy="24" r="5" fill="${METAL}" ${O(2.5)}/>
</g>
<g data-layer="shine">${shine('M84 20.5 H114', 2.5)}</g>
`);

// вид в лупе: 4 узора (данные вещества: lens = cubes | crystals | fine_powder | ultrafine_powder)
const lens = {};
function lensSvg(name, title, body) {
  return svgRoot({ name: `lens-${name}`, w: 120, h: 120, title, cls: 'hl-asset hl-asset--lens' }, `
<defs><clipPath id="lens-${name}-clip"><circle cx="60" cy="60" r="56"/></clipPath></defs>
<circle cx="60" cy="60" r="56" style="fill:var(--lens-bg, #2E3A5C)"/>
<g clip-path="url(#lens-${name}-clip)">${body}</g>
<circle cx="60" cy="60" r="56" fill="none" ${O(4)}/>
${shine('M26 42 A38 38 0 0 1 42 24', 5)}`);
}
{
  const r = rng(101); let b = '';
  for (let i = 0; i < 14; i++) {
    const x = 10 + r() * 96, y = 10 + r() * 96, s = 13 + r() * 9, rot = (r() * 50 - 25).toFixed(0);
    b += `<g transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})"><rect x="${(x - s / 2).toFixed(1)}" y="${(y - s / 2).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" rx="1.5" style="fill:var(--lens-grain, #F5FAFF)" fill-opacity="0.92" ${O(2)}/><path d="M${(x - s / 2 + 3).toFixed(1)} ${(y - s / 2 + 3).toFixed(1)} h${(s * 0.45).toFixed(1)}" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/></g>`;
  }
  lens.cubes = lensSvg('cubes', 'В лупе: кубики', b);
}
{
  const r = rng(131); let b = '';
  for (let i = 0; i < 13; i++) {
    const x = 10 + r() * 96, y = 10 + r() * 96, w = 10 + r() * 8, h = 16 + r() * 10, rot = (r() * 140 - 70).toFixed(0);
    b += `<path transform="rotate(${rot} ${x.toFixed(1)} ${y.toFixed(1)})" d="M${(x - w / 2).toFixed(1)} ${(y - h / 2 + 4).toFixed(1)} L${(x - w / 2 + 4).toFixed(1)} ${(y - h / 2).toFixed(1)} H${(x + w / 2).toFixed(1)} V${(y + h / 2 - 5).toFixed(1)} L${(x + w / 2 - 5).toFixed(1)} ${(y + h / 2).toFixed(1)} H${(x - w / 2).toFixed(1)} Z" style="fill:var(--lens-grain, #F5FAFF)" fill-opacity="0.9" ${O(2)}/>`;
  }
  lens.crystals = lensSvg('crystals', 'В лупе: кристаллы со скошенными гранями', b);
}
{
  const r = rng(151); let b = '';
  for (let i = 0; i < 70; i++) { const x = 4 + r() * 112, y = 4 + r() * 112, rr = 2 + r() * 3.2; b += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}" style="fill:var(--lens-grain, #F5FAFF)" stroke="${INK}" stroke-width="1" stroke-opacity="0.5"/>`; }
  lens.powder = lensSvg('powder', 'В лупе: мелкий порошок', b);
}
{
  const r = rng(171); let b = '';
  for (let i = 0; i < 6; i++) { const x = 15 + r() * 90, y = 15 + r() * 90, rr = 9 + r() * 9; b += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rr.toFixed(1)}" style="fill:var(--lens-grain, #F5FAFF)" fill-opacity="0.85"/>`; }
  for (let i = 0; i < 220; i++) { const x = 3 + r() * 114, y = 3 + r() * 114; b += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.9 + r() * 0.8).toFixed(1)}" style="fill:var(--lens-grain, #F5FAFF)"/>`; }
  lens.fine = lensSvg('fine', 'В лупе: сверхмелкий порошок с комочками', b);
}

// ================= ТАРА ВЕЩЕСТВ =================
const ct = {};
ct.jar = (() => {
  const top = 40, bottom = 110, fillH = bottom - top;
  return svgRoot({ name: 'jar', w: 100, h: 120, title: 'Банка с веществом', cls: 'hl-asset hl-asset--container', extraAttrs: 'data-slot-label="18,62,64,30"', style: `--fill-h:${fillH}px` }, `
<defs><clipPath id="jar-interior"><path d="M14 46 Q14 36 24 36 H76 Q86 36 86 46 V104 Q86 110 80 110 H20 Q14 110 14 104 Z"/></clipPath></defs>
<g data-layer="glass-back"><path d="M22 32 H78 Q90 32 90 46 V104 Q90 114 80 114 H20 Q10 114 10 104 V46 Q10 32 22 32 Z" ${glassFill}/></g>
<g data-layer="contents" clip-path="url(#jar-interior)">
  <g data-layer="fill" class="hl-fill" style="transform:translateY(calc((1 - var(--fill, 0.75)) * ${fillH}px))">
    <path d="${bumpyTop(0, 100, top + 4, 2.5, 10, 61)} V130 H0 Z" style="fill:var(--substance-color, #FFFFFF)" stroke="${INK}" stroke-width="2" stroke-opacity="0.4"/>
    <g data-layer="grain" style="opacity:var(--grain, 1)">${grains({ x0: 16, x1: 84, y0: top + 8, y1: bottom }, 26, 63)}</g>
  </g>
</g>
<g data-layer="glass" fill="none" ${O()}><path d="M22 32 H78 Q90 32 90 46 V104 Q90 114 80 114 H20 Q10 114 10 104 V46 Q10 32 22 32 Z"/></g>
<g data-layer="lid">
  <rect x="20" y="22" width="60" height="11" rx="2" fill="${METAL}" ${O(3.5)}/>
  <rect x="16" y="6" width="68" height="18" rx="5" style="fill:var(--lid-color, #1F5FCC)" ${O()}/>
  <path d="M28 11 V19 M40 11 V19 M52 11 V19 M64 11 V19 M76 11 V19" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="2.5" stroke-linecap="round"/>
</g>
<g data-layer="label"><path d="M17 64 L19 62 L80 61 L83 63 L82 91 L80 93 L19 94 L17 92 Z" style="fill:var(--label-color, ${TAPE})" ${O(2.5)}/><path data-layer="label-text" d="M28 73 H70 M28 82 H56" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" opacity="0.3"/></g>
<g data-layer="shine">${shine('M19 48 V58 M19 98 V102', 4)}</g>
`);
})();

ct.bottle = (() => {
  const top = 62, bottom = 140, fillH = bottom - top;
  const body = 'M30 20 V36 Q30 44 22 50 Q12 58 12 72 V132 Q12 142 22 142 H54 Q64 142 64 132 V72 Q64 58 54 50 Q46 44 46 36 V20';
  const inner = 'M32 22 V36 Q32 46 24 52 Q14 59 14 72 V132 Q14 140 22 140 H54 Q62 140 62 132 V72 Q62 59 52 52 Q44 46 44 36 V22 Z';
  return svgRoot({ name: 'bottle', w: 76, h: 148, title: 'Бутылка с раствором', cls: 'hl-asset hl-asset--container', extraAttrs: 'data-slot-label="16,88,44,32"', style: `--fill-h:${fillH}px` }, `
<defs><clipPath id="bottle-interior"><path d="${inner}"/></clipPath></defs>
<g data-layer="glass-back"><path d="${inner}" ${glassFill}/></g>
<g data-layer="contents" clip-path="url(#bottle-interior)">
  <g data-layer="liquid" class="hl-liquid" style="transform:translateY(calc((1 - var(--level, 0.75)) * ${fillH}px))">
    <rect x="0" y="${top}" width="76" height="100" style="fill:var(--liquid-color, #CDE9FB);fill-opacity:var(--liquid-opacity, 0.85)"/>
    <rect x="0" y="${top}" width="76" height="4" fill="#FFFFFF" fill-opacity="0.45"/>
  </g>
</g>
<g data-layer="glass" fill="none" ${O()}><path d="${body}"/></g>
<g data-layer="cap"><rect x="26" y="4" width="24" height="18" rx="4" style="fill:var(--cap-color, #0F766E)" ${O()}/><path d="M32 9 V17 M38 9 V17 M44 9 V17" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="2" stroke-linecap="round"/></g>
<g data-layer="label"><path d="M15 89 L17 87 L60 86.5 L62 88.5 L61.5 119 L59.5 121 L17 121.5 L15 119.5 Z" style="fill:var(--label-color, ${TAPE})" ${O(2.5)}/><path data-layer="label-text" d="M23 99 H54 M23 108 H44" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" opacity="0.3"/></g>
<g data-layer="shine">${shine('M20 74 V82', 4)}</g>
`);
})();

ct.bag = svgRoot({ name: 'bag', w: 104, h: 124, title: 'Пакет с веществом', cls: 'hl-asset hl-asset--container', extraAttrs: 'data-slot-label="24,88,56,22"' }, `
<g data-layer="body">
  <path d="M14 30 L18 114 Q18.5 120 24 120 H80 Q85.5 120 86 114 L90 30 Z" style="fill:var(--bag-color, #F7E9CC)" ${O()}/>
  <path d="M24 34 L26 110" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
</g>
<g data-layer="window">
  <rect x="30" y="46" width="44" height="34" rx="8" style="fill:var(--substance-color, #FFFFFF)" ${O(3)}/>
  ${grains({ x0: 34, x1: 70, y0: 50, y1: 76 }, 12, 71)}
</g>
<g data-layer="top">
  <path d="M10 16 H94 V31 H10 Z" style="fill:var(--bag-fold, #ECD5A9)" ${O()}/>
  <rect x="40" y="6" width="24" height="16" rx="3" style="fill:var(--clip-color, #1F5FCC)" ${O(3.5)}/>
</g>
<g data-layer="label"><path d="M23 88 L25 86.5 L79 86 L81 88 L80.5 108 L78.5 110 L25 110.5 L23 108.5 Z" style="fill:var(--label-color, #FFFFFF)" ${O(2.5)}/></g>
`);

// ================= ЭФФЕКТЫ (накладные спрайты) =================
const fx = {};
fx.steam = svgRoot({ name: 'fx-steam', w: 80, h: 90, title: 'Пар', cls: 'hl-asset hl-fx' }, `
<g fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round">
  <path class="hl-wisp" style="--i:0" d="M22 84 C10 70 34 60 22 46 C12 34 30 24 24 12"/>
  <path class="hl-wisp" style="--i:1" d="M42 86 C30 72 54 62 42 48 C32 36 50 26 44 14"/>
  <path class="hl-wisp" style="--i:2" d="M60 84 C50 72 70 64 60 52 C52 42 66 34 62 24"/>
</g>
<g fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" opacity="0.18">
  <path d="M22 84 C10 70 34 60 22 46 C12 34 30 24 24 12"/><path d="M42 86 C30 72 54 62 42 48 C32 36 50 26 44 14"/><path d="M60 84 C50 72 70 64 60 52 C52 42 66 34 62 24"/>
</g>`);
fx.smell = svgRoot({ name: 'fx-smell', w: 96, h: 80, title: 'Запах', cls: 'hl-asset hl-fx' }, `
<g fill="none" style="stroke:var(--smell-color, #8A6CF0)" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="1 10">
  <path class="hl-wave" style="--i:0" d="M8 62 C24 52 30 70 46 60 S70 50 86 58"/>
  <path class="hl-wave" style="--i:1" d="M8 42 C24 32 30 50 46 40 S70 30 86 38"/>
  <path class="hl-wave" style="--i:2" d="M8 22 C24 12 30 30 46 20 S70 10 86 18"/>
</g>`);
fx.sparkle = svgRoot({ name: 'fx-sparkle', w: 32, h: 32, title: 'Искра', cls: 'hl-asset hl-fx' }, `
<path d="M16 2 C17 11 21 15 30 16 C21 17 17 21 16 30 C15 21 11 17 2 16 C11 15 15 11 16 2 Z" style="fill:var(--sparkle-color, #FFC93C)" ${O(2.5)}/>`);
fx.drop = svgRoot({ name: 'fx-drop', w: 24, h: 32, title: 'Капля', cls: 'hl-asset hl-fx' }, `
<path d="M12 3 C12 3 4 14 4 20 A8 8 0 0 0 20 20 C20 14 12 3 12 3 Z" style="fill:var(--liquid-color, #CDE9FB)" ${O(2.5)}/>${shine('M8.5 19 Q8.5 23 11 25', 2)}`);
fx['pour-stream'] = svgRoot({ name: 'fx-pour-stream', w: 20, h: 120, title: 'Струя жидкости', cls: 'hl-asset hl-fx', extraAttrs: 'preserveAspectRatio="none"' }, `
<path d="M10 0 C6 30 8 60 10 120" fill="none" stroke="${INK}" stroke-width="10" stroke-linecap="round" opacity="0.35"/>
<path d="M10 0 C6 30 8 60 10 120" fill="none" style="stroke:var(--liquid-color, #CDE9FB)" stroke-width="7" stroke-linecap="round"/>`);
fx['powder-stream'] = svgRoot({ name: 'fx-powder-stream', w: 40, h: 120, title: 'Сыплющийся порошок', cls: 'hl-asset hl-fx' }, `
${(() => { const r = rng(91); let s = ''; for (let i = 0; i < 28; i++) { const y = r() * 116; const x = 20 + (r() - 0.5) * (8 + y * 0.18); s += `<rect class="hl-grain" style="--i:${i};fill:var(--powder-color, #FFFFFF)" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="4" height="4" rx="1" stroke="${INK}" stroke-width="1.2"/>`; } return s; })()}`);
fx.crystal = svgRoot({ name: 'fx-crystal', w: 40, h: 40, title: 'Кристалл', cls: 'hl-asset hl-fx' }, `
<path d="M20 4 L34 11 V27 L20 35 L6 27 V11 Z" style="fill:var(--crystal-color, #FFFFFF)" ${O(2.5)}/>
<path d="M6 11 L20 18 L34 11 M20 18 V35" fill="none" ${O(2)} opacity="0.6"/>
<path d="M10 14 L18 18" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round"/>`);
fx['heat-waves'] = svgRoot({ name: 'fx-heat-waves', w: 80, h: 60, title: 'Тепло', cls: 'hl-asset hl-fx' }, `
<g fill="none" stroke="#FF6B3D" stroke-width="4" stroke-linecap="round">
  <path class="hl-heatwave" style="--i:0" d="M16 54 C8 44 24 36 16 24 C10 16 20 10 16 4"/>
  <path class="hl-heatwave" style="--i:1" d="M40 54 C32 44 48 36 40 24 C34 16 44 10 40 4"/>
  <path class="hl-heatwave" style="--i:2" d="M64 54 C56 44 72 36 64 24 C58 16 68 10 64 4"/>
</g>`);
fx.frost = svgRoot({ name: 'fx-frost', w: 32, h: 32, title: 'Холод', cls: 'hl-asset hl-fx' }, `
<g fill="none" stroke="#2A80C2" stroke-width="2.5" stroke-linecap="round"><path d="M16 3 V29 M4.7 9.5 L27.3 22.5 M4.7 22.5 L27.3 9.5 M12.5 5 L16 8 L19.5 5 M12.5 27 L16 24 L19.5 27"/></g>`);
fx.splash = svgRoot({ name: 'fx-splash', w: 64, h: 32, title: 'Всплеск', cls: 'hl-asset hl-fx' }, `
<g style="fill:var(--liquid-color, #CDE9FB)" ${O(2)}><circle cx="14" cy="18" r="4"/><circle cx="24" cy="9" r="3"/><circle cx="40" cy="9" r="3.5"/><circle cx="50" cy="18" r="4"/></g>`);
fx.fizz = svgRoot({ name: 'fx-fizz', w: 48, h: 64, title: 'Пузырёк газа', cls: 'hl-asset hl-fx' }, `
<circle cx="24" cy="40" r="10" fill="#FFFFFF" fill-opacity="0.7" stroke="${INK}" stroke-opacity="0.5" stroke-width="2"/>${shine('M19 36 Q20 33 23 32', 2.5)}`);

// ================= ИКОНКИ 32×32 =================
// Контур 2.5, currentColor, скругления. Вторичная заливка — currentColor с прозрачностью .18
const S = 'fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"';
const SOFT = 'fill="currentColor" fill-opacity="0.18" stroke="none"';
const beakerIc = 'M7 8 V24.5 A3.5 3.5 0 0 0 10.5 28 H21.5 A3.5 3.5 0 0 0 25 24.5 V8';
const icons = {
  // действия
  stir: ['Перемешать', `<path ${SOFT} d="M9 18 H23 V24.5 A3.5 3.5 0 0 1 19.5 28 H12.5 A3.5 3.5 0 0 1 9 24.5 Z"/><path ${S} d="M6 10 V24.5 A3.5 3.5 0 0 0 9.5 28 H22.5 A3.5 3.5 0 0 0 26 24.5 V10 M20 3 L14.5 22 M10 18 C13 21.5 19 21.5 22 18 M19 16.5 L22 18 L20.5 21"/>`],
  heat: ['Нагреть', `<path ${SOFT} d="M16 3 C21 9 24.5 13 24.5 19 A8.5 8.5 0 0 1 7.5 19 C7.5 14 10.5 11 13 8 C13 12 15 14 17 14 C18 11 17.5 7 16 3 Z"/><path ${S} d="M16 3 C21 9 24.5 13 24.5 19 A8.5 8.5 0 0 1 7.5 19 C7.5 14 10.5 11 13 8 C13 12 15 14 17 14 C18 11 17.5 7 16 3 Z"/>`],
  cool: ['Охладить', `<path ${S} d="M16 3 V29 M4.7 9.5 L27.3 22.5 M4.7 22.5 L27.3 9.5 M12.5 4.5 L16 8 L19.5 4.5 M12.5 27.5 L16 24 L19.5 27.5 M4.2 14 L8.6 12.2 L7.6 7.6 M27.8 18 L23.4 19.8 L24.4 24.4 M7.6 24.4 L8.6 19.8 L4.2 18 M24.4 7.6 L23.4 12.2 L27.8 14"/>`],
  wait: ['Подождать', `<path ${SOFT} d="M12 25 H20 L16 20.5 Z"/><path ${S} d="M8 4 H24 M8 28 H24 M10 4 V7.5 C10 11.5 16 13 16 16 C16 19 10 20.5 10 24.5 V28 M22 4 V7.5 C22 11.5 16 13 16 16 C16 19 22 20.5 22 24.5 V28"/>`],
  filter: ['Профильтровать', `<path ${SOFT} d="M8 8 H24 L17.5 16 H14.5 Z"/><path ${S} d="M4.5 6 H27.5 L18.5 17 V25 L13.5 27.5 V17 Z"/>`],
  evaporate: ['Выпарить', `<path ${SOFT} d="M5 20 H27 C26 25 22 27.5 16 27.5 C10 27.5 6 25 5 20 Z"/><path ${S} d="M4 20 H28 M5 20 C6 25 10 27.5 16 27.5 C22 27.5 26 25 27 20 M11 15 C9 13 13 11 11 7.5 M16 15 C14 13 18 11 16 7.5 M21 15 C19 13 23 11 21 7.5"/>`],
  smell: ['Понюхать', `<path ${S} d="M4 11 H18 A4 4 0 1 0 14 7 M4 17 H24 A4 4 0 1 1 20 21 M4 23 H12"/>`],
  magnify: ['Рассмотреть в лупу', `<circle ${SOFT} cx="13.5" cy="13.5" r="8.5"/><circle ${S} cx="13.5" cy="13.5" r="9"/><path ${S} d="M20.2 20.2 L28 28 M9 10.5 A5 5 0 0 1 12 8"/>`],
  temperature: ['Измерить температуру', `<path ${SOFT} d="M13 19 V6 A3 3 0 0 1 19 6 V19 A6.5 6.5 0 1 1 13 19 Z"/><path ${S} d="M12.5 18.6 V6.5 A3.5 3.5 0 0 1 19.5 6.5 V18.6 A6.8 6.8 0 1 1 12.5 18.6 Z M16 23 V11 M23 7 H26 M23 11.5 H26 M23 16 H26"/>`],
  ph: ['Измерить pH', `<path fill="currentColor" fill-opacity="0.35" stroke="none" d="M11 19 H21 V27.5 A1.5 1.5 0 0 1 19.5 29 H12.5 A1.5 1.5 0 0 1 11 27.5 Z"/><path ${S} d="M12.5 3 H19.5 A1.5 1.5 0 0 1 21 4.5 V27.5 A1.5 1.5 0 0 1 19.5 29 H12.5 A1.5 1.5 0 0 1 11 27.5 V4.5 A1.5 1.5 0 0 1 12.5 3 Z M11 19 H21 M14 8 H18 M14 12 H18"/>`],
  magnet: ['Магнит', `<path ${SOFT} d="M6 21 H12 V27 H6 Z M20 21 H26 V27 H20 Z"/><path ${S} d="M6 27 V14 A10 10 0 0 1 26 14 V27 H20 V14 A4 4 0 0 0 12 14 V27 Z M6 21 H12 M20 21 H26"/>`],
  weigh: ['Взвесить', `<path ${SOFT} d="M11 18 H21 V22 H11 Z"/><path ${S} d="M7 14 H25 L27.5 27 H4.5 Z M9 10 H23 M16 10 V14 M11 18 H21 V22 H11 Z"/>`],
  add: ['Добавить', `<path ${S} d="${beakerIc} M4 8 H10 M22 8 H28 M16 13 V23 M11 18 H21"/>`],
  pour: ['Налить', `<path ${SOFT} d="M11 22 H23 V25.5 A2.5 2.5 0 0 1 20.5 28 H13.5 A2.5 2.5 0 0 1 11 25.5 Z"/><path ${S} d="M9 12 V25.5 A2.5 2.5 0 0 0 11.5 28 H22.5 A2.5 2.5 0 0 0 25 25.5 V12 M4 4 L13 6 L11 11 L5 9.5 Z M12 9 C14 11 15.5 14 15.5 18"/>`],
  // интерфейс
  undo: ['Отменить', `<path ${S} d="M10 8 L5 13 L10 18 M5 13 H19 A7 7 0 0 1 19 27 H13"/>`],
  clear: ['Вылить', `<path ${SOFT} d="M5.5 18 L10 22.5 L5 25 Z"/><path ${S} d="M10 5 L23.5 12.5 L17.5 23.5 C16.5 25.5 14 26 12 25 L5.5 21.5 C3.8 20.5 3.3 18.5 4.2 16.8 Z M8.5 9.5 L22 17 M25 21 V23 M28 25.5 V27.5 M24 27 V29"/>`],
  hint: ['Подсказка', `<path ${SOFT} d="M12 22 C12 19 8.5 17 8.5 12.5 A7.5 7.5 0 0 1 23.5 12.5 C23.5 17 20 19 20 22 Z"/><path ${S} d="M12 22 C12 19 8 17 8 12.5 A8 8 0 0 1 24 12.5 C24 17 20 19 20 22 Z M12.5 26 H19.5 M14 29.5 H18"/>`],
  journal: ['Журнал', `<path ${SOFT} d="M9 4 H24 A2 2 0 0 1 26 6 V26 A2 2 0 0 1 24 28 H9 Z"/><path ${S} d="M9 4 H24 A2 2 0 0 1 26 6 V26 A2 2 0 0 1 24 28 H9 Z M5 9 H11 M5 16 H11 M5 23 H11 M15 10 H22 M15 15 H22 M15 20 H19"/>`],
  close: ['Закрыть', `<path ${S} d="M8 8 L24 24 M24 8 L8 24"/>`],
  check: ['Готово', `<path ${S} d="M6 17 L13 24 L26 9"/>`],
  plus: ['Больше', `<path ${S} d="M16 6 V26 M6 16 H26"/>`],
  minus: ['Меньше', `<path ${S} d="M6 16 H26"/>`],
  info: ['Справка', `<circle ${SOFT} cx="16" cy="16" r="12"/><circle ${S} cx="16" cy="16" r="12.5"/><path ${S} d="M16 14.5 V22.5 M16 9.5 V9.6"/>`],
  caution: ['Осторожно', `<path ${SOFT} d="M16 5 L28 26 H4 Z"/><path ${S} d="M14.3 5.6 A2 2 0 0 1 17.7 5.6 L28.5 24.5 A2 2 0 0 1 26.8 27.5 H5.2 A2 2 0 0 1 3.5 24.5 Z M16 12.5 V18.5 M16 23 V23.1"/>`],
  shield: ['Безопасность', `<path ${SOFT} d="M16 3 L26 7 V15 C26 22 21 26.5 16 29 C11 26.5 6 22 6 15 V7 Z"/><path ${S} d="M16 3 L26 7 V15 C26 22 21 26.5 16 29 C11 26.5 6 22 6 15 V7 Z M11.5 16 L14.5 19 L20.5 12.5"/>`],
  goggles: ['Защитные очки', `<path ${SOFT} d="M5 12 H27 V20 A3 3 0 0 1 24 23 H19 L16 19 L13 23 H8 A3 3 0 0 1 5 20 Z"/><path ${S} d="M5 12 H27 V20 A3 3 0 0 1 24 23 H19.5 L16 19 L12.5 23 H8 A3 3 0 0 1 5 20 Z M2.5 15 H5 M27 15 H29.5"/>`],
  deeper: ['Копнуть глубже', `<path ${SOFT} d="M10.5 14.5 L17.5 21.5 L12 27 C10 29 6.5 29 5 27.5 C3.5 26 3.5 22.5 5.5 20.5 Z"/><path ${S} d="M10.5 14.5 L17.5 21.5 L12 27 C10 29 6.5 29 5 27.5 C3.5 26 3.5 22.5 5.5 20.5 Z M14 18 L25 7 M22 4 L28 10"/>`],
  'sound-on': ['Звук включён', `<path ${SOFT} d="M5 12 H10 L16 7 V25 L10 20 H5 Z"/><path ${S} d="M5 12 H10 L16 7 V25 L10 20 H5 Z M20.5 12 A5.5 5.5 0 0 1 20.5 20 M23.5 8.5 A10 10 0 0 1 23.5 23.5"/>`],
  'sound-off': ['Звук выключен', `<path ${SOFT} d="M5 12 H10 L16 7 V25 L10 20 H5 Z"/><path ${S} d="M5 12 H10 L16 7 V25 L10 20 H5 Z M21 12.5 L28 19.5 M28 12.5 L21 19.5"/>`],
  lock: ['Закрыто', `<rect ${SOFT} x="7" y="14" width="18" height="14" rx="3"/><rect ${S} x="7" y="14" width="18" height="14" rx="3"/><path ${S} d="M11 14 V10.5 A5 5 0 0 1 21 10.5 V14 M16 19.5 V22.5"/>`],
  star: ['Звезда', `<path ${SOFT} d="M16 3.5 L19.8 11.3 L28.3 12.5 L22.1 18.5 L23.6 27 L16 23 L8.4 27 L9.9 18.5 L3.7 12.5 L12.2 11.3 Z"/><path ${S} d="M16 3.5 L19.8 11.3 L28.3 12.5 L22.1 18.5 L23.6 27 L16 23 L8.4 27 L9.9 18.5 L3.7 12.5 L12.2 11.3 Z"/>`],
  back: ['Назад', `<path ${S} d="M19 6 L9 16 L19 26"/>`],
  forward: ['Дальше', `<path ${S} d="M13 6 L23 16 L13 26"/>`],
  map: ['Карта', `<path ${SOFT} d="M11 5 L21 9 V27 L11 23 Z"/><path ${S} d="M4 8 L11 5 L21 9 L28 6 V24 L21 27 L11 23 L4 26 Z M11 5 V23 M21 9 V27"/>`],
  sandbox: ['Песочница', `<path ${SOFT} d="M9.5 20 H22.5 L25 25 A2 2 0 0 1 23.2 28 H8.8 A2 2 0 0 1 7 25 Z"/><path ${S} d="M12 4 H18 M13 4 V12 L6.6 25 A2 2 0 0 0 8.4 28 H21.6 A2 2 0 0 0 23.4 25 L17 12 V4 M9.5 20 H20.5 M25 3 V8 M22.5 5.5 H27.5"/>`],
  replay: ['Повторить', `<path ${S} d="M26 16 A10 10 0 1 1 22.5 8.4 M23.5 3.5 V9.5 H17.5"/>`],
  drag: ['Перетащить', `<path ${S} d="M16 3 V29 M3 16 H29 M12 7 L16 3 L20 7 M12 25 L16 29 L20 25 M7 12 L3 16 L7 20 M25 12 L29 16 L25 20"/>`],
  eye: ['Наблюдать', `<path ${SOFT} d="M3 16 C7 9 11 7 16 7 C21 7 25 9 29 16 C25 23 21 25 16 25 C11 25 7 23 3 16 Z"/><path ${S} d="M3 16 C7 9 11 7 16 7 C21 7 25 9 29 16 C25 23 21 25 16 25 C11 25 7 23 3 16 Z"/><circle ${S} cx="16" cy="16" r="4.5"/>`],
  pencil: ['Записать', `<path ${SOFT} d="M21 5 L27 11 L12 26 L5 27 L6 20 Z"/><path ${S} d="M21 5 L27 11 L12 26 L5 27 L6 20 Z M18 8 L24 14"/>`],
  home: ['Есть дома', `<path ${SOFT} d="M7 15 L16 7 L25 15 V27 H7 Z"/><path ${S} d="M4 15.5 L16 5 L28 15.5 M7.5 13 V27 H24.5 V13 M13 27 V20 H19 V27"/>`],
  'lab-only': ['Только в виртуальной лабе', `<path ${SOFT} d="M12 4 H20 V12 L26.5 24.5 A2.5 2.5 0 0 1 24.3 28 H7.7 A2.5 2.5 0 0 1 5.5 24.5 L12 12 Z"/><path ${S} d="M10.5 4 H21.5 M12.5 4 V12 L5.8 24.6 A2.4 2.4 0 0 0 7.9 28 H24.1 A2.4 2.4 0 0 0 26.2 24.6 L19.5 12 V4 M9 20 H23"/>`],
  target: ['Цель', `<circle ${SOFT} cx="16" cy="16" r="12"/><circle ${S} cx="16" cy="16" r="12.5"/><circle ${S} cx="16" cy="16" r="7"/><circle fill="currentColor" cx="16" cy="16" r="2.5"/>`],
  hand: ['В руке', `<path ${SOFT} d="M9 16 V9 A2 2 0 0 1 13 9 V7 A2 2 0 0 1 17 7 V8 A2 2 0 0 1 21 8 V11 A2 2 0 0 1 25 11 V19 C25 25 21 29 16 29 C11.5 29 9 26.5 7 23 L4.8 19 A2 2 0 0 1 8.2 17 Z"/><path ${S} d="M9 17 V9 A2 2 0 0 1 13 9 V15 M13 9 V7 A2 2 0 0 1 17 7 V15 M17 8 A2 2 0 0 1 21 8 V15 M21 11 A2 2 0 0 1 25 11 V19 C25 25 21 29 16 29 C11.5 29 9 26.5 7 23 L4.8 19 A2 2 0 0 1 8.2 17 L9 18.5"/>`],
  menu: ['Меню', `<path ${S} d="M5 9 H27 M5 16 H27 M5 23 H27"/>`],
  // результаты (иконка обязательна рядом с цветом)
  'result-gas': ['Выделился газ', `<circle ${SOFT} cx="12" cy="21" r="6"/><circle ${S} cx="12" cy="21" r="6"/><circle ${S} cx="21.5" cy="12.5" r="4"/><circle ${S} cx="13.5" cy="7" r="2.5"/><circle ${S} cx="24" cy="24" r="3"/>`],
  'result-precipitate': ['Выпал осадок', `<path ${SOFT} d="M7 22 C10 19.5 13 21.5 16 20 C19 21.5 22 19.5 25 22 V24.5 A3.5 3.5 0 0 1 21.5 28 H10.5 A3.5 3.5 0 0 1 7 24.5 Z"/><path ${S} d="${beakerIc} M7 22 C10 19.5 13 21.5 16 20 C19 21.5 22 19.5 25 22 M13 12 V12.1 M18 15 V15.1 M15 7 V7.1"/>`],
  'result-color': ['Изменился цвет', `<path fill="currentColor" fill-opacity="0.45" stroke="none" d="M16 4 C16 4 7 14 7 20 A9 9 0 0 0 16 29 Z"/><path ${S} d="M16 4 C16 4 7 14 7 20 A9 9 0 0 0 25 20 C25 14 16 4 16 4 Z"/>`],
  'result-dissolve': ['Растворилось', `<path ${S} d="${beakerIc} M11 22 V22.1 M15 18 V18.1 M20 23 V23.1 M18 13 V13.1 M12 15 V15.1"/>`],
  'result-warm': ['Стало тепло', `<path ${SOFT} d="M9 19 V7 A3 3 0 0 1 15 7 V19 A6.5 6.5 0 1 1 9 19 Z"/><path ${S} d="M8.5 18.6 V7.5 A3.5 3.5 0 0 1 15.5 7.5 V18.6 A6.8 6.8 0 1 1 8.5 18.6 Z M12 23 V12 M25 14 V4 M21 8 L25 4 L29 8"/>`],
  'result-cold': ['Стало холодно', `<path ${SOFT} d="M9 19 V7 A3 3 0 0 1 15 7 V19 A6.5 6.5 0 1 1 9 19 Z"/><path ${S} d="M8.5 18.6 V7.5 A3.5 3.5 0 0 1 15.5 7.5 V18.6 A6.8 6.8 0 1 1 8.5 18.6 Z M12 23 V19 M25 4 V14 M21 10 L25 14 L29 10"/>`],
  'result-foam': ['Появилась пена', `<path ${SOFT} d="M6 13 A4 4 0 0 1 11 9 A5 5 0 0 1 20 8 A4 4 0 0 1 26 13 Z"/><path ${S} d="M7 13 V24.5 A3.5 3.5 0 0 0 10.5 28 H21.5 A3.5 3.5 0 0 0 25 24.5 V13 M5 13 A4 4 0 0 1 11 9 A5 5 0 0 1 20.5 8 A4 4 0 0 1 27 13 Z"/>`],
  'result-steam': ['Пошёл пар', `<path ${S} d="M5 26 H27 M10 21 C8 18 12 16 10 12.5 C8.5 10 11 8 10 5 M16 21 C14 18 18 16 16 12.5 C14.5 10 17 8 16 5 M22 21 C20 18 24 16 22 12.5 C20.5 10 23 8 22 5"/>`],
  'result-smell': ['Появился запах', `<path ${S} d="M4 11 H18 A4 4 0 1 0 14 7 M4 17 H24 A4 4 0 1 1 20 21 M4 23 H12"/>`],
  'result-crystals': ['Появились кристаллы', `<path ${SOFT} d="M16 4 L26 9.5 L16 15 L6 9.5 Z"/><path ${S} d="M16 4 L26 9.5 V21.5 L16 27 L6 21.5 V9.5 Z M6 9.5 L16 15 L26 9.5 M16 15 V27"/>`],
  'result-melt': ['Расплавилось', `<path ${SOFT} d="M8 6 H24 V16 C24 18 22 17.5 22 20 V24 A2 2 0 0 1 18 24 V19.5 C18 18 16 18 16 19.5 V21 A2 2 0 0 1 12 21 V17.5 C12 16 8 17 8 15 Z"/><path ${S} d="M8 6 H24 V16 C24 18 22 17.5 22 20 V24 A2 2 0 0 1 18 24 V19.5 C18 18 16 18 16 19.5 V21 A2 2 0 0 1 12 21 V17.5 C12 16 8 17 8 15 Z"/>`],
  'result-nothing': ['Ничего не изменилось', `<path ${S} d="${beakerIc} M11.5 16 H20.5 M11.5 21 H20.5"/>`],
  'result-turbid': ['Стало мутным', `<path ${SOFT} d="M7 13 H25 V24.5 A3.5 3.5 0 0 1 21.5 28 H10.5 A3.5 3.5 0 0 1 7 24.5 Z"/><path ${S} d="${beakerIc} M7 13 H25 M11 18 V18.1 M16 21 V21.1 M20 17 V17.1 M13 24 V24.1 M21 23 V23.1"/>`],
};

// ================= ЗНАЧКИ-НАГРАДЫ =================
const hex = 'M60 8 L108.5 36 V92 L60 120 L11.5 92 V36 Z';
const hexIn = 'M60 20 L98 42 V86 L60 108 L22 86 V42 Z';
const badgeDefs = {
  'first-experiment': { title: 'Первый опыт', bg: '#3B78E3', ring: '#86AEF0', emblem: `
    <path d="M42 46 V80 Q42 88 50 88 H70 Q78 88 78 80 V46" fill="#FFFFFF" ${O()}/>
    <path d="M44 66 H76 V80 Q76 86 70 86 H50 Q44 86 44 80 Z" fill="#86AEF0"/>
    <path d="M42 46 V80 Q42 88 50 88 H70 Q78 88 78 80 V46 M38 46 H82" fill="none" ${O()}/>
    <circle cx="54" cy="58" r="4" fill="#FFFFFF" ${O(2.5)}/><circle cx="66" cy="52" r="3" fill="#FFFFFF" ${O(2.5)}/><circle cx="60" cy="40" r="3.5" fill="#FFFFFF" ${O(2.5)}/>` },
  'powder-detective': { title: 'Сыщик порошков', bg: '#FFC93C', ring: '#FFE28F', emblem: `
    <path d="M34 88 C40 74 48 70 56 70 C64 70 72 74 78 88 Z" fill="#FFFFFF" ${O()}/>
    <circle cx="66" cy="54" r="15" fill="#EAF6FF" ${O(5)}/>
    <path d="M77 65 L88 76" ${O(8)}/>
    <path d="M58 50 A9 9 0 0 1 64 45" fill="none" stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round"/>` },
  'safety-pro': { title: 'Знаток безопасности', bg: '#14918A', ring: '#CDEDE8', emblem: `
    <path d="M30 56 H90 V72 Q90 80 82 80 H70 L60 70 L50 80 H38 Q30 80 30 72 Z" fill="#FFC93C" ${O()}/>
    <path d="M36 61 H54 V71 Q54 74 51 74 H39 Q36 74 36 71 Z M66 61 H84 V71 Q84 74 81 74 H69 Q66 74 66 71 Z" fill="#CDEBFF" ${O(3)}/>
    <path d="M24 62 H30 M90 62 H96" ${O()}/>` },
  observer: { title: 'Наблюдатель', bg: '#8FD3AE', ring: '#DDF3E6', emblem: `
    <rect x="40" y="38" width="40" height="52" rx="4" fill="#FFFFFF" ${O()}/>
    <path d="M48 52 H72 M48 62 H72 M48 72 H62" ${O(3)} opacity="0.6"/>
    <path d="M70 86 L86 54 L93 58 L77 90 L69 93 Z" fill="#FFC93C" ${O(3.5)}/>` },
  discoverer: { title: 'Первооткрыватель', bg: '#8B2FC9', ring: '#EBDAFA', emblem: `
    <path d="M52 36 H68 M54 36 V54 L38 82 Q35 90 44 90 H76 Q85 90 82 82 L66 54 V36" fill="#FFFFFF" ${O()}/>
    <path d="M43 76 H77 L80 82 Q82 88 76 88 H44 Q38 88 40 82 Z" fill="#A86AE3"/>
    <path d="M52 36 H68 M54 36 V54 L38 82 Q35 90 44 90 H76 Q85 90 82 82 L66 54 V36" fill="none" ${O()}/>
    <path d="M82 30 C83 38 86 41 94 42 C86 43 83 46 82 54 C81 46 78 43 70 42 C78 41 81 38 82 30 Z" fill="#FFC93C" ${O(2.5)}/>` },
  'solution-master': { title: 'Мастер растворов', bg: '#1F5FCC', ring: '#D9E6FC', emblem: `
    <path d="M60 36 L82 48 V74 L60 88 L38 74 V48 Z" fill="#FFFFFF" ${O()}/>
    <path d="M38 48 L60 60 L82 48 M60 60 V88" fill="none" ${O(3)}/>
    <path d="M45 52 L56 58" stroke="#86AEF0" stroke-width="4" stroke-linecap="round"/>` },
};
const badges = {};
for (const [k, b] of Object.entries(badgeDefs)) {
  badges[k] = svgRoot({ name: `badge-${k}`, w: 120, h: 136, title: `Значок «${b.title}»`, cls: 'hl-asset hl-asset--badge' }, `
<g data-layer="ribbon"><path d="M38 108 L30 132 L42 127 L48 135 L56 114 Z M82 108 L90 132 L78 127 L72 135 L64 114 Z" fill="#E2483D" ${O(3.5)}/></g>
<g data-layer="medal"><path d="${hex}" fill="${b.bg}" ${O(5)}/><path d="${hexIn}" fill="none" stroke="${b.ring}" stroke-width="3" stroke-dasharray="2 7" stroke-linecap="round"/></g>
<g data-layer="emblem">${b.emblem}</g>
<g data-layer="shine">${shine('M24 44 L24 60', 4)}</g>
`);
}

// ================= ПЕРСОНАЖ: ПИПА =================
// Колба-учёная с круглым дном на пробковом кольце. Жидкость внутри — сама Пипа (цвет через --guide-color).
// Имена файлов нейтральные (guide-*), чтобы смена имени персонажа не трогала код.
function guide(pose) {
  const C = { body: '#8A6CF0', shade: '#6A4FD6', light: '#BCA9FF', cheek: '#FF9DBB', gog: '#FFC93C', lens: '#CDEBFF' };
  const glove = (x, y, r = 11) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#FFFFFF" ${O()}/>`;
  const arm = (d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
  let arms = '', eyes = '', mouth = '', brows = '', extra = '', gogglesUp = true, liquidWave = 'M38 112 Q54 104 70 112 T102 112 T134 112 T166 112';
  const eyeOpen = (x, y, px = 0, py = 0) => `<ellipse cx="${x}" cy="${y}" rx="9.5" ry="11.5" fill="#FFFFFF" ${O(3)}/><circle cx="${x + px}" cy="${y + 1 + py}" r="5.2" fill="${INK}"/><circle cx="${x + px + 2}" cy="${y - 2 + py}" r="1.8" fill="#FFFFFF"/>`;
  switch (pose) {
    case 'explain':
      arms = arm('M46 146 Q30 158 32 176') + glove(32, 178) + arm('M154 136 Q172 120 170 96') + glove(170, 90) + `<path d="M170 79 V70" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M170 79 V71" stroke="#FFFFFF" stroke-width="1.5" stroke-linecap="round"/>`;
      eyes = eyeOpen(82, 132) + eyeOpen(118, 132);
      brows = `<path d="M73 115 Q81 111 89 114 M111 114 Q119 111 127 115" fill="none" ${O(3.5)}/>`;
      mouth = `<path d="M90 154 Q100 166 110 154 Z" fill="#7A2B4A" ${O(3)}/>`;
      break;
    case 'happy':
      arms = arm('M48 128 Q26 108 30 82') + glove(30, 76) + arm('M152 128 Q174 108 170 82') + glove(170, 76);
      eyes = `<path d="M72 134 Q82 122 92 134 M108 134 Q118 122 128 134" fill="none" ${O(4.5)}/>`;
      mouth = `<path d="M84 150 Q100 172 116 150 Z" fill="#7A2B4A" ${O(3)}/><path d="M92 160 Q100 166 108 160" fill="none" stroke="#FF9DBB" stroke-width="4" stroke-linecap="round"/>`;
      liquidWave = 'M38 108 Q54 98 70 108 T102 108 T134 108 T166 108';
      extra = `<g data-layer="fx"><circle cx="100" cy="6" r="5" fill="#FFFFFF" ${O(2.5)}/><circle cx="118" cy="16" r="3.5" fill="#FFFFFF" ${O(2.5)}/><circle cx="84" cy="14" r="3" fill="#FFFFFF" ${O(2.5)}/>
        <path d="M150 34 C151 41 153 43 160 44 C153 45 151 47 150 54 C149 47 147 45 140 44 C147 43 149 41 150 34 Z" fill="${C.gog}" ${O(2.5)}/>
        <path d="M46 40 C47 46 49 48 55 49 C49 50 47 52 46 58 C45 52 43 50 37 49 C43 48 45 46 46 40 Z" fill="${C.gog}" ${O(2.5)}/></g>`;
      break;
    case 'thinking':
      arms = arm('M50 150 Q66 176 84 168') + glove(88, 166, 10) + arm('M152 146 Q172 152 166 168') + glove(164, 170);
      eyes = eyeOpen(82, 130, 3, -4) + eyeOpen(118, 130, 3, -4);
      brows = `<path d="M73 112 Q81 109 89 113 M111 109 Q119 105 127 108" fill="none" ${O(3.5)}/>`;
      mouth = `<path d="M94 152 Q102 149 110 153" fill="none" ${O(3.5)}/>`;
      liquidWave = 'M38 114 Q54 110 70 114 T102 114 T134 114 T166 114';
      extra = `<g data-layer="fx"><circle cx="160" cy="58" r="4" fill="#FFFFFF" ${O(2.5)}/><circle cx="170" cy="42" r="6" fill="#FFFFFF" ${O(2.5)}/>
        <circle cx="180" cy="18" r="15" fill="#FFFFFF" ${O(3)}/><path d="M175 13 Q175 7 180.5 7 Q186 7 186 12.5 Q186 16 181 18 V21 M181 27 V27.2" fill="none" ${O(3)}/></g>`;
      break;
    case 'warn':
      gogglesUp = false;
      arms = arm('M46 146 Q30 158 34 176') + glove(34, 178) + arm('M154 136 Q172 130 176 112') + `<g transform="translate(176 100)"><path d="M-13 12 V-6 Q-13 -10 -9.5 -10 Q-6 -10 -6 -6 V-12 Q-6 -16 -2.5 -16 Q1 -16 1 -12 V-10 Q1 -14 4.5 -14 Q8 -14 8 -10 V-6 Q8 -9 11 -9 Q14 -9 14 -6 V6 Q14 16 3 16 H-5 Q-13 16 -13 12 Z" fill="#FFFFFF" ${O(3.5)}/></g>`;
      eyes = `<ellipse cx="82" cy="132" rx="7" ry="8.5" fill="#FFFFFF" ${O(2.5)}/><circle cx="82" cy="133" r="4" fill="${INK}"/><ellipse cx="118" cy="132" rx="7" ry="8.5" fill="#FFFFFF" ${O(2.5)}/><circle cx="118" cy="133" r="4" fill="${INK}"/>`;
      brows = `<path d="M70 107 Q80 102 90 106 M110 106 Q120 102 130 107" fill="none" ${O(3.5)}/>`;
      mouth = `<path d="M92 157 H108" fill="none" ${O(3.5)}/>`;
      liquidWave = 'M38 112 Q54 108 70 112 T102 112 T134 112 T166 112';
      break;
  }
  const goggles = gogglesUp
    ? `<g data-layer="goggles"><path d="M78 58 H122" stroke="${INK}" stroke-width="5"/><rect x="74" y="46" width="24" height="17" rx="7" fill="${C.gog}" ${O(3.5)}/><rect x="102" y="46" width="24" height="17" rx="7" fill="${C.gog}" ${O(3.5)}/><rect x="79" y="50" width="14" height="9" rx="4" fill="${C.lens}"/><rect x="107" y="50" width="14" height="9" rx="4" fill="${C.lens}"/></g>`
    : `<g data-layer="goggles"><path d="M40 130 Q50 122 60 124 M140 124 Q150 122 160 130" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M58 118 H142 V138 Q142 148 132 148 H112 L100 138 L88 148 H68 Q58 148 58 138 Z" fill="${C.gog}" ${O(4)}/><path d="M65 123 H94 V136 Q94 141 89 141 H70 Q65 141 65 136 Z M106 123 H135 V136 Q135 141 130 141 H111 Q106 141 106 136 Z" fill="${C.lens}" fill-opacity="0.85" ${O(2.5)}/></g>`;
  const titles = { explain: 'Пипа объясняет', happy: 'Пипа радуется', thinking: 'Пипа задумалась', warn: 'Пипа предупреждает' };
  return svgRoot({ name: `guide-${pose}`, w: 200, h: 220, title: titles[pose], cls: 'hl-asset hl-asset--character', extraAttrs: `data-pose="${pose}"` }, `
<defs><clipPath id="guide-${pose}-glass"><circle cx="100" cy="134" r="60"/></clipPath></defs>
<g data-layer="stand"><ellipse cx="100" cy="202" rx="42" ry="11" fill="${WOOD_D}" ${O()}/><ellipse cx="100" cy="199" rx="24" ry="5" fill="#B38A50"/></g>
${arms}
<g data-layer="body">
  <path d="M84 30 V78 A62 62 0 1 0 116 78 V30 Z" ${glassFill}/>
  <g clip-path="url(#guide-${pose}-glass)" data-layer="liquid">
    <path class="hl-guide-liquid" d="${liquidWave} V200 H38 Z" style="fill:var(--guide-color, ${C.body})"/>
    <path d="${liquidWave}" fill="none" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="5"/>
    <path d="M60 178 Q100 200 140 178 V210 H60 Z" style="fill:var(--guide-shade, ${C.shade})" opacity="0.6"/>
  </g>
  <path d="M84 30 V78 A62 62 0 1 0 116 78 V30" fill="none" ${O(4.5)}/>
  <path d="M80 30 H120" ${O(4.5)}/>
  ${shine('M58 112 Q56 128 62 144', 6)}${shine('M90 38 V66', 4)}
</g>
<g data-layer="stopper"><path d="M86 8 H114 L112 30 H88 Z" fill="${WOOD_D}" ${O()}/><circle cx="95" cy="17" r="1.8" fill="#6F4A18"/><circle cx="105" cy="23" r="1.6" fill="#6F4A18"/></g>
<g data-layer="face">
  ${pose !== 'warn' ? `<ellipse cx="66" cy="152" rx="8" ry="5" fill="${C.cheek}" opacity="0.85"/><ellipse cx="134" cy="152" rx="8" ry="5" fill="${C.cheek}" opacity="0.85"/>` : ''}
  ${eyes}${brows}${mouth}
</g>
${goggles}
${extra}
`);
}

// ================= ЛОГОТИП =================
const brand = {};
brand['logo-mark'] = svgRoot({ name: 'logo-mark', w: 68, h: 76, title: 'Хим лаба', cls: 'hl-asset hl-asset--brand' }, `
<defs><clipPath id="logo-glass"><circle cx="34" cy="48" r="24"/></clipPath></defs>
<path d="M27 6 V27 A25 25 0 1 0 41 27 V6 Z" fill="#EAF6FF"/>
<g clip-path="url(#logo-glass)"><path d="M6 46 Q14 41 22 46 T38 46 T54 46 T70 46 V80 H6 Z" style="fill:var(--logo-liquid, #8A6CF0)"/></g>
<path d="M27 6 V27 A25 25 0 1 0 41 27 V6" fill="none" ${O(4.5)}/>
<path d="M23 6 H45" ${O(4.5)}/>
<circle cx="28" cy="56" r="4" fill="#FFFFFF" ${O(2.5)}/><circle cx="40" cy="51" r="2.6" fill="#FFFFFF" ${O(2.5)}/>
${shine('M17 42 Q16 48 18 54', 4)}
`);

// ---------- запись ----------
for (const [k, v] of Object.entries(eq)) write(`equipment/${k}.svg`, v);
for (const [k, v] of Object.entries(ct)) write(`containers/${k}.svg`, v);
for (const [k, v] of Object.entries(fx)) write(`fx/${k}.svg`, v);
for (const [k, v] of Object.entries(lens)) write(`lens/lens-${k}.svg`, v);
for (const [k, v] of Object.entries(badges)) write(`badges/${k}.svg`, v);
for (const p of ['explain', 'happy', 'thinking', 'warn']) write(`character/guide-${p}.svg`, guide(p));
for (const [k, v] of Object.entries(brand)) write(`brand/${k}.svg`, v);

let sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n';
for (const [k, [title, body]] of Object.entries(icons)) {
  write(`icons/${k}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32" class="hl-icon" data-icon="${k}" aria-hidden="true">\n<title>${title}</title>\n${body}\n</svg>`);
  sprite += `<symbol id="i-${k}" viewBox="0 0 32 32"><title>${title}</title>${body}</symbol>\n`;
}
sprite += '</svg>\n';
write('icons/sprite.svg', sprite);

// манифест для разработчика
const manifest = {
  equipment: Object.keys(eq), containers: Object.keys(ct), fx: Object.keys(fx), badges: Object.keys(badges),
  character: ['guide-explain', 'guide-happy', 'guide-thinking', 'guide-warn'],
  brand: Object.keys(brand),
  lens: Object.keys(lens).map((k) => 'lens-' + k),
  icons: Object.fromEntries(Object.entries(icons).map(([k, [t]]) => [k, t])),
};
write('manifest.json', JSON.stringify(manifest, null, 2));
console.log('assets:', Object.keys(eq).length, 'equipment,', Object.keys(ct).length, 'containers,', Object.keys(fx).length, 'fx,', Object.keys(icons).length, 'icons,', Object.keys(badges).length, 'badges, 4 poses');
