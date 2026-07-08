/**
 * admin.js
 * ------------------------------------------------------------------
 * One responsibility: the admin.html dashboard, once logged in.
 * Login itself now lives on admin-login.html — this file only reads
 * the session admin-login.js already stored in sessionStorage and,
 * if it's missing, sends the visitor there. Nine lazily-loaded tabs,
 * each calling exactly one admin* action per load: Dashboard,
 * Payments, Complaints, Gallery, Villages, Analytics, Settings,
 * Admins, Audit Log. Same policy as everywhere else in the app: the
 * session token lives in sessionStorage, never a Spreadsheet ID,
 * clears when the tab closes.
 * ------------------------------------------------------------------
 */

let adminSession = null; // { token, name, role, expiresAt? }
const loadedTabs = new Set();

function slugify_(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, '-');
}

function isSuperAdmin_() {
  return /super/i.test(adminSession && adminSession.role || '');
}

document.addEventListener('DOMContentLoaded', initAdminPage);

async function initAdminPage() {
  try {
    await loadCurrentEvent();
    document.title = `Admin \u00b7 ${CURRENT_EVENT.eventName || 'EventPay'}`;
    renderTopNav('admin.html');

    const stored = sessionStorage.getItem(adminStorageKey_());
    if (!stored) {
      window.location.href = eventLink('admin-login.html');
      return;
    }
    adminSession = JSON.parse(stored);

    document.getElementById('adminLogoutBtn').addEventListener('click', handleAdminLogout);
    document.querySelectorAll('.admin-tab').forEach(btn => {
      btn.addEventListener('click', () => setAdminTab(btn.dataset.tab));
    });

    showDashboard();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function adminStorageKey_() {
  return `eventpay_admin_${CURRENT_EVENT.eventCode}`;
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
  window.location.href = eventLink('admin-login.html');
}

function showDashboard() {
  document.getElementById('adminWelcome').textContent = `${adminSession.name} \u00b7 ${adminSession.role}`;

  if (adminSession.role === 'Viewer') {
    const paymentsTab = document.querySelector('.admin-tab[data-tab="payments"]');
    if (paymentsTab) paymentsTab.hidden = true;
  }
  if (!isSuperAdmin_()) {
    ['settings', 'admins', 'audit'].forEach(tab => {
      const el = document.querySelector(`.admin-tab[data-tab="${tab}"]`);
      if (el) el.hidden = true;
    });
  }

  startSessionClock_();
  setAdminTab('dashboard');
}

/**
 * If adminLogin ever starts returning an expiresAt timestamp, this
 * shows a live countdown and auto-logs-out on expiry. Until then it
 * quietly does nothing — the clock element just stays empty.
 */
function startSessionClock_() {
  const clockEl = document.getElementById('sessionClock');
  if (!adminSession.expiresAt) return;

  function tick() {
    const rem = new Date(adminSession.expiresAt) - Date.now();
    if (rem <= 0) {
      clockEl.textContent = 'Session expired';
      toast('Your session expired. Please log in again.', 'warning');
      handleAdminLogout();
      return;
    }
    const m = Math.floor(rem / 60000);
    const s = Math.floor((rem % 60000) / 1000);
    clockEl.textContent = `Session: ${m}:${String(s).padStart(2, '0')}`;
  }
  tick();
  setInterval(tick, 1000);
}

/**
 * Every admin API call goes through here so an expired token bounces
 * the visitor back to the login page instead of showing a raw error
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
    case 'dashboard': return loadDashboardPanel();
    case 'payments': return loadPaymentsPanel();
    case 'complaints': return loadComplaintsPanel();
    case 'gallery': return loadGalleryPanel();
    case 'villages': return loadVillagesPanel();
    case 'analytics': return loadAnalyticsPanel();
    case 'settings': return loadSettingsPanel();
    case 'admins': return loadAdminsPanel();
    case 'audit': return loadAuditPanel();
  }
}

// ---------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------

async function loadDashboardPanel() {
  const panel = document.getElementById('panel-dashboard');
  panel.innerHTML = '<p class="skeleton">Loading dashboard\u2026</p>';

  const [analytics, complaintsRes, photosRes] = await Promise.all([
    adminApi('adminGetAnalytics'),
    adminApi('adminGetComplaints'),
    adminApi('adminGetPendingPhotos')
  ]);

  const complaints = complaintsRes.complaints || [];
  const photos = photosRes.photos || [];
  const pendingComplaints = complaints.filter(c => c.Status === 'Open').length;
  const goalAmount = Number((CURRENT_EVENT.settings || {})['Goal Amount']) || 0;
  const goalPct = goalAmount > 0 ? Math.min((analytics.TotalAmount / goalAmount) * 100, 100) : null;

  panel.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-card__value">${fmtCurrency(analytics.TotalAmount)}</div>
        <div class="stat-card__label">Total Collected</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value">${goalPct === null ? '\u2014' : Math.round(goalPct) + '%'}</div>
        <div class="stat-card__label">Of Goal</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value stat-card__live">${analytics.TotalPayments}</div>
        <div class="stat-card__label">Payments</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value">${pendingComplaints}</div>
        <div class="stat-card__label">Complaints Pending</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__value">${photos.length}</div>
        <div class="stat-card__label">Photos Awaiting Approval</div>
      </div>
    </div>

    <div class="admin-row" style="margin-top:4px;">
      <div class="admin-row__main"><strong>Quick actions</strong></div>
      <div class="admin-row__actions" id="dashQuickActions">
        <button type="button" class="btn-secondary" data-goto="payments">Export payments</button>
        <button type="button" class="btn-secondary" data-goto="gallery">Review gallery</button>
        <button type="button" class="btn-secondary" data-goto="complaints">Answer complaints</button>
        <a class="btn-secondary" href="${eventLink('home.html')}" target="_blank" rel="noopener">View website</a>
      </div>
    </div>
  `;

  panel.querySelectorAll('[data-goto]').forEach(btn => {
    btn.addEventListener('click', () => setAdminTab(btn.dataset.goto));
  });
}

// ---------------------------------------------------------------
// Complaints
// ---------------------------------------------------------------

async function loadComplaintsPanel() {
  const panel = document.getElementById('panel-complaints');
  panel.innerHTML = '<p class="skeleton">Loading complaints\u2026</p>';
  const { complaints } = await adminApi('adminGetComplaints');

  if (!complaints.length) {
    panel.innerHTML = '<p class="skeleton">No complaints yet.</p>';
    return;
  }

  panel.innerHTML = complaints.map(c => `
    <div class="admin-row" data-id="${escapeHtml(c['Complaint ID'])}">
      <div class="admin-row__main">
        <strong>${escapeHtml(c.Name)}</strong> \u00b7 ${escapeHtml(c.Phone)}
        <span class="status-badge status-badge--${escapeHtml(slugify_(c.Status))}">${escapeHtml(c.Status)}</span>
        <p>${escapeHtml(c.Complaint)}</p>
      </div>
      <div class="admin-row__actions">
        <input type="text" class="reply-input" placeholder="Reply\u2026" value="${escapeHtml(c.Reply || '')}">
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
  panel.innerHTML = '<p class="skeleton">Loading pending photos\u2026</p>';
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
  panel.innerHTML = '<p class="skeleton">Loading villages\u2026</p>';
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
// Settings — event details, feature toggles, theme picker
// ---------------------------------------------------------------

const THEME_OPTIONS = [
  { id: '',                  name: 'Emerald Green',     c1: '#0e332f', c2: '#cda355' },
  { id: 'royal-purple',      name: 'Royal Purple',      c1: '#211139', c2: '#d4af6a' },
  { id: 'traditional-gold',  name: 'Traditional Gold',  c1: '#331a08', c2: '#d9a94a' },
  { id: 'rose-wedding',      name: 'Rose Wedding',      c1: '#391625', c2: '#e0a0a8' },
  { id: 'dark-blue',         name: 'Dark Blue',         c1: '#0b1f30', c2: '#c9b37a' },
  { id: 'classic-maroon',    name: 'Classic Maroon',    c1: '#341019', c2: '#cda355' },
  { id: 'cream-luxury',      name: 'Cream Luxury',      c1: '#efe6d0', c2: '#8a6d3b' }
];

let selectedTheme_ = '';

function loadSettingsPanel() {
  const panel = document.getElementById('panel-settings');
  const settings = CURRENT_EVENT.settings || {};
  selectedTheme_ = settings['Theme'] || '';

  const toggleKeys = Object.keys(settings).filter(k => /^(show|enable|allow)/i.test(k));
  const textKeys = Object.keys(settings).filter(k => !toggleKeys.includes(k) && k !== 'Theme');

  panel.innerHTML = `
    <div class="settings-section" style="margin-bottom:24px;">
      <p class="contribute-card__label">Theme</p>
      <div class="theme-swatch-grid" id="themeGrid">
        ${THEME_OPTIONS.map(t => `
          <button type="button" class="theme-swatch ${t.id === selectedTheme_ ? 'is-selected' : ''}" data-theme-id="${t.id}">
            <div class="theme-swatch__preview" style="background:linear-gradient(135deg, ${t.c1}, ${t.c2});"></div>
            <div class="theme-swatch__name">${t.name}</div>
          </button>
        `).join('')}
      </div>
    </div>

    ${toggleKeys.length ? `
    <div class="settings-section" style="margin-bottom:24px;">
      <p class="contribute-card__label">Feature toggles</p>
      ${toggleKeys.map(key => {
        const enabled = isSettingEnabled(settings, key);
        return `<div class="admin-row" style="justify-content:space-between;">
          <span>${escapeHtml(key)}</span>
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" data-toggle-key="${escapeHtml(key)}" ${enabled ? 'checked' : ''}>
            <span class="toggle-state">${enabled ? 'Active' : 'Off'}</span>
          </label>
        </div>`;
      }).join('')}
    </div>` : ''}

    <div class="settings-section">
      <p class="contribute-card__label">Event details</p>
      <form id="settingsForm">
        ${textKeys.map(key => `
          <div class="field">
            <label for="set-${escapeHtml(key)}">${escapeHtml(key)}</label>
            <input type="text" id="set-${escapeHtml(key)}" data-key="${escapeHtml(key)}" value="${escapeHtml(settings[key])}">
          </div>
        `).join('')}
      </form>
    </div>

    <button type="button" class="btn-primary" id="saveSettingsBtn" style="max-width:220px;">Save settings</button>
  `;

  document.getElementById('themeGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('.theme-swatch');
    if (!btn) return;
    selectedTheme_ = btn.dataset.themeId;
    panel.querySelectorAll('.theme-swatch').forEach(s => s.classList.toggle('is-selected', s === btn));
    document.documentElement.setAttribute('data-theme', selectedTheme_);
  });

  panel.querySelectorAll('[data-toggle-key]').forEach(input => {
    input.addEventListener('change', () => {
      input.nextElementSibling.textContent = input.checked ? 'Active' : 'Off';
    });
  });

  document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
    const updates = { Theme: selectedTheme_ };
    panel.querySelectorAll('[data-key]').forEach(input => { updates[input.dataset.key] = input.value; });
    panel.querySelectorAll('[data-toggle-key]').forEach(input => { updates[input.dataset.toggleKey] = input.checked ? 'TRUE' : 'FALSE'; });

    const btn = document.getElementById('saveSettingsBtn');
    btn.disabled = true;
    btn.textContent = 'Saving\u2026';
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
  panel.innerHTML = '<p class="skeleton">Loading analytics\u2026</p>';
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
  panel.innerHTML = '<p class="skeleton">Loading payments\u2026</p>';
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

// ---------------------------------------------------------------
// Admins (Super Admin only) — requires new backend actions:
// adminGetAdmins, adminAddAdmin, adminUpdateAdminRole, adminRemoveAdmin
// ---------------------------------------------------------------

async function loadAdminsPanel() {
  const panel = document.getElementById('panel-admins');
  panel.innerHTML = '<p class="skeleton">Loading admins\u2026</p>';
  const { admins } = await adminApi('adminGetAdmins');

  const roleOptions = ['Super Admin', 'Manager', 'Editor', 'Viewer'];

  panel.innerHTML = `
    <form id="addAdminForm" class="admin-row" style="gap:8px; flex-wrap:wrap;">
      <input type="text" id="newAdminName" placeholder="Name" style="flex:1; min-width:120px;">
      <input type="text" id="newAdminUsername" placeholder="Username" style="flex:1; min-width:120px;">
      <input type="password" id="newAdminPassword" placeholder="Temporary password" style="flex:1; min-width:140px;">
      <select id="newAdminRole">${roleOptions.map(r => `<option value="${r}">${r}</option>`).join('')}</select>
      <button type="button" class="btn-secondary" id="addAdminBtn">Add admin</button>
    </form>
    <div id="adminList">
      ${(admins || []).map(a => `
        <div class="admin-row" data-username="${escapeHtml(a.Username || a.username || '')}">
          <div class="admin-row__main">
            <strong>${escapeHtml(a.Name || a.name || '')}</strong> \u00b7 ${escapeHtml(a.Username || a.username || '')}
            <span class="status-badge status-badge--${String(a.Status || 'active').toLowerCase()}">${escapeHtml(a.Status || 'Active')}</span>
            <p>Last login: ${a.LastLogin ? timeAgo(a.LastLogin) : 'never'}</p>
          </div>
          <div class="admin-row__actions">
            <select class="role-select">
              ${roleOptions.map(r => `<option value="${r}" ${r === (a.Role || a.role) ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
            <button type="button" class="btn-secondary save-role-btn">Save</button>
            <button type="button" class="btn-secondary remove-admin-btn" style="border-color:var(--accent-2); color:var(--accent-2);">Remove</button>
          </div>
        </div>
      `).join('') || '<p class="skeleton">No other admins yet.</p>'}
    </div>
  `;

  document.getElementById('addAdminBtn').addEventListener('click', async () => {
    const name = document.getElementById('newAdminName').value.trim();
    const username = document.getElementById('newAdminUsername').value.trim();
    const password = document.getElementById('newAdminPassword').value;
    const role = document.getElementById('newAdminRole').value;
    if (!name || !username || !password) return toast('Fill in name, username and password.', 'warning');
    try {
      await adminApi('adminAddAdmin', { name, username, password, role }, 'POST');
      toast('Admin added.', 'success');
      loadedTabs.delete('admins');
      loadAdminsPanel();
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  panel.querySelectorAll('.save-role-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.admin-row');
      const username = row.dataset.username;
      const role = row.querySelector('.role-select').value;
      btn.disabled = true;
      try {
        await adminApi('adminUpdateAdminRole', { username, role }, 'POST');
        toast('Role updated.', 'success');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  });

  panel.querySelectorAll('.remove-admin-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.admin-row');
      const username = row.dataset.username;
      if (!confirm(`Remove admin "${username}"?`)) return;
      try {
        await adminApi('adminRemoveAdmin', { username }, 'POST');
        row.remove();
        toast('Admin removed.', 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

// ---------------------------------------------------------------
// Audit Log (Super Admin only) — requires a new backend action:
// adminGetAuditLog
// ---------------------------------------------------------------

async function loadAuditPanel() {
  const panel = document.getElementById('panel-audit');
  panel.innerHTML = '<p class="skeleton">Loading audit trail\u2026</p>';
  const { logs } = await adminApi('adminGetAuditLog', { limit: 100 });

  if (!logs || !logs.length) {
    panel.innerHTML = '<p class="skeleton">No activity logged yet.</p>';
    return;
  }

  panel.innerHTML = logs.map(l => `
    <div class="admin-row">
      <div class="admin-row__main">
        <strong>${escapeHtml(l.user || l.User || '\u2014')}</strong>
        <span class="status-badge">${escapeHtml(l.module || l.Module || '')}</span>
        <p>
          ${escapeHtml(l.action || l.Action || '')}${l.field ? ' \u00b7 ' + escapeHtml(l.field) : ''}
          ${l.oldValue ? ` \u2014 <span style="text-decoration:line-through; color:var(--accent-2);">${escapeHtml(l.oldValue)}</span>` : ''}
          ${l.newValue ? ` \u2192 <span style="color:var(--success);">${escapeHtml(l.newValue)}</span>` : ''}
        </p>
      </div>
      <div class="admin-row__actions">
        <span class="footnote" style="margin:0;">${escapeHtml(l.timestamp || l.Timestamp || '')}</span>
      </div>
    </div>
  `).join('');
}
