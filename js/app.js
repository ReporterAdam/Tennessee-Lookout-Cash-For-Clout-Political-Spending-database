/* ─────────────────────────────────────────────────────────────────────────────
   Tennessee Political Spending Database — app.js
   Main router, state management, navigation shell
───────────────────────────────────────────────────────────────────────────── */

(function () {
  'use strict';

  const BASE_URL = 'https://cdn.jsdelivr.net/gh/ReporterAdam/Tennessee-Lookout-Cash-For-Clout-Political-Spending-database@main/';
  const DATA_URL = BASE_URL + 'data/';
  const JS_URL   = BASE_URL + 'js/';

  // Era options used across all modules
  window.TN_ERA_OPTS = [
    ['2012', 'Since 2012'],
    ['2017', 'Since 2017'],
    ['2022', 'Since 2022'],
    ['2025', 'Since 2025'],
  ];

  // ── State — default era is 2022 ──────────────────────────────────────────────
  const state = {
    view:      'landing',
    subview:   null,
    era:       '2022',      // ← default 2022
    entity:    null,
    query:     '',
    sortCol:   null,
    sortDir:   'desc',
    page:      0,
    polFilter: 'all',
    ieTab:     'spent',
  };

  // ── Data cache ───────────────────────────────────────────────────────────────
  const cache = {};

  // ── CSV parser ───────────────────────────────────────────────────────────────
  function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    return lines.slice(1).map(line => {
      const vals = [];
      let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQ = !inQ; continue; }
        if (ch === ',' && !inQ) { vals.push(cur); cur = ''; continue; }
        cur += ch;
      }
      vals.push(cur);
      const row = {};
      headers.forEach((h, i) => { row[h] = vals[i] !== undefined ? vals[i].trim() : ''; });
      return row;
    });
  }

  async function loadData(filename) {
    if (cache[filename]) return cache[filename];
    try {
      const res  = await fetch(DATA_URL + filename);
      const text = await res.text();
      const data = filename.endsWith('.json') ? JSON.parse(text) : parseCSV(text);
      cache[filename] = data;
      return data;
    } catch (e) {
      console.error('Failed to load:', filename, e);
      return [];
    }
  }

  // ── Module loader ────────────────────────────────────────────────────────────
  const loadedModules = {};
  function loadModule(name) {
    return new Promise((resolve, reject) => {
      if (loadedModules[name]) { resolve(); return; }
      const script    = document.createElement('script');
      script.src      = JS_URL + name + '.js?v=3';
      script.onload   = () => { loadedModules[name] = true; resolve(); };
      script.onerror  = () => reject(new Error('Failed to load: ' + name));
      document.head.appendChild(script);
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function fmt(n) {
    const num = parseFloat(n) || 0;
    if (num >= 1_000_000) return '$' + (num / 1_000_000).toFixed(1) + 'M';
    if (num >= 1_000)     return '$' + (num / 1_000).toFixed(0) + 'K';
    return '$' + num.toFixed(0);
  }

  function fmtFull(n) {
    const num = parseFloat(n) || 0;
    return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function eraCol(prefix) {
    const map = { '2012': 'total_since_2012', '2017': 'total_since_2017', '2022': 'total_since_2022', '2025': 'total_since_2025' };
    return prefix ? prefix + '_' + map[state.era] : map[state.era];
  }

  function partyBadge(party) {
    if (!party) return '';
    const cls = party.toLowerCase().includes('rep') ? 'tn-badge-rep'
              : party.toLowerCase().includes('dem') ? 'tn-badge-dem'
              : 'tn-badge-ind';
    return `<span class="tn-badge ${cls}">${party}</span>`;
  }

  function renderLoading(container) {
    container.innerHTML = `<div class="tn-loading"><span class="tn-loading-spinner"></span>Loading data...</div>`;
  }

  function renderEmpty(container, msg) {
    container.innerHTML = `<div class="tn-empty">${msg || 'No results found.'}</div>`;
  }

  function navigate(updates) {
    Object.assign(state, updates);
    render();
  }

  // ── Era filter HTML helper (used by all modules) ──────────────────────────────
  function eraFilters(currentEra) {
    return `
      <div class="tn-era-filters">
        <span class="tn-era-label">Show spending:</span>
        ${window.TN_ERA_OPTS.map(([y, l]) => `
          <button class="tn-era-btn ${currentEra === y ? 'active' : ''}" data-era="${y}">${l}</button>
        `).join('')}
      </div>
    `;
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  async function render() {
    const app = document.getElementById('tn-spending-app');
    if (!app) return;

    app.innerHTML = renderShell();

    app.querySelectorAll('.tn-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigate({ view: btn.dataset.view, subview: null, entity: null, query: '', page: 0, polFilter: 'all', ieTab: 'spent' });
      });
    });

    const content = app.querySelector('#tn-view-content');

    switch (state.view) {
      case 'landing':
        renderLanding(content);
        break;
      case 'top-spenders':
        await loadModule('top_spenders');
        if (window.TNTopSpenders) window.TNTopSpenders.render(content, state, { loadData, fmt, fmtFull, eraCol, eraFilters, partyBadge, navigate, renderLoading, renderEmpty });
        break;
      case 'lobbying':
        await loadModule('lobbying');
        if (window.TNLobbying) window.TNLobbying.render(content, state, { loadData, fmt, fmtFull, eraCol, eraFilters, partyBadge, navigate, renderLoading, renderEmpty });
        break;
      case 'campaign':
        await loadModule('campaign');
        if (window.TNCampaign) window.TNCampaign.render(content, state, { loadData, fmt, fmtFull, eraCol, eraFilters, partyBadge, navigate, renderLoading, renderEmpty });
        break;
      case 'ie':
        await loadModule('ie');
        if (window.TNIE) window.TNIE.render(content, state, { loadData, fmt, fmtFull, eraCol, eraFilters, partyBadge, navigate, renderLoading, renderEmpty });
        break;
    }
  }

  // ── Shell ────────────────────────────────────────────────────────────────────
  function renderShell() {
    const navItems = [
      { view: 'landing',      label: 'Home' },
      { view: 'top-spenders', label: 'Top Political Spenders' },
      { view: 'lobbying',     label: 'Lobbying' },
      { view: 'campaign',     label: 'Campaign Finance' },
      { view: 'ie',           label: 'Independent Expenditures' },
    ];

    return `
      <div class="tn-header">
        <div class="tn-header-eyebrow">Tennessee Lookout — Cash For Clout</div>
        <h2 class="tn-header-title">Tennessee Political Spending Database</h2>
        <p class="tn-header-desc">
          Track lobbying spending, campaign contributions, and independent expenditures
          by companies and organizations influencing Tennessee politics.
        </p>
      </div>
      <nav class="tn-nav">
        ${navItems.map(n => `
          <button class="tn-nav-btn ${state.view === n.view ? 'active' : ''}" data-view="${n.view}">${n.label}</button>
        `).join('')}
      </nav>
      <div id="tn-view-content"></div>
    `;
  }

  // ── Landing ──────────────────────────────────────────────────────────────────
  function renderLanding(container) {
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:32px;">
        ${landingCard('Top Political Spenders', 'See which companies and organizations spend the most across lobbying, campaign contributions, and independent expenditures.', 'top-spenders', '🏆')}
        ${landingCard('Lobbying', 'Track spending by companies hiring lobbyists to influence the Tennessee legislature, reported semi-annually.', 'lobbying', '🏛️')}
        ${landingCard('Campaign Finance', 'Search contributions to Tennessee politicians and PACs by organization, company, or individual donor.', 'campaign', '💰')}
        ${landingCard('Independent Expenditures', 'Follow outside spending by groups supporting or opposing Tennessee candidates.', 'ie', '📊')}
      </div>
      <div class="tn-methodology">
        <strong>About this database:</strong> Data comes from the Tennessee Registry of Election Finance
        and the Tennessee Bureau of Ethics and Campaign Finance. Lobbying figures are midpoint estimates
        converted from ranges reported to the state. Campaign finance and independent expenditure figures
        reflect actual reported dollar amounts. Updated April 2026.
      </div>
    `;

    container.querySelectorAll('.tn-landing-card').forEach(card => {
      card.addEventListener('click', () => navigate({ view: card.dataset.view }));
    });
  }

  function landingCard(title, desc, view, emoji) {
    return `
      <div class="tn-landing-card" data-view="${view}" style="
        background:#fff;border:1px solid var(--tn-border);border-radius:var(--tn-radius-lg);
        padding:20px;cursor:pointer;transition:all 0.15s;box-shadow:var(--tn-shadow);
      " onmouseover="this.style.borderColor='var(--tn-accent)';this.style.boxShadow='var(--tn-shadow-md)'"
         onmouseout="this.style.borderColor='var(--tn-border)';this.style.boxShadow='var(--tn-shadow)'">
        <div style="font-size:28px;margin-bottom:10px;">${emoji}</div>
        <div style="font-family:var(--tn-font-serif);font-size:17px;font-weight:600;margin-bottom:6px;color:var(--tn-text);">${title}</div>
        <div style="font-size:13px;color:var(--tn-text-muted);line-height:1.5;">${desc}</div>
      </div>
    `;
  }

  window.TNApp = { loadData, fmt, fmtFull, eraCol, eraFilters, partyBadge, navigate, renderLoading, renderEmpty, state, DATA_URL };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }

})();
