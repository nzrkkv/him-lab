/** Проверка в браузере: не больше одного всплывающего слоя, нет горизонтальной прокрутки, кнопки в пределах экрана. */
export const LAYER_CHECK = `(() => {
  const sel = ['.hl-result', '.hl-popover', '.hl-guide-bubble', '.hl-scrim', '.hl-journal-panel.is-open'];
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden'; };
  const narrow = innerWidth < 1280;
  const layers = sel.flatMap((s) => [...document.querySelectorAll(s)]).filter(vis).filter((e) => narrow || !e.matches('.hl-journal-panel'));
  const out = [];
  if (layers.length > 1) out.push('слоёв: ' + layers.map((e) => e.className.split(' ')[0]).join(' + '));
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push('горизонтальная прокрутка');
  for (const b of document.querySelectorAll('button, a[href]')) {
    if (!vis(b) || b.closest('.hl-shelf__body')) continue;
    const r = b.getBoundingClientRect();
    if (r.right > innerWidth + 2 || r.bottom > innerHeight + 2 || r.left < -2) out.push('за экраном: ' + (b.getAttribute('aria-label') || b.textContent || '').trim().slice(0, 30));
  }
  return out;
})()`;
