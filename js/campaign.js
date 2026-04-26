/* ─────────────────────────────────────────────────────────────────────────────
   Tennessee Political Spending Database — campaign.js
   Campaign Contributions module
───────────────────────────────────────────────────────────────────────────── */

window.TNCampaign = (function () {
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

  const PAGE_SIZE = 25;

  function getEra(state) { return state.era || '5yr'; }

  async function render(container, state, helpers) {
    const { navigate } = helpers;

    if (state.entity && state.subview === 'politician') {
      await renderPoliticianProfile(container, state, helpers);
      return;
    }
    if (state.entity && state.subview === 'donors') {
      await renderDonorProfile(container, state, helpers);
      return;
    }

    const subview = state.subview || 'politicians';

    container.innerHTML = `
      <div class="tn-subnav">
        <button class="tn-subnav-btn ${subview === 'politicians' ? 'active' : ''}" data-sub="politicians">Politicians</button>
        <button class="tn-subnav-btn ${subview === 'donors'      ? 'active' : ''}" data-sub="donors">Donors & Organizations</button>
      </div>
      <div id="cf-sub-content"></div>
    `;

    container.querySelectorAll('.tn-subnav-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate({ subview: btn.dataset.sub, entity: null, query: '', page: 0 }));
    });

    const sub = container.querySelector('#cf-sub-content');
    if (subview === 'politicians') {
      await renderPoliticians(sub, state, helpers);
    } else {
      await renderDonors(sub, state, helpers);
    }
  }

  // ── Politicians tab ──────────────────────────────────────────────────────────
  async function renderPoliticians(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading, renderEmpty, partyBadge } = helpers;

    renderLoading(container);

    const [pols, totals] = await Promise.all([
      loadData('cf_politicians.csv'),
      loadData('cf_politician_totals.csv'),
    ]);

    const totalsMap = {};
    totals.forEach(r => { totalsMap[r.politician_key] = r; });

    let rows = pols.map(p => ({ ...p, ...(totalsMap[p.politician_key] || {}) }));

    const era      = getEra(state);
    const filter   = state.polFilter || 'all';
    const query    = (state.query || '').toLowerCase();
    const totalCol = `total_total_${era}`;

    if (filter === 'current') rows = rows.filter(r => r.current_elected === 'Yes');
    if (query) rows = rows.filter(r =>
      flexMatch(r.display_name, query) || flexMatch(r.politician_key, query)
    );

    rows = rows
      .filter(r => parseFloat(r[totalCol]) > 0)
      .sort((a, b) => (parseFloat(b[totalCol]) || 0) - (parseFloat(a[totalCol]) || 0));

    const page    = state.page || 0;
    const visible = rows.slice(0, (page + 1) * PAGE_SIZE);
    const hasMore = rows.length > visible.length;

    container.innerHTML = `
      <div class="tn-era-filters">
        <span class="tn-era-label">Show since:</span>
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
               value="${state.query || ''}" id="cf-pol-search" />
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
            <th>Seat</th>
            <th class="num">Total Raised</th>
            <th class="num">Campaign Acct</th>
            <th class="num">PAC</th>
          </tr></thead>
          <tbody>
            ${visible.map((r, i) => `
              <tr>
                <td class="rank">${i + 1}</td>
                <td class="name-link" data-key="${encodeURIComponent(r.politician_key)}">
                  ${r.display_name || r.politician_key}
                </td>
                <td>${partyBadge(r.party)}</td>
                <td style="font-size:12px;color:var(--tn-text-muted);">${r.current_seat || ''}</td>
                <td class="money" style="font-weight:600;">${fmt(r[`total_total_${era}`] || 0)}</td>
                <td class="money">${fmt(r[`campaign_total_${era}`] || 0)}</td>
                <td class="money">${fmt(r[`pac_total_${era}`] || 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      ${hasMore ? `<button class="tn-show-more" id="cf-pol-more">Show more (${rows.length - visible.length} remaining)</button>` : ''}
    `;

    container.querySelectorAll('.tn-era-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate({ era: btn.dataset.era, page: 0 }));
    });
    container.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => navigate({ polFilter: btn.dataset.filter, page: 0, query: '' }));
    });
    let timer;
    container.querySelector('#cf-pol-search').addEventListener('input', e => {
      clearTimeout(timer);
      timer = setTimeout(() => navigate({ query: e.target.value, page: 0 }), 600);
    });
    container.querySelectorAll('.name-link[data-key]').forEach(cell => {
      cell.addEventListener('click', () => navigate({ entity: decodeURIComponent(cell.dataset.key), subview: 'politician' }));
    });
    const moreBtn = container.querySelector('#cf-pol-more');
    if (moreBtn) moreBtn.addEventListener('click', () => navigate({ page: (state.page || 0) + 1 }));
  }

  // ── Politician profile ───────────────────────────────────────────────────────
  async function renderPoliticianProfile(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading, partyBadge } = helpers;

    renderLoading(container);

    const [pols, totals, topDonors, smallDonors] = await Promise.all([
      loadData('cf_politicians.csv'),
      loadData('cf_politician_totals.csv'),
      loadData('cf_politician_top_donors.csv'),
      loadData('cf_small_donor_summary.csv'),
    ]);

    const key  = state.entity;
    const era  = getEra(state);
    const meta = pols.find(r => r.politician_key === key);
    const tot  = totals.find(r => r.politician_key === key);

    if (!meta) { container.innerHTML = `<div class="tn-empty">Politician not found.</div>`; return; }

    const donorPage = state.donorPage || 0;
    const donors    = topDonors
      .filter(r => r.politician_key === key)
      .sort((a, b) => (parseFloat(b[`total_${era}`]) || 0) - (parseFloat(a[`total_${era}`]) || 0));

    const donorVisible = donors.slice(0, (donorPage + 1) * PAGE_SIZE);
    const donorHasMore = donors.length > donorVisible.length;

    const smallRow = smallDonors.find(r => r.politician_key === key);

    const totalRaised   = parseFloat(tot ? tot[`total_total_${era}`]    : 0);
    const campaignTotal = parseFloat(tot ? tot[`campaign_total_${era}`] : 0);
    const pacTotal      = parseFloat(tot ? tot[`pac_total_${era}`]      : 0);

    container.innerHTML = `
      <button class="tn-back-btn" id="cf-pol-back">← Back to politicians</button>

      <div class="tn-profile">
        <div class="tn-profile-header">
          <div class="tn-profile-name">${meta.display_name || key}</div>
          <div class="tn-profile-meta">
            <span>${meta.party || ''}</span>
            ${meta.current_seat ? `<span>${meta.current_seat}</span>` : ''}
            ${meta.current_elected === 'Yes' ? '<span>✓ Currently Elected</span>' : ''}
          </div>
        </div>
        <div class="tn-profile-body">

          <div class="tn-era-filters" style="margin-bottom:16px;">
            <span class="tn-era-label">Show since:</span>
            ${window.TN_ERA_OPTS.map(([y, l]) => `
              <button class="tn-era-btn ${era === y ? 'active' : ''}" data-era="${y}">${l}</button>
            `).join('')}
          </div>

          <div class="tn-profile-stats">
            <div class="tn-stat-box">
              <div class="tn-stat-label">Total Raised</div>
              <div class="tn-stat-value accent">${fmtFull(totalRaised)}</div>
            </div>
            <div class="tn-stat-box">
              <div class="tn-stat-label">Campaign Account</div>
              <div class="tn-stat-value">${fmtFull(campaignTotal)}</div>
            </div>
            <div class="tn-stat-box">
              <div class="tn-stat-label">PAC Total</div>
              <div class="tn-stat-value">${fmtFull(pacTotal)}</div>
            </div>
          </div>

          ${totalRaised > 0 ? `
            <div style="margin-bottom:20px;">
              <div style="font-size:12px;color:var(--tn-text-muted);margin-bottom:6px;font-family:var(--tn-font-mono);text-transform:uppercase;letter-spacing:0.06em;">Fundraising breakdown</div>
              <div style="display:flex;height:12px;border-radius:6px;overflow:hidden;background:var(--tn-border);">
                <div style="width:${(campaignTotal/totalRaised*100).toFixed(1)}%;background:var(--tn-blue);"></div>
                <div style="width:${(pacTotal/totalRaised*100).toFixed(1)}%;background:var(--tn-accent);"></div>
              </div>
              <div style="display:flex;gap:16px;margin-top:6px;font-size:12px;color:var(--tn-text-muted);">
                <span><span style="display:inline-block;width:10px;height:10px;background:var(--tn-blue);border-radius:2px;margin-right:4px;vertical-align:middle;"></span>Campaign Acct ${campaignTotal > 0 ? (campaignTotal/totalRaised*100).toFixed(0) + '%' : '—'}</span>
                <span><span style="display:inline-block;width:10px;height:10px;background:var(--tn-accent);border-radius:2px;margin-right:4px;vertical-align:middle;"></span>PAC ${pacTotal > 0 ? (pacTotal/totalRaised*100).toFixed(0) + '%' : '—'}</span>
              </div>
            </div>
          ` : ''}

          <h3 class="tn-section-heading">Fundraising by Era</h3>
          <div class="tn-table-wrap" style="margin-bottom:20px;">
            <table class="tn-table">
              <thead><tr>
                <th>Account</th>
                ${window.TN_ERA_OPTS.map(([y, l]) => `<th class="num">${l}</th>`).join('')}
              </tr></thead>
              <tbody>
                <tr>
                  <td>Campaign Account</td>
                  ${window.TN_ERA_OPTS.map(([y]) => `<td class="money">${fmtFull(tot ? tot[`campaign_total_${y}`] : 0)}</td>`).join('')}
                </tr>
                <tr>
                  <td>PAC</td>
                  ${window.TN_ERA_OPTS.map(([y]) => `<td class="money">${fmtFull(tot ? tot[`pac_total_${y}`] : 0)}</td>`).join('')}
                </tr>
                <tr style="font-weight:600;border-top:2px solid var(--tn-border);">
                  <td>Total</td>
                  ${window.TN_ERA_OPTS.map(([y]) => `<td class="money" style="${y === era ? 'color:var(--tn-accent);' : ''}">${fmtFull(tot ? tot[`total_total_${y}`] : 0)}</td>`).join('')}
                </tr>
              </tbody>
            </table>
          </div>

          <h3 class="tn-section-heading">Top Donors (Organizations & PACs)</h3>

          <div class="tn-era-filters" style="margin-bottom:12px;">
            <span class="tn-era-label">Show donations:</span>
            ${window.TN_ERA_OPTS.map(([y, l]) => `
              <button class="tn-era-btn ${era === y ? 'active' : ''}" data-donor-era="${y}">${l}</button>
            `).join('')}
          </div>

          ${donorVisible.length ? `
            <div class="tn-table-wrap" style="margin-bottom:16px;">
              <table class="tn-table">
                <thead><tr>
                  <th style="width:40px;">#</th>
                  <th>Donor</th>
                  <th class="num">Total</th>
                  <th class="num">PAC</th>
                  <th class="num">Campaign Acct</th>
                </tr></thead>
                <tbody>
                  ${donorVisible.map((d, i) => `
                    <tr>
                      <td class="rank">${i + 1}</td>
                      <td class="name-link" data-donor="${encodeURIComponent(d.donor_name)}">${d.donor_name}</td>
                      <td class="money" style="font-weight:600;">${fmtFull(d[`total_${era}`] || 0)}</td>
                      <td class="money">${parseFloat(d[`pac_${era}`]) > 0 ? fmtFull(d[`pac_${era}`]) : '<span style="color:var(--tn-text-light);">—</span>'}</td>
                      <td class="money">${parseFloat(d[`campaign_${era}`]) > 0 ? fmtFull(d[`campaign_${era}`]) : '<span style="color:var(--tn-text-light);">—</span>'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            ${donorHasMore ? `<button class="tn-show-more" id="cf-donor-more">Show more donors (${donors.length - donorVisible.length} remaining)</button>` : ''}
            ${donors.length > PAGE_SIZE ? `<p style="font-size:13px;color:var(--tn-text-muted);">Showing ${donorVisible.length} of ${donors.length} donors</p>` : ''}
          ` : '<p style="color:var(--tn-text-muted);font-size:14px;">No organizational donors found.</p>'}

          ${smallRow ? `
            <div class="tn-methodology">
              <strong>Small donors:</strong> Also raised
              <strong>${fmtFull(smallRow[`total_${era}`] || smallRow.total_15yr || 0)}</strong>
              from <strong>${parseInt(smallRow.num_donors).toLocaleString()}</strong>
              individual donors giving under $100
              (${parseInt(smallRow.num_donations).toLocaleString()} total contributions).
            </div>
          ` : ''}
        </div>
      </div>
    `;

    container.querySelector('#cf-pol-back').addEventListener('click', () => navigate({ entity: null, subview: 'politicians', donorPage: 0 }));
    container.querySelectorAll('.tn-era-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate({ era: btn.dataset.era, donorPage: 0 }));
    });
    container.querySelectorAll('[data-donor-era]').forEach(btn => {
      btn.addEventListener('click', () => navigate({ era: btn.dataset.donorEra, donorPage: 0 }));
    });
    container.querySelectorAll('.name-link[data-donor]').forEach(cell => {
      cell.addEventListener('click', () => navigate({ entity: decodeURIComponent(cell.dataset.donor), subview: 'donors' }));
    });
    const donorMoreBtn = container.querySelector('#cf-donor-more');
    if (donorMoreBtn) donorMoreBtn.addEventListener('click', () => navigate({ donorPage: (state.donorPage || 0) + 1 }));
  }

  // ── Donors tab ───────────────────────────────────────────────────────────────
  async function renderDonors(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading, renderEmpty } = helpers;

    renderLoading(container);

    const donors = await loadData('cf_donor_summary.csv');
    if (!donors.length) { renderEmpty(container, 'No donor data available.'); return; }

    const era   = getEra(state);
    const query = (state.query || '').toLowerCase();
    const col   = `total_${era}`;

    let rows = donors.filter(r => {
     return flexMatch(r.donor_name, query) && parseFloat(r[col]) > 0;
    }).sort((a, b) => (parseFloat(b[col]) || 0) - (parseFloat(a[col]) || 0));

    const page    = state.page || 0;
    const visible = rows.slice(0, (page + 1) * PAGE_SIZE);
    const hasMore = rows.length > visible.length;

    container.innerHTML = `
      <div class="tn-era-filters">
        <span class="tn-era-label">Show since:</span>
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
        <input class="tn-search" type="text" placeholder="Search a company, organization, or PAC..."
               value="${state.query || ''}" id="cf-donor-search" />
      </div>

      <div class="tn-result-count">
        Showing <strong>${visible.length.toLocaleString()}</strong> of
        <strong>${rows.length.toLocaleString()}</strong> donors
      </div>

      <div class="tn-table-wrap">
        <table class="tn-table">
          <thead><tr>
            <th style="width:40px;">#</th>
            <th>Donor / Organization</th>
            ${window.TN_ERA_OPTS.map(([y, l]) => `<th class="num">${l}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${visible.map((r, i) => `
              <tr>
                <td class="rank">${i + 1}</td>
                <td class="name-link" data-key="${encodeURIComponent(r.donor_name)}">${r.donor_name}</td>
                ${window.TN_ERA_OPTS.map(([y]) => `<td class="money">${fmt(r[`total_${y}`] || 0)}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      ${hasMore ? `<button class="tn-show-more" id="cf-donor-more">Show more (${rows.length - visible.length} remaining)</button>` : ''}
    `;

    container.querySelectorAll('.tn-era-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate({ era: btn.dataset.era, page: 0 }));
    });
    let timer;
    container.querySelector('#cf-donor-search').addEventListener('input', e => {
      clearTimeout(timer);
      timer = setTimeout(() => navigate({ query: e.target.value, page: 0 }), 600);
    });
    container.querySelectorAll('.name-link[data-key]').forEach(cell => {
      cell.addEventListener('click', () => navigate({ entity: decodeURIComponent(cell.dataset.key), subview: 'donors' }));
    });
    const moreBtn = container.querySelector('#cf-donor-more');
    if (moreBtn) moreBtn.addEventListener('click', () => navigate({ page: (state.page || 0) + 1 }));
  }

  // ── Donor profile ────────────────────────────────────────────────────────────
  async function renderDonorProfile(container, state, helpers) {
    const { loadData, fmt, fmtFull, navigate, renderLoading } = helpers;

    renderLoading(container);

    const [donors, donorToPol] = await Promise.all([
      loadData('cf_donor_summary.csv'),
      loadData('cf_donor_to_politician.csv'),
    ]);

    const key   = state.entity;
    const donor = donors.find(r => r.donor_name === key);
    const era   = getEra(state);

    const recipients = donorToPol
      .filter(r => r.donor_name === key)
      .sort((a, b) => (parseFloat(b[`total_${era}`]) || 0) - (parseFloat(a[`total_${era}`]) || 0));

    container.innerHTML = `
      <button class="tn-back-btn" id="cf-donor-back">← Back to donors</button>

      <div class="tn-profile">
        <div class="tn-profile-header">
          <div class="tn-profile-name">${key}</div>
          ${donor && donor.politician_reference ? `
            <div class="tn-profile-meta"><span>PAC linked to: ${donor.politician_reference}</span></div>
          ` : ''}
        </div>
        <div class="tn-profile-body">

          <div class="tn-era-filters" style="margin-bottom:16px;">
            <span class="tn-era-label">Show since:</span>
            ${window.TN_ERA_OPTS.map(([y, l]) => `
              <button class="tn-era-btn ${era === y ? 'active' : ''}" data-era="${y}">${l}</button>
            `).join('')}
          </div>

          ${donor ? `
            <div class="tn-profile-stats">
              ${window.TN_ERA_OPTS.map(([y, l]) => `
                <div class="tn-stat-box">
                  <div class="tn-stat-label">${l}</div>
                  <div class="tn-stat-value ${y === era ? 'accent' : ''}">${fmtFull(donor[`total_${y}`] || 0)}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}

          <h3 class="tn-section-heading">Where The Money Went</h3>
          ${recipients.length ? `
            <div class="tn-table-wrap">
              <table class="tn-table">
                <thead><tr>
                  <th style="width:40px;">#</th>
                  <th>Politician</th>
                  <th class="num">Total Given</th>
                </tr></thead>
                <tbody>
                  ${recipients.map((r, i) => `
                    <tr>
                      <td class="rank">${i + 1}</td>
                      <td class="name-link" data-pol="${encodeURIComponent(r.politician_key)}">${r.politician_key}</td>
                      <td class="money">${fmtFull(r[`total_${era}`] || 0)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : '<p style="color:var(--tn-text-muted);font-size:14px;">No recipient data found.</p>'}
        </div>
      </div>
    `;

    container.querySelector('#cf-donor-back').addEventListener('click', () => navigate({ entity: null, subview: 'donors' }));
    container.querySelectorAll('.tn-era-btn').forEach(btn => {
      btn.addEventListener('click', () => navigate({ era: btn.dataset.era }));
    });
    container.querySelectorAll('.name-link[data-pol]').forEach(cell => {
      cell.addEventListener('click', () => navigate({ entity: decodeURIComponent(cell.dataset.pol), subview: 'politician' }));
    });
  }

  return { render };
})();
