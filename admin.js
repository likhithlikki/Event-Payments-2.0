/**
 * admin.js
 * ------------------------------------------------------------------
 * One responsibility: the admin.html page. Logs in against THIS
 * event's Admins sheet only (never a global admin list), then drives
 * six lazily-loaded tabs, each calling exactly one admin* action per
 * load: Complaints, Gallery (pending approval), Villages, Settings,
 * Analytics, Payments. The session token lives in sessionStorage —
 * same policy as the event code: never a Spreadsheet ID, clears when
 * the tab closes.
 * ------------------------------------------------------------------
 */

let adminSession = null; // { token, name, role }
const loadedTabs = new Set();

function slugify_(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, '-');
}

document.addEventListener('DOMContentLoaded', initAdminPage);

async function initAdminPage() {
  try {
    await loadCurrentEvent();
    document.title = `Admin · ${CURRENT_EVENT.eventName || 'EventPay'}`;
    renderTopNav('admin.html');

    document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);
    document.getElementById('adminLogoutBtn').addEventListener('click', handleAdminLogout);
    document.querySelectorAll('.admin-tab').forEach(btn => {
      btn.addEventListener('click', () => setAdminTab(btn.dataset.tab));
    });

    const stored = sessionStorage.getItem(adminStorageKey_());
    if (stored) {
      adminSession = JSON.parse(stored);
      showDashboard();
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

function adminStorageKey_() {
  return `eventpay_admin_${CURRENT_EVENT.eventCode}`;
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const username = document.getElementById('adminUsername').value.trim();
  const password = document.getElementById('adminPassword').value;
  if (!username || !password) return toast('Enter your username and password.', 'warning');

  const btn = document.getElementById('adminLoginBtn');
  btn.disabled = true;
  btn.textContent = 'Logging in…';
  try {
    const result = await api('adminLogin', { eventCode: CURRENT_EVENT.eventCode, username, password }, 'POST');
    adminSession = result;
    sessionStorage.setItem(adminStorageKey_(), JSON.stringify(adminSession));
    document.getElementById('adminLoginForm').reset();
    showDashboard();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Log in';
  }
}

async function handleAdminLogout() {
  try {
    if (adminSession) await api('adminLogout', { token: adminSession.token }, 'POST');
  } catch (err) {
    // token may already be expired — proceed with local logout regardless
  }
  adminSession = null;
  loadedTabs.clear();
  sessionStorage.removeItem(adminStorageKey_());
  document.getElementById('adminDashboard').hidden = true;
  document.getElementById('adminLoginCard').hidden = false;
}

function showDashboard() {
  document.getElementById('adminLoginCard').hidden = true;
  document.getElementById('adminDashboard').hidden = false;
  document.getElementById('adminWelcome').textContent = `${adminSession.name} · ${adminSession.role}`;
  if (adminSession.role === 'Viewer') {
    const paymentsTab = document.querySelector('.admin-tab[data-tab="payments"]');
    if (paymentsTab) paymentsTab.hidden = true;
  }
  setAdminTab('complaints');
}

/**
 * Every admin API call goes through here so an expired token bounces
 * the visitor back to the login form instead of showing a raw error
 * on every tab.
 */
async function adminApi(action, params = {}, method = 'GET') {
  try {
    return await api(action, Object.assign({ token: adminSession.token, eventCode: CURRENT_EVENT.eventCode }, params), method);
  } catch (err) {
    if (/session/i.test(err.message)) {
      toast('Your session expired. Please log in again.', 'warning');
      handleAdminLogout();
    }
    throw err;
  }
}

function setAdminTab(tab) {
  document.querySelectorAll('.admin-tab').forEach(btn => btn.classList.toggle('is-active', btn.dataset.tab === tab));
  document.querySelectorAll('.admin-panel').forEach(panel => {
    panel.hidden = panel.id !== `panel-${tab}`;
  });
  if (!loadedTabs.has(tab)) {
    loadedTabs.add(tab);
    loadAdminTab(tab).catch(err => toast(err.message, 'error'));
  }
}

function loadAdminTab(tab) {
  switch (tab) {
    case 'complaints': return loadComplaintsPanel();
    case 'gallery': return loadGalleryPanel();
    case 'villages': return loadVillagesPanel();
    case 'settings': return loadSettingsPanel();
    case 'analytics': return loadAnalyticsPanel();
    case 'payments': return loadPaymentsPanel();
  }
}

// ---------------------------------------------------------------
// Complaints
// ---------------------------------------------------------------

async function loadComplaintsPanel() {
  const panel = document.getElementById('panel-complaints');
  panel.innerHTML = '<p class="skeleton">Loading complaints…</p>';
  const { complaints } = await adminApi('adminGetComplaints');

  if (!complaints.length) {
    panel.innerHTML = '<p class="skeleton">No complaints yet.</p>';
    return;
  }

  panel.innerHTML = complaints.map(c => `
    <div class="admin-row" data-id="${escapeHtml(c['Complaint ID'])}">
      <div class="admin-row__main">
        <strong>${escapeHtml(c.Name)}</strong> · ${escapeHtml(c.Phone)}
        <span class="status-badge status-badge--${escapeHtml(slugify_(c.Status))}">${escapeHtml(c.Status)}</span>
        <p>${escapeHtml(c.Complaint)}</p>
      </div>
      <div class="admin-row__actions">
        <input type="text" class="reply-input" placeholder="Reply…" value="${escapeHtml(c.Reply || '')}">
        <select class="status-select">
          ${['Open', 'In Progress', 'Resolved'].map(s => `<option value="${s}" ${s === c.Status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
        <button type="button" class="btn-secondary save-complaint-btn">Save</button>
      </div>
    </div>
  `).join('');

  panel.querySelectorAll('.save-complaint-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.admin-row');
      const complaintId = row.dataset.id;
      const reply = row.querySelector('.reply-input').value.trim();
      const status = row.querySelector('.status-select').value;
      btn.disabled = true;
      try {
        await adminApi('adminReplyComplaint', { complaintId, reply, status }, 'POST');
        toast('Saved.', 'success');
        loadedTabs.delete('complaints');
        loadComplaintsPanel();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });
}

// ---------------------------------------------------------------
// Gallery moderation
// ---------------------------------------------------------------

async function loadGalleryPanel() {
  const panel = document.getElementById('panel-gallery');
  panel.innerHTML = '<p class="skeleton">Loading pending photos…</p>';
  const { photos } = await adminApi('adminGetPendingPhotos');

  if (!photos.length) {
    panel.innerHTML = '<p class="skeleton">No photos waiting for approval.</p>';
    return;
  }

  panel.innerHTML = `<div class="gallery-grid">${photos.map(p => `
    <div class="gallery-tile" data-id="${escapeHtml(p['Photo ID'])}">
      <img src="${escapeHtml(p['Thumbnail'] || p['Image URL'])}" alt="">
      <div class="admin-row__actions" style="padding:8px;">
        <button type="button" class="btn-secondary approve-btn">Approve</button>
        <button type="button" class="btn-secondary reject-btn">Reject</button>
      </div>
    </div>
  `).join('')}</div>`;

  panel.querySelectorAll('.approve-btn').forEach(btn => {
    btn.addEventListener('click', () => moderatePhoto_(btn, 'adminApprovePhoto'));
  });
  panel.querySelectorAll('.reject-btn').forEach(btn => {
    btn.addEventListener('click', () => moderatePhoto_(btn, 'adminRejectPhoto'));
  });
}

async function moderatePhoto_(btn, action) {
  const tile = btn.closest('.gallery-tile');
  const photoId = tile.dataset.id;
  btn.disabled = true;
  try {
    await adminApi(action, { photoId }, 'POST');
    tile.remove();
  } catch (err) {
    toast(err.message, 'error');
    btn.disabled = false;
  }
}

// ---------------------------------------------------------------
// Villages
// ---------------------------------------------------------------

async function loadVillagesPanel() {
  const panel = document.getElementById('panel-villages');
  panel.innerHTML = '<p class="skeleton">Loading villages…</p>';
  const { villages } = await adminApi('adminGetVillages');

  panel.innerHTML = `
    <form id="addVillageForm" class="admin-row" style="gap:8px;">
      <input type="text" id="newVillageName" placeholder="Add a village name">
      <button type="button" class="btn-secondary" id="addVillageBtn">Add</button>
    </form>
    <div id="villageList">
      ${villages.map(v => `
        <div class="admin-row" data-id="${escapeHtml(v['Village ID'])}">
          <span>${escapeHtml(v['Village Name'])}</span>
          <span class="status-badge status-badge--${String(v.Status).toLowerCase()}">${escapeHtml(v.Status)}</span>
          <button type="button" class="btn-secondary toggle-village-btn">
            ${String(v.Status).toLowerCase() === 'active' ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      `).join('') || '<p class="skeleton">No villages yet.</p>'}
    </div>
  `;

  document.getElementById('addVillageBtn').addEventListener('click', async () => {
    const input = document.getElementById('newVillageName');
    const villageName = input.value.trim();
    if (!villageName) return;
    try {
      await adminApi('adminAddVillage', { villageName }, 'POST');
      input.value = '';
      loadedTabs.delete('villages');
      loadVillagesPanel();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  panel.querySelectorAll('.toggle-village-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.admin-row');
      const villageId = row.dataset.id;
      const isActive = btn.textContent.trim() === 'Deactivate';
      try {
        await adminApi('adminUpdateVillageStatus', { villageId, status: isActive ? 'Inactive' : 'Active' }, 'POST');
        loadedTabs.delete('villages');
        loadVillagesPanel();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

// ---------------------------------------------------------------
// Settings
// ---------------------------------------------------------------

function loadSettingsPanel() {
  const panel = document.getElementById('panel-settings');
  const settings = CURRENT_EVENT.settings || {};
  const keys = Object.keys(settings);

  panel.innerHTML = `
    <form id="settingsForm">
      ${keys.map(key => `
        <div class="field">
          <label for="set-${escapeHtml(key)}">${escapeHtml(key)}</label>
          <input type="text" id="set-${escapeHtml(key)}" data-key="${escapeHtml(key)}" value="${escapeHtml(settings[key])}">
        </div>
      `).join('')}
      <button type="button" class="btn-primary" id="saveSettingsBtn">Save settings</button>
    </form>
  `;

  document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
    const updates = {};
    panel.querySelectorAll('[data-key]').forEach(input => { updates[input.dataset.key] = input.value; });
    const btn = document.getElementById('saveSettingsBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      await adminApi('adminUpdateSettings', { updates: JSON.stringify(updates) }, 'POST');
      await loadCurrentEvent();
      toast('Settings saved.', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save settings';
    }
  });
}

// ---------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------

async function loadAnalyticsPanel() {
  const panel = document.getElementById('panel-analytics');
  panel.innerHTML = '<p class="skeleton">Loading analytics…</p>';
  const data = await adminApi('adminGetAnalytics');

  panel.innerHTML = `
    <div class="feature-grid">
      <div class="feature-card"><span class="feature-card__label">Total Payments</span><span class="feature-card__desc">${data.TotalPayments}</span></div>
      <div class="feature-card"><span class="feature-card__label">Total Amount</span><span class="feature-card__desc">${fmtCurrency(data.TotalAmount)}</span></div>
      <div class="feature-card"><span class="feature-card__label">Average Donation</span><span class="feature-card__desc">${fmtCurrency(data.AverageDonation)}</span></div>
      <div class="feature-card"><span class="feature-card__label">Highest Donation</span><span class="feature-card__desc">${fmtCurrency(data.HighestDonation)}</span></div>
      <div class="feature-card"><span class="feature-card__label">Lowest Donation</span><span class="feature-card__desc">${fmtCurrency(data.LowestDonation)}</span></div>
    </div>
  `;
}

// ---------------------------------------------------------------
// Payments
// ---------------------------------------------------------------

async function loadPaymentsPanel() {
  const panel = document.getElementById('panel-payments');
  if (adminSession.role === 'Viewer') {
    panel.innerHTML = '<p class="skeleton">Your role cannot view payment details.</p>';
    return;
  }
  panel.innerHTML = '<p class="skeleton">Loading payments…</p>';
  const { payments } = await adminApi('adminGetPayments');

  if (!payments.length) {
    panel.innerHTML = '<p class="skeleton">No payments yet.</p>';
    return;
  }

  panel.innerHTML = `
    <button type="button" class="btn-secondary" id="exportCsvBtn" style="margin-bottom:14px;">Export CSV</button>
    <div style="overflow-x:auto;">
      <table class="admin-table">
        <thead><tr>${Object.keys(payments[0]).map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${payments.map(p => `<tr>${Object.values(p).map(v => `<td>${escapeHtml(String(v))}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>
  `;

  document.getElementById('exportCsvBtn').addEventListener('click', () => exportPaymentsCsv_(payments));
}

function exportPaymentsCsv_(payments) {
  const headers = Object.keys(payments[0]);
  const rows = payments.map(p => headers.map(h => `"${String(p[h]).replace(/"/g, '""')}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${CURRENT_EVENT.eventCode || 'payments'}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
