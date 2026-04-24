/* ─────────────────────────────────────────────────────────────────────────────
   Tennessee Political Spending Database — top_spenders.js
   Top political spenders — cross-dataset rankings
───────────────────────────────────────────────────────────────────────────── */

window.TNTopSpenders = (function () {
  'use strict';

  const PAGE_SIZE = 50;

  function getEra(state) { return state.era || '2022'; }

  function eraCol(era, prefix) {
    const suffix = { '2012': 'since_2012', '2017': 'since_2017', '2022': 'since_2022', '2025': 'since_2025' }[era] || 'since_2022';
    return prefix ? `${prefix}_total_${suffix}` : `grand_total_${suffix}`;
  }

  async function render(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading, renderEmpty } = helpers;

    if (state.entity) {
      await renderProfile(container, state, helpers);
      return;
    }

    renderLoading(container);

    const data = await loadData('master_entities.json');
    if (!data || !data.length) { renderEmpty(container, 'No data available.'); return; }

    const era      = getEra(state);
    const qualKey  = `qualifies_${era}`;
    const grandCol = eraCol(era);
    const lobCol   = eraCol(era, 'lob');
    const cfCol    = eraCol(era, 'cf');
    const ieCol    = eraCol(era, 'ie');

    const query = (state.query || '').toLowerCase();
    let rows = data.filter(r => {
      const matchesEra    = r[qualKey] === true;
      const matchesSearch = !query ||
        (r.entity_name || '').toLowerCase().includes(query) ||
        (r.aliases || []).some(a => a.toLowerCase().includes(query));
      return matchesEra && matchesSearch;
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
      <div class="tn-methodology">
        <strong>About this ranking:</strong> Combines lobbying spending, campaign contributions,
        and independent expenditure spending. Lobbying figures are midpoint estimates.
        Politician PACs and party caucuses are excluded.
      </div>

      <div class="tn-era-filters">
        <span class="tn-era-label">Show spending:</span>
        ${window.TN_ERA_OPTS.map(([y, l]) => `
          <button class="tn-era-btn ${era === y ? 'active' : ''}" data-era="${y}">${l}</button>
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
        spending $500K+ ${window.TN_ERA_OPTS.find(([y]) => y === era)?.[1]?.toLowerCase() || ''}
      </div>

      <div class="tn-table-wrap">
        <table class="tn-table">
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              <th>Organization</th>
              <th class="num" data-sort="${lobCol}">Lobbying</th>
              <th class="num" data-sort="${cfCol}">Campaign Finance</th>
              <th class="num" data-sort="${ieCol}">Ind. Expenditures</th>
              <th class="num" data-sort="${grandCol}">Total</th>
              <th style="width:80px;">In</th>
            </tr>
          </thead>
          <tbody>
            ${visible.map((r, i) => {
              const badges = [
                r.has_lobbying ? '<span class="tn-badge" style="background:#e8f4e8;color:#1a5c3a;">LOB</span>' : '',
                r.has_cf       ? '<span class="tn-badge" style="background:#e8eef8;color:#1a3a5c;">CF</span>'  : '',
                r.has_ie       ? '<span class="tn-badge" style="background:#fef3e8;color:#8c4a00;">IE</span>'  : '',
              ].filter(Boolean).join(' ');
              return `
                <tr>
                  <td class="rank">${i + 1}</td>
                  <td class="name-link" data-key="${encodeURIComponent(r.entity_name)}">
                    ${r.entity_name}
                    ${r.website ? `<a href="${r.website}" target="_blank" style="color:var(--tn-text-light);font-size:11px;margin-left:4px;" onclick="event.stopPropagation()">↗</a>` : ''}
                  </td>
                  <td class="money">${r[lobCol] > 0 ? fmt(r[lobCol]) : '—'}</td>
                  <td class="money">${r[cfCol]  > 0 ? fmt(r[cfCol])  : '—'}</td>
                  <td class="money">${r[ieCol]  > 0 ? fmt(r[ieCol])  : '—'}</td>
                  <td class="money" style="font-weight:600;">${fmt(r[grandCol])}</td>
                  <td style="text-align:center;">${badges}</td>
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

    container.querySelectorAll('.tn-era-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate({ era: btn.dataset.era, page: 0 }));
    });

    let searchTimer;
    container.querySelector('#ts-search').addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => navigate({ query: e.target.value, page: 0 }), 280);
    });

    container.querySelectorAll('.tn-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        const dir = state.sortCol === col && state.sortDir === 'desc' ? 'asc' : 'desc';
        navigate({ sortCol: col, sortDir: dir, page: 0 });
      });
    });

    container.querySelectorAll('.name-link[data-key]').forEach(cell => {
      cell.addEventListener('click', () => navigate({ entity: decodeURIComponent(cell.dataset.key) }));
    });

    const moreBtn = container.querySelector('#ts-more');
    if (moreBtn) moreBtn.addEventListener('click', () => navigate({ page: (state.page || 0) + 1 }));
  }

  // ── Entity profile ───────────────────────────────────────────────────────────
  async function renderProfile(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading } = helpers;

    renderLoading(container);

    const data   = await loadData('master_entities.json');
    const entity = state.entity;
    const row    = data.find(r => r.entity_name === entity);

    if (!row) { container.innerHTML = `<div class="tn-empty">Entity not found.</div>`; return; }

    container.innerHTML = `
      <button class="tn-back-btn" id="ts-back">← Back to top spenders</button>

      <div class="tn-profile">
        <div class="tn-profile-header">
          <div class="tn-profile-name">${row.entity_name}</div>
          <div class="tn-profile-meta">
            ${row.has_lobbying ? '<span>Lobbying</span>' : ''}
            ${row.has_cf  ? '<span>Campaign Finance</span>' : ''}
            ${row.has_ie  ? '<span>Independent Expenditures</span>' : ''}
            ${row.website ? `<a href="${row.website}" target="_blank" style="color:rgba(255,255,255,0.8);">Website ↗</a>` : ''}
          </div>
        </div>
        <div class="tn-profile-body">

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

    const lobBtn = container.querySelector('#ts-goto-lob');
    if (lobBtn) lobBtn.addEventListener('click', () => navigate({ view: 'lobbying', entity: row.entity_name, subview: null }));

    const cfBtn = container.querySelector('#ts-goto-cf');
    if (cfBtn) cfBtn.addEventListener('click', () => navigate({ view: 'campaign', entity: row.entity_name, subview: 'donors' }));

    const ieBtn = container.querySelector('#ts-goto-ie');
    if (ieBtn) ieBtn.addEventListener('click', () => navigate({ view: 'ie', entity: row.entity_name, subview: 'ie-spenders' }));
  }

  return { render };
})();
