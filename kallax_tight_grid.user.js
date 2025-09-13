// ==UserScript==
// @name         Kallax.io — Tight Image Grid
// @namespace    http://tampermonkey.net/
// @version      2025-09-13
// @description  Keep image + badges, remove the metadata card, and overlay the title on the image.
// @author       jenlisabeth
// @match        https://kallax.io/*
// @match        https://www.kallax.io/*
// @match        http://kallax.io/*
// @match        http://www.kallax.io/*
// @grant        GM_addStyle
// ==/UserScript==


(function () {
  'use strict';

  const ROOT = 'kxmod';
  const COLS_LS_KEY = 'kxmod.cols';
  const DEFAULT_COLS = 3;

  /* ================== STYLES (scoped to :root var) ================== */
  GM_addStyle(`
    :root { --${ROOT}-cols: ${DEFAULT_COLS}; }

    /* Only processed items obey the fixed column count */
    #pagination-start .${ROOT}-tight {
      max-width: calc(100% / var(--${ROOT}-cols)) !important;
      flex-basis: calc(100% / var(--${ROOT}-cols)) !important;
      flex-grow: 0 !important;
      box-sizing: border-box;
      align-self: flex-start;
    }
    /* Belt & suspenders: override any mud-grid-item-* widths */
    #pagination-start .${ROOT}-tight[class*="mud-grid-item-"] {
      max-width: calc(100% / var(--${ROOT}-cols)) !important;
      flex-basis: calc(100% / var(--${ROOT}-cols)) !important;
      flex-grow: 0 !important;
    }

    /* Anchor hosts the overlay; fill the column width */
    #pagination-start .image-container {
      position: relative !important;
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      overflow: hidden;
      isolation: isolate;
      z-index: 0;
    }
    #pagination-start .image-container img {
      display: block !important;
      width: 100% !important;
      height: auto !important;
      object-fit: cover;
    }

    /* Title overlay */
    .${ROOT}-title {
      position: absolute !important;
      left: 8px; right: 8px; top: 8px;
      padding: 8px 10px;
      color: #fff !important;
      font: 600 14px/1.35 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      background: rgba(0,0,0,.70);
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,.35);
      z-index: 3;
      pointer-events: none;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    /* Columns selector */
    .${ROOT}-cols-ctrl {
      position: sticky;
      top: 8px;
      z-index: 9999;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 8px;
      margin: 6px 0 10px;
      border: 1px solid currentColor;
      border-radius: 8px;
      background: transparent;
      font: 500 13px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    .${ROOT}-cols-ctrl select {
      font: inherit;
      padding: 2px 6px;
      border-radius: 6px;
    }
  `);

  /* ================== HELPERS ================== */
  const setCols = (n) => {
    document.documentElement.style.setProperty(`--${ROOT}-cols`, String(n));
    localStorage.setItem(COLS_LS_KEY, String(n));
  };
  const getCols = () => {
    const saved = parseInt(localStorage.getItem(COLS_LS_KEY) || `${DEFAULT_COLS}`, 10);
    return Number.isFinite(saved) ? Math.min(Math.max(saved, 1), 8) : DEFAULT_COLS;
  };

  function getTitleFromCard(card) {
    if (!card) return null;
    const candidate =
      card.querySelector('h1,h2,h3,h4,.title,[class*="Title"],.mud-typography-h6,.mud-typography-h5,a[href*="/game/"]');
    if (candidate && candidate.textContent?.trim()) return candidate.textContent.trim();
    const raw = card.textContent?.replace(/\s+/g, ' ').trim() || '';
    const firstBit = raw.split(/[|•·\-–—\n]/)[0].trim();
    return firstBit || raw || null;
  }

  function ensureTitleOverlay(anchor, title) {
    if (!anchor) return;
    let ovl = anchor.querySelector(`.${ROOT}-title`);
    if (!ovl) {
      ovl = document.createElement('div');
      ovl.className = `${ROOT}-title`;
      anchor.appendChild(ovl);
    }
    ovl.textContent = title || '';
    ovl.setAttribute('title', title || '');
  }

  function processItem(item) {
    if (!item || item.dataset.kxProcessed === '1') return;

    const anchor = item.querySelector('a.image-container.elevate-on-hover');
    const card   = item.querySelector('.card');

    if (!anchor || !anchor.querySelector('img')) {
      item.dataset.kxProcessed = '1';
      return;
    }

    // Mark so column override applies
    item.classList.add(`${ROOT}-tight`);

    // Extract title and remove the card
    const title =
      getTitleFromCard(card) ||
      anchor.getAttribute('aria-label') ||
      anchor.getAttribute('title') ||
      '';
    if (card) card.remove();
    if (title) ensureTitleOverlay(anchor, title);

    // IMPORTANT: Do not touch div[role="group"] at all.

    item.dataset.kxProcessed = '1';
  }

  function processAll() {
    const container = document.querySelector('#pagination-start');
    if (!container) return;
    container.querySelectorAll('.mud-grid-item.game-item').forEach(processItem);
  }

function injectColsSelector() {
  // Target: the first .mud-collapse-container
  const collapse = document.querySelector('.mud-collapse-container');
  if (!collapse) return;

  // If a previous control exists but isn't right below collapse, remove it
  const existing = document.querySelector(`.${ROOT}-cols-ctrl`);
  if (existing) {
    if (existing.previousElementSibling !== collapse) {
      existing.remove();
    } else {
      // Already in the right spot: sync value and bail
      const sel = existing.querySelector('select');
      if (sel) sel.value = String(getCols());
      return;
    }
  }

  // Build the control
  const wrap = document.createElement('label');
  wrap.className = `${ROOT}-cols-ctrl`;
  wrap.innerHTML = `<span>Columns:</span>`;

  const sel = document.createElement('select');
  for (let i = 1; i <= 8; i++) {
    const o = document.createElement('option');
    o.value = String(i);
    o.textContent = String(i);
    sel.appendChild(o);
  }

  sel.value = String(getCols());
  sel.addEventListener('change', () => {
    const n = parseInt(sel.value, 10);
    if (Number.isFinite(n)) setCols(n); // updates :root var + localStorage
  });

  wrap.appendChild(sel);

  // Mount right below the collapse container
  collapse.insertAdjacentElement('afterend', wrap);

  // Apply the current value immediately
  setCols(parseInt(sel.value, 10));
}

  // Throttled re-apply to survive rapid rerenders
  let rafTicket = 0;
  const scheduleApply = () => {
    if (rafTicket) return;
    rafTicket = requestAnimationFrame(() => {
      rafTicket = 0;
      processAll();
      injectColsSelector();
    });
  };

  /* ================== RUN ================== */
  setCols(getCols());     // set :root var from saved value
  processAll();
  injectColsSelector();

  // Observe the whole document for SPA rerenders
  const obs = new MutationObserver(scheduleApply);
  obs.observe(document.documentElement, { subtree: true, childList: true });

  // Also hook into SPA navigation changes
  const _push = history.pushState;
  history.pushState = function () { _push.apply(this, arguments); scheduleApply(); };
  window.addEventListener('popstate', scheduleApply);
  window.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleApply(); });
})();
