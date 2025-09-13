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
  const COLS_LS_KEY  = 'kxmod.cols';
  const TIGHT_LS_KEY = 'kxmod.tight';
  const DEFAULT_COLS = 3;
  const DEFAULT_TIGHT = true;

  GM_addStyle(`
    :root { --${ROOT}-cols: ${DEFAULT_COLS}; }

    /* Tight-mode gated layout */
    html[data-${ROOT}-tight="1"] #pagination-start .${ROOT}-tight {
      max-width: calc(100% / var(--${ROOT}-cols)) !important;
      flex-basis: calc(100% / var(--${ROOT}-cols)) !important;
      flex-grow: 0 !important;
      box-sizing: border-box;
      align-self: flex-start;
    }
    html[data-${ROOT}-tight="1"] #pagination-start .${ROOT}-tight[class*="mud-grid-item-"] {
      max-width: calc(100% / var(--${ROOT}-cols)) !important;
      flex-basis: calc(100% / var(--${ROOT}-cols)) !important;
      flex-grow: 0 !important;
    }
    html[data-${ROOT}-tight="1"] #pagination-start .${ROOT}-tight .card {
      display: none !important;
    }

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
      display: none;
    }
    html[data-${ROOT}-tight="1"] .${ROOT}-title { display: block; }

    /* Control bar */
    .${ROOT}-cols-ctrl {
      position: sticky;
      top: 8px;
      z-index: 9999;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 6px 8px;
      margin: 6px 0 10px;
      border-radius: 20px;
      color: var(--mud-palette-text-primary);
      background-color: var(--mud-palette-action-disabled-background);
      --mud-ripple-opacity: var(--mud-ripple-opacity-secondary);
      font: 500 13px/1 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    }
    .${ROOT}-cols-ctrl select {
      font: inherit;
      padding: 2px 6px;
      border-radius: 6px;
    }

    /* Button toggle */
    .${ROOT}-toggle-btn {
      height: 40px;
      border: none;
      border-radius: 20px;
      padding: 0 16px;
      font: inherit;
      cursor: pointer;
      transition: background-color .15s ease, color .15s ease, box-shadow .15s ease;
      color: var(--mud-palette-text-primary);
      background-color: var(--mud-palette-action-disabled-background);
      --mud-ripple-opacity: var(--mud-ripple-opacity-secondary);
      box-shadow: 0 1px 2px rgba(0,0,0,.2) inset;
    }
    .${ROOT}-toggle-btn:hover {
      background-color: var(--mud-palette-action-disabled);
    }
    .${ROOT}-toggle-btn[aria-pressed="true"] {
      background: rgba(9,132,227,1); /* ON */
      color: #fff;
      box-shadow: 0 1px 2px rgba(255,255,255,.2) inset;
    }
    .${ROOT}-toggle-btn:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }
  `);

  /* ---------- helpers ---------- */
  const setCols = (n) => {
    document.documentElement.style.setProperty(`--${ROOT}-cols`, String(n));
    localStorage.setItem(COLS_LS_KEY, String(n));
  };
  const getCols = () => {
    const saved = parseInt(localStorage.getItem(COLS_LS_KEY) || `${DEFAULT_COLS}`, 10);
    return Number.isFinite(saved) ? Math.min(Math.max(saved, 1), 8) : DEFAULT_COLS;
  };

  const getTight = () => {
    const saved = localStorage.getItem(TIGHT_LS_KEY);
    if (saved === '0') return false;
    if (saved === '1') return true;
    return DEFAULT_TIGHT;
  };
  const applyTightAttr = (on) => {
    document.documentElement.setAttribute(`data-${ROOT}-tight`, on ? '1' : '0');
  };
  const setTight = (on) => {
    applyTightAttr(on);
    localStorage.setItem(TIGHT_LS_KEY, on ? '1' : '0');
    // reflect state on the button if it's mounted
    const btn = document.querySelector(`.${ROOT}-toggle-btn`);
    if (btn) btn.setAttribute('aria-pressed', on ? 'true' : 'false');
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

    item.classList.add(`${ROOT}-tight`);

    const title =
      getTitleFromCard(card) ||
      anchor.getAttribute('aria-label') ||
      anchor.getAttribute('title') ||
      '';
    if (title) ensureTitleOverlay(anchor, title);

    // Do not touch div[role="group"].
    item.dataset.kxProcessed = '1';
  }

  function processAll() {
    const container = document.querySelector('#pagination-start');
    if (!container) return;
    container.querySelectorAll('.mud-grid-item.game-item').forEach(processItem);
  }

  function injectColsSelector() {
    const collapse = document.querySelector('.mud-collapse-container');
    if (!collapse) return;

    const existing = document.querySelector(`.${ROOT}-cols-ctrl`);
    if (existing) {
      if (existing.previousElementSibling !== collapse) {
        existing.remove();
      } else {
        // sync and bail
        const sel = existing.querySelector('select');
        if (sel) sel.value = String(getCols());
        const btn = existing.querySelector(`.${ROOT}-toggle-btn`);
        if (btn) btn.setAttribute('aria-pressed', getTight() ? 'true' : 'false');
        return;
      }
    }

    // Build control bar
    const wrap = document.createElement('div');
    wrap.className = `${ROOT}-cols-ctrl`;

    // Button toggle
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `${ROOT}-toggle-btn`;
    btn.textContent = 'Tight grid';
    btn.setAttribute('aria-pressed', getTight() ? 'true' : 'false');
    btn.addEventListener('click', () => {
      const now = btn.getAttribute('aria-pressed') !== 'true';
      setTight(now);
    });

    // Columns label + select
    const labelSpan = document.createElement('span');
    labelSpan.textContent = 'Columns:';

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
      if (Number.isFinite(n)) setCols(n);
    });

    wrap.appendChild(btn);
    wrap.appendChild(labelSpan);
    wrap.appendChild(sel);

    collapse.insertAdjacentElement('afterend', wrap);

    // Apply immediately
    setCols(parseInt(sel.value, 10));
    setTight(btn.getAttribute('aria-pressed') === 'true');
  }

  // RAF-throttled re-apply
  let rafTicket = 0;
  const scheduleApply = () => {
    if (rafTicket) return;
    rafTicket = requestAnimationFrame(() => {
      rafTicket = 0;
      processAll();
      injectColsSelector();
    });
  };

  // Run
  setCols(getCols());
  applyTightAttr(getTight());
  processAll();
  injectColsSelector();

  // Observe SPA changes
  const obs = new MutationObserver(scheduleApply);
  obs.observe(document.documentElement, { subtree: true, childList: true });

  const _push = history.pushState;
  history.pushState = function () { _push.apply(this, arguments); scheduleApply(); };
  window.addEventListener('popstate', scheduleApply);
  window.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleApply(); });
})();
