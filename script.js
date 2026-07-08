

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // must match Gallery.gs GALLERY_MAX_BYTES

document.addEventListener('DOMContentLoaded', initGalleryPage);

async function initGalleryPage() {
  try {
    await loadCurrentEvent();
    document.title = `Gallery · ${CURRENT_EVENT.eventName || 'EventPay'}`;
    renderTopNav('gallery.html');
    renderGalleryTitle();
    bindLightbox();
    bindUploadModal();
    await refreshGallery();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderGalleryTitle() {
  const settings = CURRENT_EVENT.settings || {};
  const bride = settings['Bride Name'];
  const groom = settings['Groom Name'];
  if (bride && groom) {
    document.getElementById('galleryTitle').textContent = `${bride} & ${groom}'s gallery`;
  }
}

async function refreshGallery() {
  const data = await api('getGalleryImages', { eventCode: CURRENT_EVENT.eventCode });
  document.getElementById('galleryCount').textContent =
    `${data.count} photo${data.count === 1 ? '' : 's'}`;
  renderGalleryGrid(data.photos);
}

function renderGalleryGrid(photos) {
  const grid = document.getElementById('galleryGrid');
  const empty = document.getElementById('galleryEmpty');
  grid.innerHTML = '';

  if (!photos.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  photos.forEach(photo => {
    const tile = document.createElement('div');
    tile.className = 'gallery-tile';
    tile.innerHTML = `<img src="${escapeHtml(photo.thumbnail)}" alt="${escapeHtml(photo.imageName || '')}" loading="lazy">`;
    tile.addEventListener('click', () => openLightbox(photo));
    grid.appendChild(tile);
  });
}

// ---------------------------------------------------------------
// Lightbox
// ---------------------------------------------------------------

function bindLightbox() {
  document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
  document.getElementById('lightbox').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox') closeLightbox();
  });
}

function openLightbox(photo) {
  document.getElementById('lightboxImg').src = photo.imageUrl;
  document.getElementById('lightboxMeta').textContent =
    `Shared by ${photo.uploadedBy || 'a guest'} · ${timeAgo(photo.uploadTime)}`;
  document.getElementById('lightbox').classList.add('is-open');
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('is-open');
}

// ---------------------------------------------------------------
// Upload modal
// ---------------------------------------------------------------

let selectedFileDataUrl = null;

function bindUploadModal() {
  document.getElementById('openUploadBtn').addEventListener('click', openUploadModal);
  document.getElementById('cancelUploadBtn').addEventListener('click', closeUploadModal);
  document.getElementById('uploadModal').addEventListener('click', (e) => {
    if (e.target.id === 'uploadModal') closeUploadModal();
  });
  document.getElementById('photoFile').addEventListener('change', handleFileSelect);
  document.getElementById('uploadForm').addEventListener('submit', handleUploadSubmit);
}

function openUploadModal() {
  document.getElementById('uploadModal').classList.add('is-open');
}

function closeUploadModal() {
  document.getElementById('uploadModal').classList.remove('is-open');
  document.getElementById('uploadForm').reset();
  document.getElementById('uploadPreview').classList.remove('is-visible');
  selectedFileDataUrl = null;
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > MAX_UPLOAD_BYTES) {
    toast('That photo is too large (max 8MB).', 'warning');
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    selectedFileDataUrl = reader.result;
    const preview = document.getElementById('uploadPreview');
    preview.src = selectedFileDataUrl;
    preview.classList.add('is-visible');
  };
  reader.readAsDataURL(file);
}

async function handleUploadSubmit(e) {
  e.preventDefault();
  const uploaderName = document.getElementById('uploaderName').value.trim();
  const fileInput = document.getElementById('photoFile');

  if (!selectedFileDataUrl) return toast('Choose a photo first.', 'warning');
  if (!uploaderName) return toast('Enter your name.', 'warning');

  setUploadLoading(true);
  try {
    await api('submitPhoto', {
      eventCode: CURRENT_EVENT.eventCode,
      imageBase64: selectedFileDataUrl,
      imageName: fileInput.files[0] ? fileInput.files[0].name : 'photo.jpg',
      uploadedBy: uploaderName
    }, 'POST');

    toast('Thanks! Your photo is awaiting approval.', 'success');
    closeUploadModal();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setUploadLoading(false);
  }
}

