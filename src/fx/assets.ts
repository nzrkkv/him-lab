/**
 * SVG-ассеты дизайна, вставляемые инлайном (CSS-переменные должны доходить до слоёв).
 * id внутри SVG делаются уникальными, как в design/tools/build-mockups-lib.mjs (inlineSvg).
 */
import beaker from '../../design/assets/equipment/beaker.svg';
import testTube from '../../design/assets/equipment/test-tube.svg';
import flask from '../../design/assets/equipment/flask.svg';
import evaporatingDish from '../../design/assets/equipment/evaporating-dish.svg';
import burner from '../../design/assets/equipment/burner.svg';
import iceBath from '../../design/assets/equipment/ice-bath.svg';
import rack from '../../design/assets/equipment/test-tube-rack.svg';
import holder from '../../design/assets/equipment/test-tube-holder.svg';
import jar from '../../design/assets/containers/jar.svg';
import bottle from '../../design/assets/containers/bottle.svg';
import guideExplain from '../../design/assets/character/guide-explain.svg';
import guideHappy from '../../design/assets/character/guide-happy.svg';
import guideThinking from '../../design/assets/character/guide-thinking.svg';
import guideWarn from '../../design/assets/character/guide-warn.svg';
import steam from '../../design/assets/fx/steam.svg';
import lensCubes from '../../design/assets/lens/lens-cubes.svg';
import lensCrystals from '../../design/assets/lens/lens-crystals.svg';
import lensPowder from '../../design/assets/lens/lens-powder.svg';
import lensFine from '../../design/assets/lens/lens-fine.svg';
import logo from '../../design/assets/brand/logo-mark.svg';
import badgeDetective from '../../design/assets/badges/powder-detective.svg';

const SOURCES: Record<string, string> = {
  'equipment/beaker': beaker,
  'equipment/test-tube': testTube,
  'equipment/flask': flask,
  'equipment/evaporating-dish': evaporatingDish,
  'equipment/burner': burner,
  'equipment/ice-bath': iceBath,
  'equipment/test-tube-rack': rack,
  'equipment/test-tube-holder': holder,
  'containers/jar': jar,
  'containers/bottle': bottle,
  'character/guide-explain': guideExplain,
  'character/guide-happy': guideHappy,
  'character/guide-thinking': guideThinking,
  'character/guide-warn': guideWarn,
  'fx/steam': steam,
  'lens/cubes': lensCubes,
  'lens/crystals': lensCrystals,
  'lens/fine_powder': lensPowder,
  'lens/ultrafine_powder': lensFine,
  'brand/logo-mark': logo,
  'badges/powder-detective': badgeDetective,
};

let counter = 0;

export interface AssetOptions {
  /** Подпись для диктора; пустая строка — украшение (aria-hidden). */
  label?: string;
  className?: string;
  vars?: Record<string, string | number>;
}

/** Вставляет ассет как SVG-элемент. */
export function asset(name: string, o: AssetOptions = {}): SVGSVGElement {
  const src = SOURCES[name];
  if (!src) throw new Error(`asset not bundled: ${name}`);
  const uid = `u${(++counter).toString(36)}`;
  const text = src
    .replace(/\bid="([^"]+)"/g, (_m, id: string) => `id="${id}-${uid}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, id: string) => `url(#${id}-${uid})`);
  const tpl = document.createElement('template');
  tpl.innerHTML = text.trim();
  const svg = tpl.content.firstElementChild as SVGSVGElement;
  svg.removeAttribute('width');
  svg.removeAttribute('height');
  if (o.className) svg.setAttribute('class', `${svg.getAttribute('class') ?? ''} ${o.className}`.trim());
  if (o.label === '') {
    svg.removeAttribute('role');
    svg.removeAttribute('aria-label');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.querySelector('title')?.remove();
  } else if (o.label) {
    svg.setAttribute('aria-label', o.label);
    const title = svg.querySelector('title');
    if (title) title.textContent = o.label;
  }
  for (const [k, v] of Object.entries(o.vars ?? {})) svg.style.setProperty(k, String(v));
  return svg;
}
