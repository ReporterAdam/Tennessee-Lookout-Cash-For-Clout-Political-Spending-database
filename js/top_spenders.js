/* ─────────────────────────────────────────────────────────────────────────────
   Tennessee Political Spending Database — top_spenders.js
   Top political spenders — cross-dataset rankings
   Changes:
     - Remove "In" column
     - Total first, then Lobbying, CF, IE
     - Dynamic threshold by era
     - Methodology collapsible
     - Clickable category cells → direct drill-through
───────────────────────────────────────────────────────────────────────────── */

window.TNTopSpenders = (function () {
  'use strict';

  const PAGE_SIZE = 50;

  // ── Era thresholds ───────────────────────────────────────────────────────────
  const ERA_THRESHOLDS = {
    '2012': 500_000,
    '2017': 250_000,
    '2022': 100_000,
    '2025':  50_000,
  };

  function getEra(state) { return state.era || '2022'; }

  function eraCol(era, prefix) {
    const suffix = { '2012': 'since_2012', '2017': 'since_2017', '2022': 'since_2022', '2025': 'since_2025' }[era] || 'since_2022';
    return prefix ? `${prefix}_total_${suffix}` : `grand_total_${suffix}`;
  }

  function fmtThreshold(n) {
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return '$' + (n / 1_000).toFixed(0) + 'K';
    return '$' + n;
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  async function render(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading, renderEmpty } = helpers;

    if (state.entity) {
      await renderProfile(container, state, helpers);
      return;
    }

    renderLoading(container);

    const data = await loadData('master_entities.json');
    if (!data || !data.length) { renderEmpty(container, 'No data available.'); return; }

    const era       = getEra(state);
    const threshold = ERA_THRESHOLDS[era] || 500_000;
    const grandCol  = eraCol(era);
    const lobCol    = eraCol(era, 'lob');
    const cfCol     = eraCol(era, 'cf');
    const ieCol     = eraCol(era, 'ie');

    const query = (state.query || '').toLowerCase();
    let rows = data.filter(r => {
      const meetsThreshold = (parseFloat(r[grandCol]) || 0) >= threshold;
      const matchesSearch  = !query ||
        (r.entity_name || '').toLowerCase().includes(query) ||
        (r.aliases || []).some(a => a.toLowerCase().includes(query));
      return meetsThreshold && matchesSearch;
    });

    const sortCol = state.sortCol || grandCol;
    const sortDir = state.sortDir || 'desc';
    rows = rows.slice().sort((a, b) => {
      const av = parseFloat(a[sortCol]) || 0;
      const bv = parseFloat(b[sortCol]) || 0;
      return sortDir === 'desc' ? bv - av : av - bv;
    });

    const page    = state.page || 0;
    const visible = rows.slice(0, (page + 1) * PAGE_SIZE);
    const hasMore = rows.length > visible.length;

    container.innerHTML = `
      <div class="tn-era-filters">
        <span class="tn-era-label">Show spending:</span>
        ${window.TN_ERA_OPTS.map(([y, l]) => `
          <button class="tn-era-btn ${era === y ? 'active' : ''}" data-era="${y}">
            ${l} <span style="font-size:10px;opacity:0.7;">(${fmtThreshold(ERA_THRESHOLDS[y])}+)</span>
          </button>
        `).join('')}
      </div>

      <div class="tn-search-wrap">
        <span class="tn-search-icon">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </span>
        <input class="tn-search" type="text" placeholder="Search a company or organization..."
               value="${state.query || ''}" id="ts-search" />
      </div>

      <div class="tn-result-count">
        Showing <strong>${visible.length.toLocaleString()}</strong> of
        <strong>${rows.length.toLocaleString()}</strong> organizations
        spending ${fmtThreshold(threshold)}+ ${window.TN_ERA_OPTS.find(([y]) => y === era)?.[1]?.toLowerCase() || ''}
      </div>

      <!-- Methodology collapsible -->
      <div style="margin-bottom:16px;">
        <button id="ts-methodology-toggle" style="
          background:none;border:none;padding:0;cursor:pointer;
          font-size:13px;color:var(--tn-blue);font-family:var(--tn-font-sans);
          display:flex;align-items:center;gap:4px;
        ">
          <span id="ts-methodology-arrow">▶</span>
          How we calculated these totals
        </button>
        <div id="ts-methodology-body" style="display:none;margin-top:8px;">
          <div class="tn-methodology">
            <strong>Lobbying:</strong> Tennessee law requires lobbyists to report compensation and
            expenses in dollar ranges rather than exact amounts (e.g. "$50,000 – $100,000").
            We convert each range to its midpoint — so "$50,000 – $100,000" becomes $75,000.
            These are estimates, not exact figures.<br><br>
            <strong>Campaign Finance:</strong> Reflects actual reported contributions from
            organizations and PACs to Tennessee politicians and their campaign accounts.
            Individual donations under $100 are excluded from donor rankings but counted
            in politician totals.<br><br>
            <strong>Independent Expenditures:</strong> Reflects actual reported spending by
            outside groups to support or oppose Tennessee candidates, filed separately from
            candidate campaigns.<br><br>
            <strong>Politician PACs and party caucuses are excluded</strong> from this ranking.
            The goal is to show outside interests spending money to influence Tennessee politics,
            not politicians spending on each other.
          </div>
        </div>
      </div>

      <div class="tn-table-wrap">
        <table class="tn-table" id="ts-table">
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              <th>Organization</th>
              <th class="num" data-sort="${grandCol}" style="font-weight:700;">Total</th>
              <th class="num" data-sort="${lobCol}">Lobbying</th>
              <th class="num" data-sort="${cfCol}">Campaign Finance</th>
              <th class="num" data-sort="${ieCol}">Ind. Expenditures</th>
            </tr>
          </thead>
          <tbody>
            ${visible.map((r, i) => {
              const lobAmt   = parseFloat(r[lobCol])  || 0;
              const cfAmt    = parseFloat(r[cfCol])   || 0;
              const ieAmt    = parseFloat(r[ieCol])   || 0;
              const grandAmt = parseFloat(r[grandCol]) || 0;

              const lobCell = lobAmt > 0
                ? `<td class="money ts-lob-link" data-entity="${encodeURIComponent(r.entity_name)}" style="cursor:pointer;color:var(--tn-blue);" title="View lobbying details">${fmt(lobAmt)}</td>`
                : `<td class="money" style="color:var(--tn-text-light);">—</td>`;

              const cfCell = cfAmt > 0
                ? `<td class="money ts-cf-link" data-entity="${encodeURIComponent(r.entity_name)}" style="cursor:pointer;color:var(--tn-blue);" title="View campaign finance details">${fmt(cfAmt)}</td>`
                : `<td class="money" style="color:var(--tn-text-light);">—</td>`;

              const ieCell = ieAmt > 0
                ? `<td class="money ts-ie-link" data-entity="${encodeURIComponent(r.entity_name)}" style="cursor:pointer;color:var(--tn-blue);" title="View independent expenditure details">${fmt(ieAmt)}</td>`
                : `<td class="money" style="color:var(--tn-text-light);">—</td>`;

              return `
                <tr>
                  <td class="rank">${i + 1}</td>
                  <td class="name-link" data-key="${encodeURIComponent(r.entity_name)}">
                    ${r.entity_name}
                    ${r.website ? `<a href="${r.website}" target="_blank" style="color:var(--tn-text-light);font-size:11px;margin-left:4px;" onclick="event.stopPropagation()">↗</a>` : ''}
                  </td>
                  <td class="money" style="font-weight:700;">${fmt(grandAmt)}</td>
                  ${lobCell}
                  ${cfCell}
                  ${ieCell}
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      ${hasMore ? `<button class="tn-show-more" id="ts-more">
        Show more (${rows.length - visible.length} remaining)
      </button>` : ''}
    `;

    // ── Event listeners ────────────────────────────────────────────────────────

    // Era filters
    container.querySelectorAll('.tn-era-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate({ era: btn.dataset.era, page: 0, sortCol: null }));
    });

    // Search
    let searchTimer;
    container.querySelector('#ts-search').addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => navigate({ query: e.target.value, page: 0 }), 280);
    });

    // Sort column headers
    container.querySelectorAll('.tn-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        const dir = state.sortCol === col && state.sortDir === 'desc' ? 'asc' : 'desc';
        navigate({ sortCol: col, sortDir: dir, page: 0 });
      });
    });

    // Name click → entity profile
    container.querySelectorAll('.name-link[data-key]').forEach(cell => {
      cell.addEventListener('click', () => navigate({ entity: decodeURIComponent(cell.dataset.key) }));
    });

    // Lobbying cell click → go directly to lobbying profile
    container.querySelectorAll('.ts-lob-link').forEach(cell => {
      cell.addEventListener('click', e => {
        e.stopPropagation();
        navigate({ view: 'lobbying', entity: decodeURIComponent(cell.dataset.entity), subview: null });
      });
    });

    // CF cell click → go directly to donor profile
    container.querySelectorAll('.ts-cf-link').forEach(cell => {
      cell.addEventListener('click', e => {
        e.stopPropagation();
        navigate({ view: 'campaign', entity: decodeURIComponent(cell.dataset.entity), subview: 'donors' });
      });
    });

    // IE cell click → go directly to IE spender profile
    container.querySelectorAll('.ts-ie-link').forEach(cell => {
      cell.addEventListener('click', e => {
        e.stopPropagation();
        navigate({ view: 'ie', entity: decodeURIComponent(cell.dataset.entity), subview: 'ie-spenders' });
      });
    });

    // Methodology toggle
    const toggleBtn  = container.querySelector('#ts-methodology-toggle');
    const toggleBody = container.querySelector('#ts-methodology-body');
    const toggleArrow = container.querySelector('#ts-methodology-arrow');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const isOpen = toggleBody.style.display !== 'none';
        toggleBody.style.display = isOpen ? 'none' : 'block';
        toggleArrow.textContent  = isOpen ? '▶' : '▼';
      });
    }

    // Show more
    const moreBtn = container.querySelector('#ts-more');
    if (moreBtn) moreBtn.addEventListener('click', () => navigate({ page: (state.page || 0) + 1 }));
  }

  // ── Entity profile view ──────────────────────────────────────────────────────
  async function renderProfile(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading } = helpers;

    renderLoading(container);

    const data   = await loadData('master_entities.json');
    const entity = state.entity;
    const row    = data.find(r => r.entity_name === entity);

    if (!row) { container.innerHTML = `<div class="tn-empty">Entity not found.</div>`; return; }

    const era = getEra(state);

    container.innerHTML = `
      <button class="tn-back-btn" id="ts-back">← Back to top spenders</button>

      <div class="tn-profile">
        <div class="tn-profile-header">
          <div class="tn-profile-name">${row.entity_name}</div>
          <div class="tn-profile-meta">
            ${row.has_lobbying ? '<span>Lobbying</span>' : ''}
            ${row.has_cf       ? '<span>Campaign Finance</span>' : ''}
            ${row.has_ie       ? '<span>Independent Expenditures</span>' : ''}
            ${row.website ? `<a href="${row.website}" target="_blank" style="color:rgba(255,255,255,0.8);">Website ↗</a>` : ''}
          </div>
        </div>
        <div class="tn-profile-body">

          <div class="tn-era-filters" style="margin-bottom:16px;">
            <span class="tn-era-label">Show spending:</span>
            ${window.TN_ERA_OPTS.map(([y, l]) => `
              <button class="tn-era-btn ${era === y ? 'active' : ''}" data-era="${y}">${l}</button>
            `).join('')}
          </div>

          <h3 class="tn-section-heading">Total Political Spending</h3>
          <div class="tn-profile-stats">
            <div class="tn-stat-box">
              <div class="tn-stat-label">Since 2012</div>
              <div class="tn-stat-value accent">${fmtFull(row.grand_total_since_2012)}</div>
            </div>
            <div class="tn-stat-box">
              <div class="tn-stat-label">Since 2017</div>
              <div class="tn-stat-value">${fmtFull(row.grand_total_since_2017)}</div>
            </div>
            <div class="tn-stat-box">
              <div class="tn-stat-label">Since 2022</div>
              <div class="tn-stat-value">${fmtFull(row.grand_total_since_2022)}</div>
            </div>
            <div class="tn-stat-box">
              <div class="tn-stat-label">Since 2025</div>
              <div class="tn-stat-value">${fmtFull(row.grand_total_since_2025 || 0)}</div>
            </div>
          </div>

          <h3 class="tn-section-heading">Breakdown by Category</h3>
          <div class="tn-table-wrap" style="margin-bottom:20px;">
            <table class="tn-table">
              <thead><tr>
                <th>Category</th>
                <th class="num">Since 2012</th>
                <th class="num">Since 2017</th>
                <th class="num">Since 2022</th>
                <th class="num">Since 2025</th>
              </tr></thead>
              <tbody>
                ${row.has_lobbying ? `<tr>
                  <td>🏛️ Lobbying</td>
                  <td class="money">${fmtFull(row.lob_total_since_2012)}</td>
                  <td class="money">${fmtFull(row.lob_total_since_2017)}</td>
                  <td class="money">${fmtFull(row.lob_total_since_2022)}</td>
                  <td class="money">${fmtFull(row.lob_total_since_2025 || 0)}</td>
                </tr>` : ''}
                ${row.has_cf ? `<tr>
                  <td>💰 Campaign Finance</td>
                  <td class="money">${fmtFull(row.cf_total_since_2012)}</td>
                  <td class="money">${fmtFull(row.cf_total_since_2017)}</td>
                  <td class="money">${fmtFull(row.cf_total_since_2022)}</td>
                  <td class="money">${fmtFull(row.cf_total_since_2025 || 0)}</td>
                </tr>` : ''}
                ${row.has_ie ? `<tr>
                  <td>📊 Independent Expenditures</td>
                  <td class="money">${fmtFull(row.ie_total_since_2012)}</td>
                  <td class="money">${fmtFull(row.ie_total_since_2017)}</td>
                  <td class="money">${fmtFull(row.ie_total_since_2022)}</td>
                  <td class="money">${fmtFull(row.ie_total_since_2025 || 0)}</td>
                </tr>` : ''}
                <tr style="font-weight:600;border-top:2px solid var(--tn-border);">
                  <td>Total</td>
                  <td class="money" style="color:var(--tn-accent);">${fmtFull(row.grand_total_since_2012)}</td>
                  <td class="money">${fmtFull(row.grand_total_since_2017)}</td>
                  <td class="money">${fmtFull(row.grand_total_since_2022)}</td>
                  <td class="money">${fmtFull(row.grand_total_since_2025 || 0)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style="display:flex;gap:12px;flex-wrap:wrap;">
            ${row.has_lobbying ? `<button class="tn-subnav-btn" id="ts-goto-lob">View lobbying details →</button>` : ''}
            ${row.has_cf       ? `<button class="tn-subnav-btn" id="ts-goto-cf">View campaign finance →</button>`  : ''}
            ${row.has_ie       ? `<button class="tn-subnav-btn" id="ts-goto-ie">View independent expenditures →</button>` : ''}
          </div>
        </div>
      </div>
    `;

    container.querySelector('#ts-back').addEventListener('click', () => navigate({ entity: null }));

    container.querySelectorAll('.tn-era-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate({ era: btn.dataset.era }));
    });

    const lobBtn = container.querySelector('#ts-goto-lob');
    if (lobBtn) lobBtn.addEventListener('click', () => {
      navigate({ view: 'lobbying', entity: row.entity_name, subview: null });
    });

    const cfBtn = container.querySelector('#ts-goto-cf');
    if (cfBtn) cfBtn.addEventListener('click', () => {
      navigate({ view: 'campaign', entity: row.entity_name, subview: 'donors' });
    });

    const ieBtn = container.querySelector('#ts-goto-ie');
    if (ieBtn) ieBtn.addEventListener('click', () => {
      navigate({ view: 'ie', entity: row.entity_name, subview: 'ie-spenders' });
    });
  }

  return { render };
})();
