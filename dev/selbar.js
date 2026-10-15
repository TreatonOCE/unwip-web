// Unwip - the small bar that appears above selected text: bold, italic, underline, strikethrough, alignment, clear
// formatting, comment and footnote. In writer mode it's the only formatting on screen, so it shows there too, without
// alignment and footnotes. The main toolbar stays calm; these show up only when there's text to apply them to.
window.UnwipSelBar = (function () {
  'use strict';
  const U = window.__unwip; if (!U) return;
  const { $, $$, S, editor, I } = U;
  const bar = document.createElement('div');
  bar.className = 'selbar hidden'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Formatting for the selected text');
  const btn = (sel, label, inner, wide) => `<button class="sb-btn${wide ? ' wide' : ''}" data-sel="${sel}" aria-label="${label}" data-tip="${label}">${inner}</button>`;
  bar.innerHTML = [
    btn("[data-cmd='bold']", 'Bold (Ctrl+B)', '<b>B</b>'), btn("[data-cmd='italic']", 'Italic (Ctrl+I)', '<i>I</i>'), btn("[data-cmd='underline']", 'Underline (Ctrl+U)', '<u>U</u>'),
    btn("[data-cmd='strikeThrough']", 'Strikethrough', '<s>S</s>'),
    '<span class="sb-sep sb-full"></span>',
    '<span class="sb-full sb-group">' + btn("[data-cmd='justifyLeft']", 'Align left', I.alignLeft) + btn("[data-cmd='justifyCenter']", 'Centre', I.alignCenter) +
    btn("[data-cmd='justifyRight']", 'Align right', I.alignRight) + btn("[data-cmd='justifyFull']", 'Justify', I.alignJustify) + '</span>',
    '<span class="sb-sep"></span>',
    btn('#btn-clear', 'Clear formatting', 'Clear formatting', true),
    '<span class="sb-sep"></span>',
    btn('#btn-comment', 'Comment (Ctrl+Alt+M)', I.comment + '<span>Comment</span>', true),
    '<span class="sb-full sb-group">' + btn('#btn-footnote', 'Footnote (Ctrl+Alt+F)', 'Footnote', true) + '</span>'
  ].join('');
  document.body.appendChild(bar);
  // clicking the bar must not lose the selection
  bar.addEventListener('mousedown', e => e.preventDefault());
  bar.addEventListener('click', e => {
    const b = e.target.closest('.sb-btn'); if (!b) return;
    const target = document.querySelector(b.dataset.sel);
    if (target) target.click();
    setTimeout(place, 30);
  });

  let mouseDown = false, timer = null;
  editor.addEventListener('mousedown', () => { mouseDown = true; hide(); });
  document.addEventListener('mouseup', () => { if (!mouseDown) return; mouseDown = false; clearTimeout(timer); timer = setTimeout(place, 10); });
  document.addEventListener('keyup', e => { if (e.shiftKey && /Arrow|Home|End/.test(e.key)) { clearTimeout(timer); timer = setTimeout(place, 150); } });
  editor.addEventListener('input', hide);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  ($('#editor-wrap') || window).addEventListener('scroll', () => { if (!bar.classList.contains('hidden')) place(); }, { passive: true });

  function hide() { bar.classList.add('hidden'); }
  // a window opening on top (Spark, Find anything, settings…) or the editor being swapped for a map or view: put the bar away
  const covered = () => !!document.querySelector('.modal-back, .cmdk-back, .mp-view') || !editor.offsetParent;
  new MutationObserver(() => { if (!bar.classList.contains('hidden') && covered()) hide(); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  document.addEventListener('focusin', e => { if (!bar.classList.contains('hidden') && !editor.contains(e.target) && !bar.contains(e.target)) hide(); });
  function place() {
    if (covered()) { hide(); return; }
    if (document.documentElement.classList.contains('m-phone')) { hide(); return; }   // (in writer mode it shows, smaller: style.css)
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed || !editor.contains(sel.anchorNode) || !editor.contains(sel.focusNode)) { hide(); return; }
    if (!sel.toString().trim()) { hide(); return; }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    if (!r.width && !r.height) { hide(); return; }
    bar.classList.remove('hidden');
    const w = bar.offsetWidth, h = bar.offsetHeight;
    const wrap = ($('#editor-wrap') || document.body).getBoundingClientRect();
    let x = Math.max(wrap.left + 8, Math.min(wrap.right - w - 8, r.left + r.width / 2 - w / 2));
    let y = r.top - h - 10;
    if (y < wrap.top + 4) y = r.bottom + 10;          // no room above: put it below the selection
    if (y > wrap.bottom - h) { hide(); return; }      // selection scrolled out of view
    bar.style.left = x + 'px'; bar.style.top = y + 'px';
    for (const b of $$('.sb-btn', bar)) {
      const t = document.querySelector(b.dataset.sel), c = t && t.dataset.cmd;
      let on = false; if (c) { try { on = document.queryCommandState(c); } catch {} }
      b.classList.toggle('on', on);
    }
  }
  return { place, hide };
})();
