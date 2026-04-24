/* ─────────────────────────────────────────────────────────────────────────────
   Tennessee Political Spending Database — lobbying.js
   Lobbying module: top spenders table + company profile drill-down
───────────────────────────────────────────────────────────────────────────── */

window.TNLobbying = (function () {
  'use strict';

  const PAGE_SIZE = 50;

  // ── Era column map for lobbying (uses different column names) ────────────────
  function lobbyEraCol(era) {
    const map = {
      '2012': 'total_since_2011',   // lobbying starts 2011
      '2017': 'total_since_2017',
      '2022': 'total_since_2022',
      '2025': 'total_since_2025',
    };
    return map[era] || 'total_since_2011';
  }

  // ── Main render entry point ──────────────────────────────────────────────────
  async function render(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading, renderEmpty } = helpers;

    // If an entity is selected show the profile view
    if (state.entity) {
      await renderProfile(container, state, helpers);
      return;
    }

    // Otherwise show the top spenders table
    renderLoading(container);

    const [summary, detail] = await Promise.all([
      loadData('lobbying_summary.csv'),
      loadData('lobbying_detail.csv'),
    ]);

    if (!summary.length) { renderEmpty(container, 'No lobbying data available.'); return; }

    // Filter by search query
    const query   = (state.query || '').toLowerCase();
    const eraCol  = lobbyEraCol(state.era);
    let   rows    = summary.filter(r => !query || (r.company_name || '').toLowerCase().includes(query));

    // Sort
    const sortCol = state.sortCol || eraCol;
    const sortDir = state.sortDir || 'desc';
    rows = rows.slice().sort((a, b) => {
      const av = parseFloat(a[sortCol]) || 0;
      const bv = parseFloat(b[sortCol]) || 0;
      return sortDir === 'desc' ? bv - av : av - bv;
    });

    // Paginate
    const page     = state.page || 0;
    const visible  = rows.slice(0, (page + 1) * PAGE_SIZE);
    const hasMore  = rows.length > visible.length;

    // ── Render ─────────────────────────────────────────────────────────────────
    container.innerHTML = `
      <div class="tn-methodology">
        <strong>About this data:</strong> Reported semi-annually to the Tennessee Bureau of Ethics and
        Campaign Finance. Because the state records spending in ranges, figures shown are midpoint
        estimates — e.g. "Less than $10,000" is counted as $5,000.
      </div>

      <div class="tn-era-filters">
        <span class="tn-era-label">Show spending since:</span>
        ${['2012','2017','2022','2025'].map(y => `
          <button class="tn-era-btn ${state.era === y ? 'active' : ''}" data-era="${y}">
            ${y === '2012' ? 'All Years' : y}
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
               value="${state.query || ''}" id="lobbying-search" />
      </div>

      <div class="tn-result-count">
        Showing <strong>${visible.length.toLocaleString()}</strong> of
        <strong>${rows.length.toLocaleString()}</strong> companies
      </div>

      <div class="tn-table-wrap">
        <table class="tn-table" id="lobbying-table">
          <thead>
            <tr>
              <th style="width:40px;">#</th>
              <th data-sort="company_name">Company / Organization</th>
              <th class="num" data-sort="${lobbyEraCol('2012')}">All Years</th>
              <th class="num" data-sort="${lobbyEraCol('2017')}">Since 2017</th>
              <th class="num" data-sort="${lobbyEraCol('2022')}">Since 2022</th>
              <th class="num" data-sort="${lobbyEraCol('2025')}">Since 2025</th>
            </tr>
          </thead>
          <tbody id="lobbying-tbody">
            ${visible.map((r, i) => `
              <tr>
                <td class="rank">${i + 1}</td>
                <td class="name-link" data-key="${encodeURIComponent(r.company_name)}">${r.company_name}</td>
                <td class="money">${fmt(r.total_since_2011)}</td>
                <td class="money">${fmt(r.total_since_2017)}</td>
                <td class="money">${fmt(r.total_since_2022)}</td>
                <td class="money">${fmt(r.total_since_2025)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      ${hasMore ? `<button class="tn-show-more" id="lobbying-more">
        Show more (${rows.length - visible.length} remaining)
      </button>` : ''}
    `;

    // ── Event listeners ────────────────────────────────────────────────────────

    // Era filter
    container.querySelectorAll('.tn-era-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        navigate({ era: btn.dataset.era, page: 0 });
      });
    });

    // Search
    const searchInput = container.querySelector('#lobbying-search');
    let   searchTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        navigate({ query: searchInput.value, page: 0 });
      }, 280);
    });

    // Sort columns
    container.querySelectorAll('.tn-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        const dir = state.sortCol === col && state.sortDir === 'desc' ? 'asc' : 'desc';
        navigate({ sortCol: col, sortDir: dir, page: 0 });
      });
    });

    // Row click → profile
    container.querySelectorAll('.name-link[data-key]').forEach(cell => {
      cell.addEventListener('click', () => {
        navigate({ entity: decodeURIComponent(cell.dataset.key) });
      });
    });

    // Show more
    const moreBtn = container.querySelector('#lobbying-more');
    if (moreBtn) {
      moreBtn.addEventListener('click', () => {
        navigate({ page: (state.page || 0) + 1 });
      });
    }
  }

  // ── Company profile view ─────────────────────────────────────────────────────
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
    if (!row) {
      container.innerHTML = `<div class="tn-empty">Company not found.</div>`;
      return;
    }

    const compReports = reports.filter(r => r.company_name === company)
                               .sort((a, b) => (b.filing_period_raw || '').localeCompare(a.filing_period_raw || ''));

    const compDetail  = detail.filter(r => r.company_name === company)
                              .sort((a, b) => parseInt(a.year) - parseInt(b.year));

    container.innerHTML = `
      <button class="tn-back-btn" id="lobbying-back">← Back to lobbying</button>

      <div class="tn-profile">
        <div class="tn-profile-header">
          <div class="tn-profile-name">${company}</div>
          ${row.link ? `<div class="tn-profile-meta"><a href="${row.link}" target="_blank" style="color:rgba(255,255,255,0.8);font-size:13px;">${row.link}</a></div>` : ''}
        </div>
        <div class="tn-profile-body">
          <div class="tn-profile-stats">
            <div class="tn-stat-box">
              <div class="tn-stat-label">Total (all years)</div>
              <div class="tn-stat-value accent">${fmtFull(row.total_since_2011)}</div>
            </div>
            <div class="tn-stat-box">
              <div class="tn-stat-label">Since 2017</div>
              <div class="tn-stat-value">${fmtFull(row.total_since_2017)}</div>
            </div>
            <div class="tn-stat-box">
              <div class="tn-stat-label">Since 2022</div>
              <div class="tn-stat-value">${fmtFull(row.total_since_2022)}</div>
            </div>
            <div class="tn-stat-box">
              <div class="tn-stat-label">Since 2025</div>
              <div class="tn-stat-value">${fmtFull(row.total_since_2025)}</div>
            </div>
          </div>

          ${compDetail.length ? `
            <h3 class="tn-section-heading">Spending by Year</h3>
            <div class="tn-table-wrap" style="margin-bottom:20px;">
              <table class="tn-table">
                <thead><tr>
                  <th>Year</th>
                  <th class="num">Amount</th>
                </tr></thead>
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
          <div class="tn-methodology" style="margin-bottom:12px;">
            Figures are midpoint estimates converted from ranges reported to the state.
            Compensation and related expenses are reported separately.
          </div>
          <div class="tn-table-wrap">
            <table class="tn-table">
              <thead><tr>
                <th>Filing Period</th>
                <th class="num">Lobbyist Compensation</th>
                <th class="num">Related Expenses</th>
                <th class="num">Total</th>
              </tr></thead>
              <tbody>
                ${compReports.length ? compReports.map(r => `
                  <tr>
                    <td>${r.filing_period_display || r.filing_period_raw || ''}</td>
                    <td class="money">${fmtFull(r.lobbyist_compensation)}</td>
                    <td class="money">${fmtFull(r.lobbying_related_expenses)}</td>
                    <td class="money" style="font-weight:600;">${fmtFull(r.total)}</td>
                  </tr>
                `).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--tn-text-muted);padding:20px;">No filing records found</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    container.querySelector('#lobbying-back').addEventListener('click', () => {
      navigate({ entity: null });
    });
  }

  return { render };

})();
