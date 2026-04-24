/* ─────────────────────────────────────────────────────────────────────────────
   Tennessee Political Spending Database — ie.js
   Independent expenditures module
   Spenders shown first, default era 2022, no 2026 filter
───────────────────────────────────────────────────────────────────────────── */

window.TNIE = (function () {
  'use strict';

  const PAGE_SIZE = 50;

  function getEra(state) { return state.era || '2022'; }

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
      btn.addEventListener('click', () => {
        navigate({ subview: btn.dataset.sub, entity: null, query: '', page: 0 });
      });
    });

    const sub = container.querySelector('#ie-sub-content');
    if (subview === 'ie-spenders') {
      await renderSpenders(sub, state, helpers);
    } else {
      await renderPoliticians(sub, state, helpers);
    }
  }

  async function renderSpenders(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading, renderEmpty } = helpers;

    renderLoading(container);

    const spenders = await loadData('ie_spender_summary.csv');
    if (!spenders.length) { renderEmpty(container, 'No spender data available.'); return; }

    const era   = getEra(state);
    const query = (state.query || '').toLowerCase();
    const col   = `total_total_since_${era}`;

    let rows = spenders.filter(r => {
      const matchSearch = !query || (r.spender_name || '').toLowerCase().includes(query);
      return matchSearch && parseFloat(r[col]) > 0;
    }).sort((a, b) => (parseFloat(b[col]) || 0) - (parseFloat(a[col]) || 0));

    const page    = state.page || 0;
    const visible = rows.slice(0, (page + 1) * PAGE_SIZE);
    const hasMore = rows.length > visible.length;

    container.innerHTML = `
      <div class="tn-methodology">
        <strong>About independent expenditures:</strong> Money spent by outside groups
        to support or oppose Tennessee candidates — reported separately from candidate campaigns.
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
                <td class="name-link" data-key="${encodeURIComponent(r.spender_name)}">${r.spender_name}</td>
                <td class="money" style="font-weight:600;">${fmt(r[`total_total_since_${era}`])}</td>
                <td class="money" style="color:var(--tn-green);">${fmt(r[`support_total_since_${era}`])}</td>
                <td class="money" style="color:var(--tn-accent);">${fmt(r[`oppose_total_since_${era}`])}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      ${hasMore ? `<button class="tn-show-more" id="ie-spender-more">
        Show more (${rows.length - visible.length} remaining)
      </button>` : ''}
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
      cell.addEventListener('click', () => {
        navigate({ entity: decodeURIComponent(cell.dataset.key), subview: 'ie-spender' });
      });
    });
    const moreBtn = container.querySelector('#ie-spender-more');
    if (moreBtn) moreBtn.addEventListener('click', () => navigate({ page: (state.page || 0) + 1 }));
  }

  async function renderSpenderProfile(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading } = helpers;

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

    const recipients = pairs
      .filter(r => r.spender_name === key)
      .sort((a, b) => (parseFloat(b[`total_total_since_${era}`]) || 0) - (parseFloat(a[`total_total_since_${era}`]) || 0));

    const donors = spenderDonors
      .filter(r => r.spender_name === key)
      .sort((a, b) => (parseFloat(b.total_since_2012) || 0) - (parseFloat(a.total_since_2012) || 0));

    const raw = rawRecords
      .filter(r => r.spender_name === key)
      .sort((a, b) => (b.year || '').toString().localeCompare((a.year || '').toString()));

    container.innerHTML = `
      <button class="tn-back-btn" id="ie-spender-back">← Back to spenders</button>

      <div class="tn-profile">
        <div class="tn-profile-header">
          <div class="tn-profile-name">${key}</div>
          ${spender && spender.original_name && spender.original_name !== key ? `
            <div class="tn-profile-meta"><span>Filed as: ${spender.original_name}</span></div>
          ` : ''}
        </div>
        <div class="tn-profile-body">

          <div class="tn-era-filters" style="margin-bottom:16px;">
            <span class="tn-era-label">Show spending:</span>
            ${window.TN_ERA_OPTS.map(([y, l]) => `
              <button class="tn-era-btn ${era === y ? 'active' : ''}" data-era="${y}">${l}</button>
            `).join('')}
          </div>

          ${spender ? `
            <div class="tn-profile-stats">
              <div class="tn-stat-box">
                <div class="tn-stat-label">Total IE Spending</div>
                <div class="tn-stat-value accent">${fmtFull(spender[`total_total_since_${era}`])}</div>
              </div>
              <div class="tn-stat-box">
                <div class="tn-stat-label">In Support</div>
                <div class="tn-stat-value" style="color:var(--tn-green);">${fmtFull(spender[`support_total_since_${era}`])}</div>
              </div>
              <div class="tn-stat-box">
                <div class="tn-stat-label">In Opposition</div>
                <div class="tn-stat-value" style="color:var(--tn-accent);">${fmtFull(spender[`oppose_total_since_${era}`])}</div>
              </div>
            </div>
          ` : ''}

          <div class="tn-subnav" style="margin-bottom:16px;">
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
                        <td>${r.politician_display || r.politician_key}</td>
                        <td class="money" style="font-weight:600;">${fmtFull(r[`total_total_since_${era}`])}</td>
                        <td class="money" style="color:var(--tn-green);">${fmtFull(r[`support_total_since_${era}`])}</td>
                        <td class="money" style="color:var(--tn-accent);">${fmtFull(r[`oppose_total_since_${era}`])}</td>
                        <td>
                          <span class="tn-badge ${r.net_stance === 'Support' ? 'tn-badge-dem' : 'tn-badge-rep'}">
                            ${r.net_stance || ''}
                          </span>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            ` : '<p style="color:var(--tn-text-muted);font-size:14px;">No recipient data found.</p>'}
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
                    <th class="num">Since 2012</th>
                    <th class="num">Since 2017</th>
                    <th class="num">Since 2022</th>
                    <th class="num">Donations</th>
                  </tr></thead>
                  <tbody>
                    ${donors.map((d, i) => `
                      <tr>
                        <td class="rank">${i + 1}</td>
                        <td>${d.donor_name}</td>
                        <td class="money" style="font-weight:600;">${fmtFull(d.total_since_2012)}</td>
                        <td class="money">${fmtFull(d.total_since_2017)}</td>
                        <td class="money">${fmtFull(d.total_since_2022)}</td>
                        <td class="money">${parseInt(d.num_donations || 0).toLocaleString()}</td>
                      </tr>
                    `).join('')}
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
                        <td>${r.politician_display || r.politician_key || ''}</td>
                        <td class="money">${fmtFull(r.amount)}</td>
                        <td>
                          <span class="tn-badge ${r.support_or_oppose === 'Support' ? 'tn-badge-dem' : 'tn-badge-rep'}">
                            ${r.support_or_oppose || ''}
                          </span>
                        </td>
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

    container.querySelector('#ie-spender-back').addEventListener('click', () => {
      navigate({ entity: null, subview: 'ie-spenders' });
    });
    container.querySelectorAll('.tn-era-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate({ era: btn.dataset.era }));
    });
    container.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => navigate({ ieTab: btn.dataset.tab }));
    });
  }

  async function renderPoliticians(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading, renderEmpty, partyBadge } = helpers;

    renderLoading(container);

    const pols = await loadData('ie_politician_summary.csv');
    if (!pols.length) { renderEmpty(container, 'No IE politician data available.'); return; }

    const era    = getEra(state);
    const filter = state.polFilter || 'all';
    const query  = (state.query || '').toLowerCase();
    const col    = `total_total_since_${era}`;

    let rows = pols.filter(r => {
      const matchFilter = filter === 'current' ? r.current_elected === 'Yes' : true;
      const matchSearch = !query || (r.politician_display || '').toLowerCase().includes(query);
      return matchFilter && matchSearch && parseFloat(r[col]) > 0;
    }).sort((a, b) => (parseFloat(b[col]) || 0) - (parseFloat(a[col]) || 0));

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

      <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
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
                  ${r.politician_display || r.politician_key}
                </td>
                <td>${partyBadge(r.party)}</td>
                <td class="money" style="font-weight:600;">${fmt(r[`total_total_since_${era}`])}</td>
                <td class="money" style="color:var(--tn-green);">${fmt(r[`support_total_since_${era}`])}</td>
                <td class="money" style="color:var(--tn-accent);">${fmt(r[`oppose_total_since_${era}`])}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      ${hasMore ? `<button class="tn-show-more" id="ie-pol-more">
        Show more (${rows.length - visible.length} remaining)
      </button>` : ''}
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
      cell.addEventListener('click', () => {
        navigate({ entity: decodeURIComponent(cell.dataset.key), subview: 'ie-politician' });
      });
    });
    const moreBtn = container.querySelector('#ie-pol-more');
    if (moreBtn) moreBtn.addEventListener('click', () => navigate({ page: (state.page || 0) + 1 }));
  }

  async function renderPoliticianProfile(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading, partyBadge } = helpers;

    renderLoading(container);

    const [pols, pairs] = await Promise.all([
      loadData('ie_politician_summary.csv'),
      loadData('ie_spender_to_politician.csv'),
    ]);

    const key  = state.entity;
    const pol  = pols.find(r => (r.politician_display || r.politician_key) === key);
    const era  = getEra(state);

    const spenders = pairs
      .filter(r => (r.politician_display || r.politician_key) === key)
      .sort((a, b) => (parseFloat(b[`total_total_since_${era}`]) || 0) - (parseFloat(a[`total_total_since_${era}`]) || 0));

    container.innerHTML = `
      <button class="tn-back-btn" id="ie-pol-back">← Back to politicians</button>

      <div class="tn-profile">
        <div class="tn-profile-header">
          <div class="tn-profile-name">${key}</div>
          ${pol ? `<div class="tn-profile-meta">
            <span>${pol.party || ''}</span>
            ${pol.current_seat ? `<span>${pol.current_seat}</span>` : ''}
          </div>` : ''}
        </div>
        <div class="tn-profile-body">

          <div class="tn-era-filters" style="margin-bottom:16px;">
            <span class="tn-era-label">Show spending:</span>
            ${window.TN_ERA_OPTS.map(([y, l]) => `
              <button class="tn-era-btn ${era === y ? 'active' : ''}" data-era="${y}">${l}</button>
            `).join('')}
          </div>

          ${pol ? `
            <div class="tn-profile-stats">
              <div class="tn-stat-box">
                <div class="tn-stat-label">Total IE Spent On Them</div>
                <div class="tn-stat-value accent">${fmtFull(pol[`total_total_since_${era}`])}</div>
              </div>
              <div class="tn-stat-box">
                <div class="tn-stat-label">Support</div>
                <div class="tn-stat-value" style="color:var(--tn-green);">${fmtFull(pol[`support_total_since_${era}`])}</div>
              </div>
              <div class="tn-stat-box">
                <div class="tn-stat-label">Oppose</div>
                <div class="tn-stat-value" style="color:var(--tn-accent);">${fmtFull(pol[`oppose_total_since_${era}`])}</div>
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
                      <td class="name-link" data-spender="${encodeURIComponent(r.spender_name)}">${r.spender_name}</td>
                      <td class="money" style="font-weight:600;">${fmtFull(r[`total_total_since_${era}`])}</td>
                      <td class="money" style="color:var(--tn-green);">${fmtFull(r[`support_total_since_${era}`])}</td>
                      <td class="money" style="color:var(--tn-accent);">${fmtFull(r[`oppose_total_since_${era}`])}</td>
                      <td>
                        <span class="tn-badge ${r.net_stance === 'Support' ? 'tn-badge-dem' : 'tn-badge-rep'}">
                          ${r.net_stance || ''}
                        </span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<p style="color:var(--tn-text-muted);font-size:14px;">No spender data found.</p>'}
        </div>
      </div>
    `;

    container.querySelector('#ie-pol-back').addEventListener('click', () => {
      navigate({ entity: null, subview: 'ie-politicians' });
    });
    container.querySelectorAll('.tn-era-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate({ era: btn.dataset.era }));
    });
    container.querySelectorAll('.name-link[data-spender]').forEach(cell => {
      cell.addEventListener('click', () => {
        navigate({ entity: decodeURIComponent(cell.dataset.spender), subview: 'ie-spender' });
      });
    });
  }

  return { render };
})();