function setUploadLoading(isLoading) {
  const btn = document.getElementById('uploadBtn');
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Uploading…' : 'Submit for review';
}


/**
 * support.js
 * ------------------------------------------------------------------
 * One responsibility: render support.html purely from CURRENT_EVENT
 * (Support Phone / Support Email / Footer Text). No extra API call —
 * loadCurrentEvent() already fetched everything this page needs.
 * ------------------------------------------------------------------
 */

document.addEventListener('DOMContentLoaded', initSupportPage);

async function initSupportPage() {
  try {
    await loadCurrentEvent();
    document.title = `Support · ${CURRENT_EVENT.eventName || 'EventPay'}`;
    renderTopNav('support.html');
    renderSupport();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderSupport() {
  const settings = CURRENT_EVENT.settings || {};
  const phone = settings['Support Phone'];
  const email = settings['Support Email'];

  const intro = document.getElementById('supportIntro');
  const links = document.getElementById('supportLinks');
  links.innerHTML = '';

  if (!phone && !email) {
    intro.textContent = 'Ask your host directly for help with anything.';
  } else {
    intro.textContent = 'Reach the organizers directly:';
    if (phone) {
      const a = document.createElement('a');
      a.href = `tel:${phone}`;
      a.className = 'btn-secondary';
      a.textContent = `Call ${phone}`;
      links.appendChild(a);
    }
    if (email) {
      const a = document.createElement('a');
      a.href = `mailto:${email}`;
      a.className = 'btn-secondary';
      a.textContent = `Email ${email}`;
      links.appendChild(a);
    }
  }

  document.getElementById('footerText').textContent = settings['Footer Text'] || '';
}




/**
 * admin-login.js
 * ------------------------------------------------------------------
 * One responsibility: the admin-login.html page. Logs in against
 * THIS event's Admins sheet (adminLogin action, same as before),
 * stores the session in sessionStorage under the same key admin.js
 * reads, then redirects to admin.html. "Remember me" only ever
 * remembers the username locally — never a password or session
 * token — to stay inside the project's sessionStorage-only policy
 * for anything sensitive.
 * ------------------------------------------------------------------
 */

const REMEMBERED_USERNAME_KEY = 'eventpay_admin_remember_username';
let failedLoginAttempts = 0;

document.addEventListener('DOMContentLoaded', initAdminLoginPage);

async function initAdminLoginPage() {
  try {
    await loadCurrentEvent();
    document.title = `Admin Login · ${CURRENT_EVENT.eventName || 'EventPay'}`;
    document.getElementById('loginEventName').textContent = CURRENT_EVENT.eventName || '';

    const backLink = document.getElementById('backToEventLink');
    backLink.innerHTML = `<a href="${eventLink('home.html')}">\u2190 Return to event page</a>`;

    // Already logged in for this event? Skip straight to the dashboard.
    if (sessionStorage.getItem(adminStorageKey_())) {
      window.location.href = eventLink('admin.html');
      return;
    }

    const remembered = localStorage.getItem(REMEMBERED_USERNAME_KEY);
    if (remembered) {
      document.getElementById('adminUsername').value = remembered;
      document.getElementById('rememberMe').checked = true;
      document.getElementById('adminPassword').focus();
    }

    document.getElementById('adminLoginForm').addEventListener('submit', handleAdminLogin);
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
  const remember = document.getElementById('rememberMe').checked;
  if (!username || !password) return toast('Enter your username and password.', 'warning');

  const btn = document.getElementById('adminLoginBtn');
  btn.disabled = true;
  btn.textContent = 'Logging in\u2026';

  try {
    const session = await api('adminLogin', { eventCode: CURRENT_EVENT.eventCode, username, password }, 'POST');
    failedLoginAttempts = 0;
    sessionStorage.setItem(adminStorageKey_(), JSON.stringify(session));

    if (remember) localStorage.setItem(REMEMBERED_USERNAME_KEY, username);
    else localStorage.removeItem(REMEMBERED_USERNAME_KEY);

    window.location.href = eventLink('admin.html');
  } catch (err) {
    failedLoginAttempts++;
    if (failedLoginAttempts >= 5) {
      toast('Too many failed attempts. Please wait 30 seconds before trying again.', 'error');
      btn.textContent = 'Try again in 30s';
      setTimeout(() => {
        btn.disabled = false;
        btn.textContent = 'Log in';
        failedLoginAttempts = 0;
      }, 30000);
      return;
    }
    toast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Log in';
  }
}

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








/**
 * donors.js
 * ------------------------------------------------------------------
 * One responsibility: the donors.html page. Loads the event, renders
 * the goal bar + donor list from getDonors, and drives the
 * contribute flow: createPaymentOrder -> openCheckout (payment.js)
 * -> verifyPayment -> refresh.
 * ------------------------------------------------------------------
 */

let selectedAmount = null;

document.addEventListener('DOMContentLoaded', initDonorsPage);

async function initDonorsPage() {
  try {
    await loadCurrentEvent();
    document.title = `Donors · ${CURRENT_EVENT.eventName || 'EventPay'}`;
    renderTopNav('donors.html');
    renderDonorsTitle();
    renderQuickAmounts();
    document.getElementById('contributeForm').addEventListener('submit', handleContributeSubmit);
    await refreshDonors();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderDonorsTitle() {
  const settings = CURRENT_EVENT.settings || {};
  const bride = settings['Bride Name'];
  const groom = settings['Groom Name'];
  const title = (bride && groom) ? `Bless ${bride} & ${groom}` : `Bless ${CURRENT_EVENT.eventName || 'the celebration'}`;
  document.getElementById('donorsTitle').textContent = title;
}

function renderQuickAmounts() {
  const container = document.getElementById('quickAmounts');
  container.innerHTML = '';
  CONFIG.QUICK_AMOUNTS.forEach(amount => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = fmtCurrency(amount, CURRENT_EVENT.settings && CURRENT_EVENT.settings.Currency);
    chip.addEventListener('click', () => selectAmount(amount, chip));
    container.appendChild(chip);
  });
}

function selectAmount(amount, chipEl) {
  selectedAmount = amount;
  document.getElementById('amountInput').value = amount;
  document.querySelectorAll('#quickAmounts .chip').forEach(c => c.classList.remove('is-selected'));
  chipEl.classList.add('is-selected');
}

async function refreshDonors() {
  const data = await api('getDonors', { eventCode: CURRENT_EVENT.eventCode });
  renderGoalPanel(data);
  renderDonorList(data.donors);
}

function renderGoalPanel(data) {
  const panel = document.getElementById('goalPanel');
  document.getElementById('goalCollected').textContent = fmtCurrency(data.totalCollected, data.currency);
  document.getElementById('goalCount').textContent =
    `${data.donorCount} contribution${data.donorCount === 1 ? '' : 's'} so far`;

  if (data.goalAmount > 0) {
    panel.hidden = false;
    document.getElementById('goalTarget').textContent = `of ${fmtCurrency(data.goalAmount, data.currency)} goal`;
    const pct = Math.min((data.totalCollected / data.goalAmount) * 100, 100);
    document.getElementById('goalBarFill').style.width = pct + '%';
  } else {
    panel.hidden = data.donorCount === 0;
    document.getElementById('goalTarget').textContent = '';
    document.getElementById('goalBarFill').style.width = '0%';
  }
}

function renderDonorList(donors) {
  const list = document.getElementById('donorList');
  const empty = document.getElementById('donorListEmpty');
  list.innerHTML = '';

  if (!donors.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  donors.forEach(d => {
    const li = document.createElement('li');
    li.className = 'donor-card';
    li.innerHTML = `
      <div class="donor-card__row">
        <span class="donor-card__name">${escapeHtml(d.name)}${d.village ? ' · ' + escapeHtml(d.village) : ''}</span>
        <span class="donor-card__amount">${fmtCurrency(d.amount)}</span>
      </div>
      <div class="donor-card__meta">${timeAgo(d.paymentDate)}</div>
      ${d.message ? `<div class="donor-card__message">\u201c${escapeHtml(d.message)}\u201d</div>` : ''}
    `;
    list.appendChild(li);
  });
}

async function handleContributeSubmit(e) {
  e.preventDefault();
  const amount = Number(document.getElementById('amountInput').value);
  const name = document.getElementById('nameInput').value.trim();
  const village = document.getElementById('villageInput').value.trim();
  const phone = document.getElementById('phoneInput').value.trim();
  const message = document.getElementById('messageInput').value.trim();

  if (!amount || amount <= 0) return toast('Enter a valid amount.', 'warning');
  if (!name) return toast('Enter your name.', 'warning');
  if (!phone) return toast('Enter your phone number.', 'warning');

  setContributeLoading(true);
  try {
    const order = await api('createPaymentOrder', {
      eventCode: CURRENT_EVENT.eventCode, amount, name, village, phone, message
    }, 'POST');

    openCheckout(
      order,
      { name, phone, eventName: CURRENT_EVENT.eventName },
      (response) => handleCheckoutSuccess(response),
      (errorMsg) => {
        setContributeLoading(false);
        if (errorMsg) toast(errorMsg, 'error');
      }
    );
  } catch (err) {
    setContributeLoading(false);
    toast(err.message, 'error');
  }
}

async function handleCheckoutSuccess(response) {
  try {
    await api('verifyPayment', {
      eventCode: CURRENT_EVENT.eventCode,
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature
    }, 'POST');

    toast('Thank you for your contribution!', 'success');
    document.getElementById('contributeForm').reset();
    document.querySelectorAll('#quickAmounts .chip').forEach(c => c.classList.remove('is-selected'));
    await refreshDonors();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setContributeLoading(false);
  }
}

function setContributeLoading(isLoading) {
  const btn = document.getElementById('contributeBtn');
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Processing…' : 'Contribute';
}








/**
 * event.js
 * ------------------------------------------------------------------
 * One responsibility: the event search + open flow on index.html.
 * Nothing here runs on any other page. On success it stores only the
 * event code (never a Spreadsheet ID) and redirects to home.html.
 * ------------------------------------------------------------------
 */

const eventSearchState = {
  mode: 'code' // 'code' | 'name'
};

function initEventSearch() {
  const tabCode = document.getElementById('tabCode');
  const tabName = document.getElementById('tabName');
  const form = document.getElementById('searchForm');

  tabCode.addEventListener('click', () => setSearchMode('code'));
  tabName.addEventListener('click', () => setSearchMode('name'));
  form.addEventListener('submit', handleSearchSubmit);

  setSearchMode('code');
}

function setSearchMode(mode) {
  eventSearchState.mode = mode;
  document.getElementById('tabCode').classList.toggle('is-active', mode === 'code');
  document.getElementById('tabName').classList.toggle('is-active', mode === 'name');

  const input = document.getElementById('searchInput');
  const label = document.getElementById('searchLabel');
  input.value = '';
  input.placeholder = mode === 'code' ? 'e.g. WED25001' : 'e.g. Ram & Sita';
  label.textContent = mode === 'code' ? 'Event code' : 'Event name';
  input.focus();
}

async function handleSearchSubmit(e) {
  e.preventDefault();
  const input = document.getElementById('searchInput');
  const query = input.value.trim();
  if (!query) {
    toast('Please enter an event code or name.', 'warning');
    return;
  }

  setLoading(true);
  clearResults();

  try {
    const params = eventSearchState.mode === 'code' ? { code: query } : { name: query };
    const { matches } = await api('searchEvent', params);

    if (matches.length === 1) {
      openEvent(matches[0].eventCode);
      return;
    }
    renderResults(matches);
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setLoading(false);
  }
}

function renderResults(matches) {
  const list = document.getElementById('resultsList');
  list.innerHTML = '';
  list.hidden = false;

  matches.forEach(m => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'result-item';
    item.innerHTML = `
      <span class="result-item__name">${escapeHtml(m.eventName)}</span>
      <span class="result-item__meta">${escapeHtml(m.eventType || '')} · ${escapeHtml(m.eventCode)}</span>
    `;
    item.addEventListener('click', () => openEvent(m.eventCode));
    list.appendChild(item);
  });
}

function clearResults() {
  const list = document.getElementById('resultsList');
  list.innerHTML = '';
  list.hidden = true;
}

function openEvent(eventCode) {
  sessionStorage.setItem(CONFIG.STORAGE_KEY, eventCode);
  window.location.href = `home.html?event=${encodeURIComponent(eventCode)}`;
}

function setLoading(isLoading) {
  const btn = document.getElementById('openEventBtn');
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Searching…' : 'Open Event';
}

document.addEventListener('DOMContentLoaded', initEventSearch);




/**
 * home.js
 * ------------------------------------------------------------------
 * One responsibility: render home.html from CURRENT_EVENT. Calls
 * loadCurrentEvent() once, then builds the nav and hero purely from
 * the Settings object already returned by that single call — no
 * further calls back to MASTER_DB.
 * ------------------------------------------------------------------
 */

let countdownTimer = null;

document.addEventListener('DOMContentLoaded', initHomePage);

async function initHomePage() {
  try {
    await loadCurrentEvent();
    document.title = `${CURRENT_EVENT.eventName || 'EventPay'} · EventPay`;
    renderTopNav('home.html');
    renderHero();
  } catch (err) {
    document.getElementById('homeMain').innerHTML =
      `<p class="skeleton">${escapeHtml(err.message)}</p>`;
    toast(err.message, 'error');
  }
}

function renderHero() {
  const settings = CURRENT_EVENT.settings || {};
  const bride = settings['Bride Name'];
  const groom = settings['Groom Name'];
  const title = (bride && groom) ? `${bride} & ${groom}` : (settings['Event Name'] || CURRENT_EVENT.eventName);
  const venue = settings['Venue'];
  const eventDate = settings['Event Date'];

  const main = document.getElementById('homeMain');
  main.innerHTML = `
    <section class="event-hero">
      <p class="event-hero__eyebrow">${escapeHtml(settings['Event Type'] || CURRENT_EVENT.eventType || 'You\u2019re invited')}</p>
      <h1 class="event-hero__title">${escapeHtml(title)}</h1>
      ${venue ? `<p class="event-hero__meta">${escapeHtml(venue)}</p>` : ''}
      ${eventDate ? `<p class="event-hero__meta">${escapeHtml(fmtDate(eventDate))}</p>` : ''}
    </section>
    <div id="countdownContainer" class="countdown"></div>
    <section class="feature-grid" id="featureGrid"></section>
  `;

  if (eventDate) startCountdown(eventDate, 'countdownContainer');
  renderFeatureGrid();
}

function renderFeatureGrid() {
  const settings = CURRENT_EVENT.settings || {};
  const grid = document.getElementById('featureGrid');
  grid.innerHTML = '';

  NAV_ITEMS
    .filter(item => item.page !== 'home.html' && isSettingEnabled(settings, item.toggle))
    .forEach(item => {
      const a = document.createElement('a');
      a.href = eventLink(item.page);
      a.className = 'feature-card';
      a.innerHTML = `
        <span class="feature-card__icon">${item.icon}</span>
        <span class="feature-card__label">${item.label}</span>
        <span class="feature-card__desc">${item.desc}</span>
      `;
      grid.appendChild(a);
    });
}

function fmtDate(value) {
  const date = new Date(value);
  if (isNaN(date)) return String(value);
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

function startCountdown(targetDate, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  function tick() {
    const diff = new Date(targetDate) - Date.now();
    if (diff <= 0) {
      container.innerHTML = `<p class="event-hero__meta">The celebration has arrived 🎉</p>`;
      clearInterval(countdownTimer);
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    container.innerHTML = [
      [d, 'Days'], [h, 'Hours'], [m, 'Mins'], [s, 'Secs']
    ].map(([val, label]) => `
      <div class="countdown__unit">
        <div class="countdown__num">${String(val).padStart(2, '0')}</div>
        <div class="countdown__label">${label}</div>
      </div>
    `).join('');
  }

  tick();
  countdownTimer = setInterval(tick, 1000);
}


/**
 * invite.js
 * ------------------------------------------------------------------
 * One responsibility: render invite.html purely from CURRENT_EVENT.
 * No new backend action — loadCurrentEvent() (getSettings) already
 * carries everything this page needs: Bride/Groom/Parents names,
 * Event Date, Venue, and an optional Venue Map Link. Nothing here is
 * uploaded or hardcoded; the invitation is generated from Settings
 * the same way home.js builds the hero.
 * ------------------------------------------------------------------
 */

document.addEventListener('DOMContentLoaded', initInvitePage);

async function initInvitePage() {
  try {
    await loadCurrentEvent();
    document.title = `Invitation · ${CURRENT_EVENT.eventName || 'EventPay'}`;
    renderTopNav('invite.html');
    renderInvitation();
    bindShareActions();
  } catch (err) {
    document.getElementById('inviteLoading').textContent = err.message;
    toast(err.message, 'error');
  }
}

function renderInvitation() {
  const settings = CURRENT_EVENT.settings || {};
  const bride = settings['Bride Name'];
  const groom = settings['Groom Name'];
  const brideParents = settings['Bride Parents'];
  const groomParents = settings['Groom Parents'];
  const venue = settings['Venue'];
  const venueAddress = settings['Venue Address'];
  const mapLink = settings['Venue Map Link'];
  const eventDate = settings['Event Date'];

  document.getElementById('inviteEyebrow').textContent =
    settings['Event Type'] || CURRENT_EVENT.eventType || "You're invited";

  document.getElementById('inviteNames').textContent =
    (bride && groom) ? `${bride} & ${groom}` : (CURRENT_EVENT.eventName || 'Join us');

  if (brideParents || groomParents) {
    const parentsEl = document.getElementById('inviteParents');
    parentsEl.hidden = false;
    parentsEl.textContent = [brideParents, groomParents].filter(Boolean).join(' \u00b7 ');
  }

  if (eventDate) {
    const dateEl = document.getElementById('inviteDate');
    dateEl.hidden = false;
    dateEl.textContent = fmtInviteDate(eventDate);
  }

  if (venue || venueAddress) {
    const venueEl = document.getElementById('inviteVenue');
    venueEl.hidden = false;
    venueEl.textContent = [venue, venueAddress].filter(Boolean).join(', ');
  }

  if (mapLink) {
    const mapBtn = document.getElementById('mapBtn');
    mapBtn.hidden = false;
    mapBtn.href = mapLink;

    const mapPanel = document.getElementById('mapPanel');
    mapPanel.hidden = false;
    document.getElementById('mapEmbed').src = toMapEmbedUrl(mapLink, venue || venueAddress);
  }

  if (eventDate) {
    const calBtn = document.getElementById('calendarBtn');
    calBtn.hidden = false;
    calBtn.addEventListener('click', () => downloadCalendarInvite(eventDate, venue || venueAddress));
  }

  const shareUrl = eventShareUrl();
  document.getElementById('qrImage').src =
    `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareUrl)}`;

  document.getElementById('inviteLoading').hidden = true;
  document.getElementById('inviteContent').hidden = false;
}

function fmtInviteDate(value) {
  const date = new Date(value);
  if (isNaN(date)) return String(value);
  const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
  const opts = { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' };
  let out = date.toLocaleDateString('en-IN', opts);
  if (hasTime) out += ` \u00b7 ${date.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  return out;
}

/**
 * Best-effort conversion of a shared Google Maps link into an
 * embeddable URL. Falls back to a text-search embed built from the
 * venue name/address when the link isn't already an /embed URL.
 */
function toMapEmbedUrl(mapLink, fallbackQuery) {
  if (mapLink.includes('/maps/embed')) return mapLink;
  const query = fallbackQuery || mapLink;
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

function eventShareUrl() {
  return `${window.location.origin}${window.location.pathname.replace('invite.html', 'home.html')}?event=${encodeURIComponent(CURRENT_EVENT.eventCode || '')}`;
}

function downloadCalendarInvite(eventDate, location) {
  const start = new Date(eventDate);
  if (isNaN(start)) return toast('No valid date to add.', 'warning');
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000); // default 3-hour block
  const toICSDate = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const title = document.getElementById('inviteNames').textContent || CURRENT_EVENT.eventName || 'Event';
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `DTSTART:${toICSDate(start)}`,
    `DTEND:${toICSDate(end)}`,
    `SUMMARY:${title}`,
    location ? `LOCATION:${location}` : '',
    `URL:${eventShareUrl()}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${CURRENT_EVENT.eventCode || 'event'}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function bindShareActions() {
  const shareUrl = eventShareUrl();
  const title = document.getElementById('inviteNames').textContent || CURRENT_EVENT.eventName || 'EventPay';

  document.getElementById('shareWhatsappBtn').addEventListener('click', () => {
    const msg = `You're invited! ${title}\n${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  });

  document.getElementById('copyLinkBtn').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast('Link copied.', 'success');
    } catch {
      toast('Could not copy the link.', 'error');
    }
  });

  if (navigator.share) {
    const nativeBtn = document.getElementById('nativeShareBtn');
    nativeBtn.hidden = false;
    nativeBtn.addEventListener('click', () => {
      navigator.share({ title, url: shareUrl }).catch(() => {});
    });
  }
}

/**
 * payment.js
 * ------------------------------------------------------------------
 * One responsibility: the Razorpay Checkout popup. Nothing in here
 * knows about donors, forms, or the DOM beyond the checkout modal
 * itself — donors.js (and later pages) call openCheckout() with an
 * order returned by the createPaymentOrder action and get a plain
 * callback with the raw Razorpay response.
 * ------------------------------------------------------------------
 */

let razorpaySdkPromise = null;

function loadRazorpaySdk() {
  if (razorpaySdkPromise) return razorpaySdkPromise;
  razorpaySdkPromise = new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the payment gateway. Check your connection.'));
    document.head.appendChild(script);
  });
  return razorpaySdkPromise;
}

/**
 * Opens the Razorpay checkout modal for an order created via the
 * createPaymentOrder action.
 *
 * order: { razorpayOrderId, amountPaise, currency, keyId }
 * donor: { name, phone, email } — prefills the checkout form
 * onSuccess(response) — response has razorpay_order_id, razorpay_payment_id, razorpay_signature
 * onDismiss() — called if the visitor closes the modal without paying
 */
async function openCheckout(order, donor, onSuccess, onDismiss) {
  await loadRazorpaySdk();

  const rzp = new Razorpay({
    key: order.keyId,
    order_id: order.razorpayOrderId,
    amount: order.amountPaise,
    currency: order.currency || 'INR',
    name: donor.eventName || 'EventPay',
    prefill: {
      name: donor.name || '',
      contact: donor.phone || '',
      email: donor.email || ''
    },
    theme: { color: '#cda355' },
    handler: (response) => onSuccess && onSuccess(response),
    modal: {
      ondismiss: () => onDismiss && onDismiss()
    }
  });

  rzp.on('payment.failed', (resp) => {
    onDismiss && onDismiss(resp.error && resp.error.description);
  });

  rzp.open();
}





/**
 * status.js
 * ------------------------------------------------------------------
 * One responsibility: the status.html page. Two independent flows:
 * submit a new complaint (submitComplaint), and check the status of
 * previously submitted ones by phone number (getComplaintStatus).
 * Neither flow requires an account — a guest only ever needs their
 * own phone number, matching the same "no login" model as Donors.
 * ------------------------------------------------------------------
 */

document.addEventListener('DOMContentLoaded', initStatusPage);

async function initStatusPage() {
  try {
    await loadCurrentEvent();
    document.title = `Status · ${CURRENT_EVENT.eventName || 'EventPay'}`;
    renderTopNav('status.html');
    setStatusTab('submit');

    document.getElementById('tabSubmit').addEventListener('click', () => setStatusTab('submit'));
    document.getElementById('tabCheck').addEventListener('click', () => setStatusTab('check'));
    document.getElementById('submitForm').addEventListener('submit', handleSubmitComplaint);
    document.getElementById('checkForm').addEventListener('submit', handleCheckStatus);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function setStatusTab(tab) {
  document.getElementById('tabSubmit').classList.toggle('is-active', tab === 'submit');
  document.getElementById('tabCheck').classList.toggle('is-active', tab === 'check');
  document.getElementById('submitPanel').style.display = tab === 'submit' ? '' : 'none';
  document.getElementById('checkPanel').style.display = tab === 'check' ? '' : 'none';
}

async function handleSubmitComplaint(e) {
  e.preventDefault();
  const name = document.getElementById('cName').value.trim();
  const phone = document.getElementById('cPhone').value.trim();
  const village = document.getElementById('cVillage').value.trim();
  const complaint = document.getElementById('cComplaint').value.trim();

  if (!name) return toast('Enter your name.', 'warning');
  if (!phone) return toast('Enter your phone number.', 'warning');
  if (!complaint) return toast('Describe the issue.', 'warning');

  const btn = document.getElementById('submitComplaintBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';
  try {
    const result = await api('submitComplaint', {
      eventCode: CURRENT_EVENT.eventCode, name, phone, village, complaint
    }, 'POST');
    toast(`Submitted. Reference: ${result.complaintId}`, 'success');
    document.getElementById('submitForm').reset();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit';
  }
}

async function handleCheckStatus(e) {
  e.preventDefault();
  const phone = document.getElementById('checkPhone').value.trim();
  if (!phone) return toast('Enter your phone number.', 'warning');

  const btn = document.getElementById('checkStatusBtn');
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const { complaints } = await api('getComplaintStatus', { eventCode: CURRENT_EVENT.eventCode, phone });
    renderComplaintResults(complaints);
  } catch (err) {
    renderComplaintResults([]);
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check status';
  }
}

function renderComplaintResults(complaints) {
  const list = document.getElementById('complaintResults');
  const empty = document.getElementById('complaintResultsEmpty');
  list.innerHTML = '';

  if (!complaints.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  complaints.forEach(c => {
    const li = document.createElement('li');
    li.className = 'donor-card';
    li.innerHTML = `
      <div class="donor-card__row">
        <span class="donor-card__name">${escapeHtml(c.complaint)}</span>
        <span class="donor-card__amount">${escapeHtml(c.status)}</span>
      </div>
      <div class="donor-card__meta">Submitted ${timeAgo(c.createdTime)}</div>
      ${c.reply ? `<div class="donor-card__message">Reply: \u201c${escapeHtml(c.reply)}\u201d</div>` : ''}
    `;
    list.appendChild(li);
  });
}





/**
 * support.js
 * ------------------------------------------------------------------
 * One responsibility: render support.html purely from CURRENT_EVENT
 * (Support Phone / Support Email / Footer Text). No extra API call —
 * loadCurrentEvent() already fetched everything this page needs.
 * ------------------------------------------------------------------
 */

document.addEventListener('DOMContentLoaded', initSupportPage);

async function initSupportPage() {
  try {
    await loadCurrentEvent();
    document.title = `Support · ${CURRENT_EVENT.eventName || 'EventPay'}`;
    renderTopNav('support.html');
    renderSupport();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderSupport() {
  const settings = CURRENT_EVENT.settings || {};
  const phone = settings['Support Phone'];
  const email = settings['Support Email'];

  const intro = document.getElementById('supportIntro');
  const links = document.getElementById('supportLinks');
  links.innerHTML = '';

  if (!phone && !email) {
    intro.textContent = 'Ask your host directly for help with anything.';
  } else {
    intro.textContent = 'Reach the organizers directly:';
    if (phone) {
      const a = document.createElement('a');
      a.href = `tel:${phone}`;
      a.className = 'btn-secondary';
      a.textContent = `Call ${phone}`;
      links.appendChild(a);
    }
    if (email) {
      const a = document.createElement('a');
      a.href = `mailto:${email}`;
      a.className = 'btn-secondary';
      a.textContent = `Email ${email}`;
      links.appendChild(a);
    }
  }

  document.getElementById('footerText').textContent = settings['Footer Text'] || '';
}






