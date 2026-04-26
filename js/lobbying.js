/* ─────────────────────────────────────────────────────────────────────────────
   Tennessee Political Spending Database — lobbying.js
───────────────────────────────────────────────────────────────────────────── */

window.TNLobbying = (function () {
  'use strict';

function flexMatch(name, query) {
  if (!query) return true;
  const n = (name || '').toLowerCase();
  if (n.includes(query)) return true;
  if (n.includes(',')) {
    const parts = n.split(',').map(s => s.trim());
    const reversed = parts.slice(1).join(' ') + ' ' + parts[0];
    if (reversed.includes(query)) return true;
  }
  return false;
}

  const PAGE_SIZE = 50;

  function getEra(state) { return state.era || '5yr'; }

  function lobEraCol(era) {
    return `total_${era}`;
  }

  async function render(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading, renderEmpty } = helpers;

    if (state.entity) {
      await renderProfile(container, state, helpers);
      return;
    }

    renderLoading(container);

    const summary = await loadData('lobbying_summary.csv');
    if (!summary.length) { renderEmpty(container, 'No lobbying data available.'); return; }

    const era     = getEra(state);
    const eraCol  = lobEraCol(era);
    const query   = (state.query || '').toLowerCase();

    let rows = summary.filter(r => flexMatch(r.company_name, query));

    const sortCol = state.sortCol || eraCol;
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
               value="${state.query || ''}" id="lobbying-search" />
      </div>

      <div class="tn-result-count">
        Showing <strong>${visible.length.toLocaleString()}</strong> of
        <strong>${rows.length.toLocaleString()}</strong> companies
      </div>

      <div style="margin-bottom:16px;">
        <button id="lob-methodology-toggle" style="background:none;border:none;padding:0;cursor:pointer;font-size:13px;color:var(--tn-blue);font-family:var(--tn-font-sans);display:flex;align-items:center;gap:4px;">
          <span id="lob-methodology-arrow">▶</span> How we calculated these totals
        </button>
        <div id="lob-methodology-body" style="display:none;margin-top:8px;">
          <div class="tn-methodology">
            <strong>About this data:</strong> Tennessee law requires lobbyists to report compensation and expenses in dollar ranges rather than exact amounts — for example, "$50,000–$100,000" rather than a specific figure. We convert each range to its midpoint. So "$50,000–$100,000" is counted as $75,000, and "Less than $10,000" is counted as $5,000. These are estimates, not exact amounts. Data is reported semi-annually to the Tennessee Bureau of Ethics and Campaign Finance.
          </div>
        </div>
      </div>

      <div class="tn-table-wrap">
        <table class="tn-table">
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              <th data-sort="company_name">Company / Organization</th>
              ${window.TN_ERA_OPTS.map(([y, l]) => `
                <th class="num" data-sort="total_${y}">${l}</th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${visible.map((r, i) => `
              <tr>
                <td class="rank">${i + 1}</td>
                <td class="name-link" data-key="${encodeURIComponent(r.company_name)}">${r.company_name}</td>
                ${window.TN_ERA_OPTS.map(([y]) => `<td class="money">${fmt(r[`total_${y}`] || 0)}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      ${hasMore ? `<button class="tn-show-more" id="lobbying-more">Show more (${rows.length - visible.length} remaining)</button>` : ''}
    `;

    container.querySelectorAll('.tn-era-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate({ era: btn.dataset.era, page: 0 }));
    });

    let searchTimer;
    container.querySelector('#lobbying-search').addEventListener('input', e => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => navigate({ query: e.target.value, page: 0 }), 600);
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

    const moreBtn = container.querySelector('#lobbying-more');
    if (moreBtn) moreBtn.addEventListener('click', () => navigate({ page: (state.page || 0) + 1 }));

    const toggleBtn   = container.querySelector('#lob-methodology-toggle');
    const toggleBody  = container.querySelector('#lob-methodology-body');
    const toggleArrow = container.querySelector('#lob-methodology-arrow');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const isOpen = toggleBody.style.display !== 'none';
        toggleBody.style.display = isOpen ? 'none' : 'block';
        toggleArrow.textContent  = isOpen ? '▶' : '▼';
      });
    }
  }

  async function renderProfile(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading } = helpers;

    renderLoading(container);

    const [summary, detail, reports] = await Promise.all([
      loadData('lobbying_summary.csv'),
      loadData('lobbying_detail.csv'),
      loadData('lobbying_reports.csv'),
    ]);

    const company = state.entity;
    const row     = summary.find(r => r.company_name === company);
    if (!row) { container.innerHTML = `<div class="tn-empty">Company not found.</div>`; return; }

    const compDetail = detail
      .filter(r => r.company_name === company && parseInt(r.year) >= 2012)
      .sort((a, b) => parseInt(a.year) - parseInt(b.year));

    const compReports = reports
      .filter(r => {
        if (r.company_name !== company) return false;
        const year = parseInt(r.end_year) ||
                     parseInt((r.filing_period_raw || '').split('-')[3]) || 0;
        return year >= 2012;
      })
      .sort((a, b) => (b.filing_period_raw || '').localeCompare(a.filing_period_raw || ''));

    container.innerHTML = `
      <button class="tn-back-btn" id="lobbying-back">← Back to lobbying</button>

      <div class="tn-profile">
        <div class="tn-profile-header">
          <div class="tn-profile-name">${company}</div>
          ${row.link ? `<div class="tn-profile-meta"><a href="${row.link}" target="_blank" style="color:rgba(255,255,255,0.8);font-size:13px;">${row.link}</a></div>` : ''}
        </div>
        <div class="tn-profile-body">

          <div class="tn-profile-stats">
            ${window.TN_ERA_OPTS.map(([y, l]) => `
              <div class="tn-stat-box">
                <div class="tn-stat-label">${l}</div>
                <div class="tn-stat-value ${y === '15yr' ? 'accent' : ''}">${fmtFull(row[`total_${y}`] || 0)}</div>
              </div>
            `).join('')}
          </div>

          <div style="margin-bottom:20px;">
            <button id="lob-prof-toggle" style="background:none;border:none;padding:0;cursor:pointer;font-size:13px;color:var(--tn-blue);font-family:var(--tn-font-sans);display:flex;align-items:center;gap:4px;">
              <span id="lob-prof-arrow">▶</span> How we calculated these totals
            </button>
            <div id="lob-prof-body" style="display:none;margin-top:8px;">
              <div class="tn-methodology">
                Tennessee law requires lobbyists to report compensation and expenses in dollar ranges rather than exact amounts. We convert each range to its midpoint — so "$50,000–$100,000" becomes $75,000. These are estimates, not exact figures. Data covers 2012 through the most recent filing period.
              </div>
            </div>
          </div>

          ${compDetail.length ? `
            <h3 class="tn-section-heading">Spending by Year</h3>
            <div class="tn-table-wrap" style="margin-bottom:20px;">
              <table class="tn-table">
                <thead><tr><th>Year</th><th class="num">Amount (Estimated)</th></tr></thead>
                <tbody>
                  ${compDetail.map(r => `
                    <tr>
                      <td>${r.year}</td>
                      <td class="money">${fmtFull(r.amount)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : ''}

          <h3 class="tn-section-heading">Semi-Annual Reports</h3>
          <div class="tn-table-wrap">
            <table class="tn-table">
              <thead><tr>
                <th>Filing Period</th>
                <th class="num">Lobbyist Compensation</th>
                <th class="num">Related Expenses</th>
                <th class="num">Total (Estimated)</th>
              </tr></thead>
              <tbody>
                ${compReports.length ? compReports.map(r => `
                  <tr>
                    <td>${r.filing_period_display || r.filing_period_raw || ''}</td>
                    <td class="money">${fmtFull(r.lobbyist_compensation)}</td>
                    <td class="money">${fmtFull(r.lobbying_related_expenses)}</td>
                    <td class="money" style="font-weight:600;">${fmtFull(r.total)}</td>
                  </tr>
                `).join('') : `<tr><td colspan="4" style="text-align:center;color:var(--tn-text-muted);padding:20px;">No filing records found</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#lobbying-back').addEventListener('click', () => navigate({ entity: null }));

    const profToggle = container.querySelector('#lob-prof-toggle');
    const profBody   = container.querySelector('#lob-prof-body');
    const profArrow  = container.querySelector('#lob-prof-arrow');
    if (profToggle) {
      profToggle.addEventListener('click', () => {
        const isOpen = profBody.style.display !== 'none';
        profBody.style.display = isOpen ? 'none' : 'block';
        profArrow.textContent  = isOpen ? '▶' : '▼';
      });
    }
  }

  return { render };
})();
