/* ─────────────────────────────────────────────────────────────────────────────
   Tennessee Political Spending Database — ie.js
   Independent expenditures module
   Includes rolling window eras + election cycle filters
───────────────────────────────────────────────────────────────────────────── */

window.TNIE = (function () {
  'use strict';

  const PAGE_SIZE = 50;

  function getEra(state) { return state.era || '5yr'; }

  // Resolve column name from era key
  function ieCol(era, prefix) {
    // cycle eras use cycle_ prefix in data
    const isCycle = era.startsWith('cycle_');
    const suffix  = isCycle ? era : `total_${era}`;
    return prefix ? `${prefix}_${suffix}` : `total_${suffix}`;
  }

  // Era filter buttons — combined row
  function eraButtons(currentEra) {
    return `
      <div class="tn-era-filters" style="flex-wrap:wrap;gap:6px;align-items:center;">
        <span class="tn-era-label">Show:</span>
        ${window.TN_IE_ERA_OPTS.map(([y, l], idx) => `
          ${idx === 4 ? '<span style="width:1px;height:20px;background:var(--tn-border);display:inline-block;margin:0 4px;"></span>' : ''}
          <button class="tn-era-btn ${currentEra === y ? 'active' : ''}" data-era="${y}">${l}</button>
        `).join('')}
      </div>
    `;
  }

  // ── Main render ──────────────────────────────────────────────────────────────
  async function render(container, state, helpers) {
    const { navigate } = helpers;

    if (state.entity && state.subview === 'ie-politician') {
      await renderPoliticianProfile(container, state, helpers);
      return;
    }
    if (state.entity && state.subview === 'ie-spender') {
      await renderSpenderProfile(container, state, helpers);
      return;
    }

    const subview = state.subview || 'ie-spenders';

    container.innerHTML = `
      <div class="tn-subnav">
        <button class="tn-subnav-btn ${subview === 'ie-spenders'    ? 'active' : ''}" data-sub="ie-spenders">Spenders</button>
        <button class="tn-subnav-btn ${subview === 'ie-politicians' ? 'active' : ''}" data-sub="ie-politicians">Politicians</button>
      </div>
      <div id="ie-sub-content"></div>
    `;

    container.querySelectorAll('.tn-subnav-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate({ subview: btn.dataset.sub, entity: null, query: '', page: 0 }));
    });

    const sub = container.querySelector('#ie-sub-content');
    if (subview === 'ie-spenders') {
      await renderSpenders(sub, state, helpers);
    } else {
      await renderPoliticians(sub, state, helpers);
    }
  }

  // ── Spenders tab ─────────────────────────────────────────────────────────────
  async function renderSpenders(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading, renderEmpty, normalizeName } = helpers;

    renderLoading(container);

    const spenders = await loadData('ie_spender_summary.csv');
    if (!spenders.length) { renderEmpty(container, 'No spender data available.'); return; }

    const era   = getEra(state);
    const col   = ieCol(era);
    const query = (state.query || '').toLowerCase();

    let rows = spenders.filter(r => {
      const matchSearch = !query || (r.spender_name || '').toLowerCase().includes(query);
      return matchSearch && parseFloat(r[col]) > 0;
    }).sort((a, b) => (parseFloat(b[col]) || 0) - (parseFloat(a[col]) || 0));

    const page    = state.page || 0;
    const visible = rows.slice(0, (page + 1) * PAGE_SIZE);
    const hasMore = rows.length > visible.length;

    const supportCol = ieCol(era, 'support');
    const opposeCol  = ieCol(era, 'oppose');

    container.innerHTML = `
      <div class="tn-methodology">
        <strong>About independent expenditures:</strong> Money spent by outside groups
        to support or oppose Tennessee candidates — reported separately from candidate campaigns.
      </div>

      ${eraButtons(era)}

      <div class="tn-search-wrap">
        <span class="tn-search-icon">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </span>
        <input class="tn-search" type="text" placeholder="Search a spender or organization..."
               value="${state.query || ''}" id="ie-spender-search" />
      </div>

      <div class="tn-result-count">
        Showing <strong>${visible.length.toLocaleString()}</strong> of
        <strong>${rows.length.toLocaleString()}</strong> spenders
      </div>

      <div class="tn-table-wrap">
        <table class="tn-table">
          <thead><tr>
            <th style="width:40px;">#</th>
            <th>Spender</th>
            <th class="num">Total Spent</th>
            <th class="num">Support</th>
            <th class="num">Oppose</th>
          </tr></thead>
          <tbody>
            ${visible.map((r, i) => `
              <tr>
                <td class="rank">${i + 1}</td>
                <td class="name-link" data-key="${encodeURIComponent(r.spender_name)}">${normalizeName(r.spender_name)}</td>
                <td class="money" style="font-weight:600;">${fmt(r[col] || 0)}</td>
                <td class="money" style="color:var(--tn-green);">${fmt(r[supportCol] || 0)}</td>
                <td class="money" style="color:var(--tn-accent);">${fmt(r[opposeCol] || 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      ${hasMore ? `<button class="tn-show-more" id="ie-spender-more">Show more (${rows.length - visible.length} remaining)</button>` : ''}
    `;

    container.querySelectorAll('.tn-era-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate({ era: btn.dataset.era, page: 0 }));
    });
    let timer;
    container.querySelector('#ie-spender-search').addEventListener('input', e => {
      clearTimeout(timer);
      timer = setTimeout(() => navigate({ query: e.target.value, page: 0 }), 280);
    });
    container.querySelectorAll('.name-link[data-key]').forEach(cell => {
      cell.addEventListener('click', () => navigate({ entity: decodeURIComponent(cell.dataset.key), subview: 'ie-spender' }));
    });
    const moreBtn = container.querySelector('#ie-spender-more');
    if (moreBtn) moreBtn.addEventListener('click', () => navigate({ page: (state.page || 0) + 1 }));

    // ── Restore search focus after re-render ────────────────────────────────
    const searchInput = container.querySelector('#ie-spender-search');
    if (searchInput && state.query) {
      searchInput.focus();
      const len = searchInput.value.length;
      searchInput.setSelectionRange(len, len);
    }
  }

  // ── Spender profile ──────────────────────────────────────────────────────────
  async function renderSpenderProfile(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading, normalizeName } = helpers;

    renderLoading(container);

    const [spenders, pairs, rawRecords, spenderDonors] = await Promise.all([
      loadData('ie_spender_summary.csv'),
      loadData('ie_spender_to_politician.csv'),
      loadData('ie_raw_records.csv'),
      loadData('ie_spender_donors.csv'),
    ]);

    const key     = state.entity;
    const spender = spenders.find(r => r.spender_name === key);
    const era     = getEra(state);
    const tab     = state.ieTab || 'spent';

    const col        = ieCol(era);
    const supportCol = ieCol(era, 'support');
    const opposeCol  = ieCol(era, 'oppose');

    // Filter recipients by era — don't show names with zero spending in this period
    const recipients = pairs
      .filter(r => r.spender_name === key && parseFloat(r[col]) > 0)
      .sort((a, b) => (parseFloat(b[col]) || 0) - (parseFloat(a[col]) || 0));

    const donors = spenderDonors
      .filter(r => r.spender_name === key)
      .sort((a, b) => (parseFloat(b.total_since_2012 || b.total_15yr) || 0) - (parseFloat(a.total_since_2012 || a.total_15yr) || 0));

    const raw = rawRecords
      .filter(r => r.spender_name === key)
      .sort((a, b) => (b.year || '').toString().localeCompare((a.year || '').toString()));

    // Detect year columns in donor file
    const donorCols = spenderDonors.length > 0 ? Object.keys(spenderDonors[0]) : [];
    const yearCols  = donorCols.filter(c => /^\d{4}$/.test(c)).sort();

    container.innerHTML = `
      <button class="tn-back-btn" id="ie-spender-back">← Back to spenders</button>

      <div class="tn-profile">
        <div class="tn-profile-header">
          <div class="tn-profile-name">${normalizeName(key)}</div>
          ${spender && spender.original_name && spender.original_name !== key ? `
            <div class="tn-profile-meta"><span>Filed as: ${spender.original_name}</span></div>
          ` : ''}
        </div>
        <div class="tn-profile-body">

          ${eraButtons(era)}

          ${spender ? `
            <div class="tn-profile-stats" style="margin-top:16px;">
              <div class="tn-stat-box">
                <div class="tn-stat-label">Total IE Spending</div>
                <div class="tn-stat-value accent">${fmtFull(spender[col] || 0)}</div>
              </div>
              <div class="tn-stat-box">
                <div class="tn-stat-label">In Support</div>
                <div class="tn-stat-value" style="color:var(--tn-green);">${fmtFull(spender[supportCol] || 0)}</div>
              </div>
              <div class="tn-stat-box">
                <div class="tn-stat-label">In Opposition</div>
                <div class="tn-stat-value" style="color:var(--tn-accent);">${fmtFull(spender[opposeCol] || 0)}</div>
              </div>
            </div>
          ` : ''}

          <div class="tn-subnav" style="margin:16px 0;">
            <button class="tn-subnav-btn ${tab === 'spent'  ? 'active' : ''}" data-tab="spent">Where Money Was Spent</button>
            <button class="tn-subnav-btn ${tab === 'donors' ? 'active' : ''}" data-tab="donors">Who Funded This Group</button>
            <button class="tn-subnav-btn ${tab === 'raw'    ? 'active' : ''}" data-tab="raw">Raw Records</button>
          </div>

          ${tab === 'spent' ? `
            ${recipients.length ? `
              <div class="tn-table-wrap">
                <table class="tn-table">
                  <thead><tr>
                    <th style="width:40px;">#</th>
                    <th>Politician</th>
                    <th class="num">Total</th>
                    <th class="num">Support</th>
                    <th class="num">Oppose</th>
                    <th>Stance</th>
                  </tr></thead>
                  <tbody>
                    ${recipients.map((r, i) => `
                      <tr>
                        <td class="rank">${i + 1}</td>
                        <td>${normalizeName(r.politician_display || r.politician_key)}</td>
                        <td class="money" style="font-weight:600;">${fmtFull(r[col] || 0)}</td>
                        <td class="money" style="color:var(--tn-green);">${fmtFull(r[supportCol] || 0)}</td>
                        <td class="money" style="color:var(--tn-accent);">${fmtFull(r[opposeCol] || 0)}</td>
                        <td><span class="tn-badge ${r.net_stance === 'Support' ? 'tn-badge-dem' : 'tn-badge-rep'}">${r.net_stance || ''}</span></td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : '<p style="color:var(--tn-text-muted);font-size:14px;">No spending recorded for this time period.</p>'}
          ` : ''}

          ${tab === 'donors' ? `
            ${donors.length ? `
              <div class="tn-methodology">
                Donors pulled from Tennessee Registry of Election Finance contribution records.
                Some groups may have additional funding sources not captured in state filings.
              </div>
              <div class="tn-table-wrap">
                <table class="tn-table">
                  <thead><tr>
                    <th style="width:40px;">#</th>
                    <th>Donor</th>
                    <th class="num">Total</th>
                    <th class="num"># Donations</th>
                  </tr></thead>
                  <tbody>
                    ${donors.map((d, i) => {
                      const activeYears = yearCols.filter(y => parseFloat(d[y]) > 0);
                      return `
                        <tr style="border-bottom:${activeYears.length ? 'none' : ''};">
                          <td class="rank" style="vertical-align:top;padding-top:12px;">${i + 1}</td>
                          <td style="vertical-align:top;padding-top:12px;font-weight:500;">${normalizeName(d.donor_name)}</td>
                          <td class="money" style="font-weight:600;vertical-align:top;padding-top:12px;">${fmtFull(d.total_since_2012 || d.total_15yr || 0)}</td>
                          <td class="money" style="vertical-align:top;padding-top:12px;">${parseInt(d.num_donations || 0).toLocaleString()}</td>
                        </tr>
                        ${activeYears.map((y, yi) => `
                          <tr style="background:#f7f7f5;${yi === activeYears.length - 1 ? 'border-bottom:2px solid var(--tn-border);' : 'border-bottom:none;'}">
                            <td></td>
                            <td style="font-size:12px;color:var(--tn-text-muted);padding-top:4px;padding-bottom:4px;padding-left:28px;">${y}</td>
                            <td class="money" style="font-size:12px;color:var(--tn-text-muted);padding-top:4px;padding-bottom:4px;">${fmtFull(parseFloat(d[y]))}</td>
                            <td></td>
                          </tr>
                        `).join('')}
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            ` : '<p style="color:var(--tn-text-muted);font-size:14px;">No donor records found in contribution database.</p>'}
          ` : ''}

          ${tab === 'raw' ? `
            ${raw.length ? `
              <div class="tn-table-wrap">
                <table class="tn-table">
                  <thead><tr>
                    <th>Year</th>
                    <th>Politician</th>
                    <th class="num">Amount</th>
                    <th>Stance</th>
                    <th>Type</th>
                  </tr></thead>
                  <tbody>
                    ${raw.map(r => `
                      <tr>
                        <td style="font-family:var(--tn-font-mono);font-size:12px;">${r.year || ''}</td>
                        <td>${normalizeName(r.politician_display || r.politician_key || '')}</td>
                        <td class="money">${fmtFull(r.amount)}</td>
                        <td><span class="tn-badge ${r.support_or_oppose === 'Support' ? 'tn-badge-dem' : 'tn-badge-rep'}">${r.support_or_oppose || ''}</span></td>
                        <td style="font-size:12px;color:var(--tn-text-muted);">${r.spending_type || ''}</td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : '<p style="color:var(--tn-text-muted);font-size:14px;">No raw records found.</p>'}
          ` : ''}
        </div>
      </div>
    `;

    container.querySelector('#ie-spender-back').addEventListener('click', () => navigate({ entity: null, subview: 'ie-spenders' }));
    container.querySelectorAll('.tn-era-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate({ era: btn.dataset.era }));
    });
    container.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => navigate({ ieTab: btn.dataset.tab }));
    });
  }

  // ── Politicians tab ──────────────────────────────────────────────────────────
  async function renderPoliticians(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading, renderEmpty, partyBadge, normalizeName } = helpers;

    renderLoading(container);

    const pols = await loadData('ie_politician_summary.csv');
    if (!pols.length) { renderEmpty(container, 'No IE politician data available.'); return; }

    const era    = getEra(state);
    const col    = ieCol(era);
    const filter = state.polFilter || 'all';
    const query  = (state.query || '').toLowerCase();

    const supportCol = ieCol(era, 'support');
    const opposeCol  = ieCol(era, 'oppose');

    let rows = pols.filter(r => {
      const matchFilter = filter === 'current' ? r.current_elected === 'Yes' : true;
      const matchSearch = !query || (r.politician_display || '').toLowerCase().includes(query);
      return matchFilter && matchSearch && parseFloat(r[col]) > 0;
    }).sort((a, b) => (parseFloat(b[col]) || 0) - (parseFloat(a[col]) || 0));

    const page    = state.page || 0;
    const visible = rows.slice(0, (page + 1) * PAGE_SIZE);
    const hasMore = rows.length > visible.length;

    container.innerHTML = `
      ${eraButtons(era)}

      <div style="display:flex;gap:8px;margin:12px 0 16px;flex-wrap:wrap;">
        <button class="tn-subnav-btn ${filter === 'all'     ? 'active' : ''}" data-filter="all">All Politicians</button>
        <button class="tn-subnav-btn ${filter === 'current' ? 'active' : ''}" data-filter="current">Currently Elected</button>
      </div>

      <div class="tn-search-wrap">
        <span class="tn-search-icon">
          <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
        </span>
        <input class="tn-search" type="text" placeholder="Search a politician..."
               value="${state.query || ''}" id="ie-pol-search" />
      </div>

      <div class="tn-result-count">
        Showing <strong>${visible.length.toLocaleString()}</strong> of
        <strong>${rows.length.toLocaleString()}</strong> politicians
      </div>

      <div class="tn-table-wrap">
        <table class="tn-table">
          <thead><tr>
            <th style="width:40px;">#</th>
            <th>Politician</th>
            <th>Party</th>
            <th class="num">Total IE Spent</th>
            <th class="num">Support</th>
            <th class="num">Oppose</th>
          </tr></thead>
          <tbody>
            ${visible.map((r, i) => `
              <tr>
                <td class="rank">${i + 1}</td>
                <td class="name-link" data-key="${encodeURIComponent(r.politician_display || r.politician_key)}">
                  ${normalizeName(r.politician_display || r.politician_key)}
                </td>
                <td>${partyBadge(r.party)}</td>
                <td class="money" style="font-weight:600;">${fmt(r[col] || 0)}</td>
                <td class="money" style="color:var(--tn-green);">${fmt(r[supportCol] || 0)}</td>
                <td class="money" style="color:var(--tn-accent);">${fmt(r[opposeCol] || 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      ${hasMore ? `<button class="tn-show-more" id="ie-pol-more">Show more (${rows.length - visible.length} remaining)</button>` : ''}
    `;

    container.querySelectorAll('.tn-era-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate({ era: btn.dataset.era, page: 0 }));
    });
    container.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => navigate({ polFilter: btn.dataset.filter, page: 0, query: '' }));
    });
    let timer;
    container.querySelector('#ie-pol-search').addEventListener('input', e => {
      clearTimeout(timer);
      timer = setTimeout(() => navigate({ query: e.target.value, page: 0 }), 280);
    });
    container.querySelectorAll('.name-link[data-key]').forEach(cell => {
      cell.addEventListener('click', () => navigate({ entity: decodeURIComponent(cell.dataset.key), subview: 'ie-politician' }));
    });
    const moreBtn = container.querySelector('#ie-pol-more');
    if (moreBtn) moreBtn.addEventListener('click', () => navigate({ page: (state.page || 0) + 1 }));

    // ── Restore search focus after re-render ────────────────────────────────
    const searchInput = container.querySelector('#ie-pol-search');
    if (searchInput && state.query) {
      searchInput.focus();
      const len = searchInput.value.length;
      searchInput.setSelectionRange(len, len);
    }
  }

  // ── IE Politician profile ────────────────────────────────────────────────────
  async function renderPoliticianProfile(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading, partyBadge, normalizeName } = helpers;

    renderLoading(container);

    const [pols, pairs] = await Promise.all([
      loadData('ie_politician_summary.csv'),
      loadData('ie_spender_to_politician.csv'),
    ]);

    const key  = state.entity;
    const pol  = pols.find(r => (r.politician_display || r.politician_key) === key);
    const era  = getEra(state);

    const col        = ieCol(era);
    const supportCol = ieCol(era, 'support');
    const opposeCol  = ieCol(era, 'oppose');

    // Only show spenders with actual spending in this era
    const spenders = pairs
      .filter(r => (r.politician_display || r.politician_key) === key && parseFloat(r[col]) > 0)
      .sort((a, b) => (parseFloat(b[col]) || 0) - (parseFloat(a[col]) || 0));

    container.innerHTML = `
      <button class="tn-back-btn" id="ie-pol-back">← Back to politicians</button>

      <div class="tn-profile">
        <div class="tn-profile-header">
          <div class="tn-profile-name">${normalizeName(key)}</div>
          ${pol ? `<div class="tn-profile-meta">
            <span>${pol.party || ''}</span>
            ${pol.current_seat ? `<span>${pol.current_seat}</span>` : ''}
          </div>` : ''}
        </div>
        <div class="tn-profile-body">

          ${eraButtons(era)}

          ${pol ? `
            <div class="tn-profile-stats" style="margin-top:16px;">
              <div class="tn-stat-box">
                <div class="tn-stat-label">Total IE Spent On Them</div>
                <div class="tn-stat-value accent">${fmtFull(pol[col] || 0)}</div>
              </div>
              <div class="tn-stat-box">
                <div class="tn-stat-label">Support</div>
                <div class="tn-stat-value" style="color:var(--tn-green);">${fmtFull(pol[supportCol] || 0)}</div>
              </div>
              <div class="tn-stat-box">
                <div class="tn-stat-label">Oppose</div>
                <div class="tn-stat-value" style="color:var(--tn-accent);">${fmtFull(pol[opposeCol] || 0)}</div>
              </div>
            </div>
          ` : ''}

          <h3 class="tn-section-heading">Groups That Spent Money On This Race</h3>
          ${spenders.length ? `
            <div class="tn-table-wrap">
              <table class="tn-table">
                <thead><tr>
                  <th style="width:40px;">#</th>
                  <th>Spender</th>
                  <th class="num">Total</th>
                  <th class="num">Support</th>
                  <th class="num">Oppose</th>
                  <th>Net Stance</th>
                </tr></thead>
                <tbody>
                  ${spenders.map((r, i) => `
                    <tr>
                      <td class="rank">${i + 1}</td>
                      <td class="name-link" data-spender="${encodeURIComponent(r.spender_name)}">${normalizeName(r.spender_name)}</td>
                      <td class="money" style="font-weight:600;">${fmtFull(r[col] || 0)}</td>
                      <td class="money" style="color:var(--tn-green);">${fmtFull(r[supportCol] || 0)}</td>
                      <td class="money" style="color:var(--tn-accent);">${fmtFull(r[opposeCol] || 0)}</td>
                      <td><span class="tn-badge ${r.net_stance === 'Support' ? 'tn-badge-dem' : 'tn-badge-rep'}">${r.net_stance || ''}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<p style="color:var(--tn-text-muted);font-size:14px;">No spending recorded for this time period.</p>'}
        </div>
      </div>
    `;

    container.querySelector('#ie-pol-back').addEventListener('click', () => navigate({ entity: null, subview: 'ie-politicians' }));
    container.querySelectorAll('.tn-era-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate({ era: btn.dataset.era }));
    });
    container.querySelectorAll('.name-link[data-spender]').forEach(cell => {
      cell.addEventListener('click', () => navigate({ entity: decodeURIComponent(cell.dataset.spender), subview: 'ie-spender' }));
    });
  }

  return { render };
})();
