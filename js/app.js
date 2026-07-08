/**
 * app.js
 * ------------------------------------------------------------------
 * One responsibility: the CURRENT_EVENT state object + small shared
 * UI helpers (toast, escaping) used on every page. Every page reads
 * CURRENT_EVENT after calling loadCurrentEvent() — nothing queries
 * MASTER_DB or asks the visitor for their event code more than once
 * per navigation.
 * ------------------------------------------------------------------
 */

// Populated by loadCurrentEvent(). Never holds a Spreadsheet ID —
// only the event code and whatever getSettings() returns.
let CURRENT_EVENT = {
  eventCode: null,
  eventName: null,
  eventType: null,
  status: null,
  settings: null
};

/**
 * Reads the event code from the URL (?event=CODE) first, falling
 * back to sessionStorage, then calls getSettings() to populate
 * CURRENT_EVENT. Every page except index.html should call this on
 * load before rendering anything.
 */
async function loadCurrentEvent() {
  const urlCode = new URLSearchParams(window.location.search).get('event');
  const code = (urlCode || sessionStorage.getItem(CONFIG.STORAGE_KEY) || '').toUpperCase().trim();

  if (!code) {
    window.location.href = 'index.html';
    return null;
  }

  const data = await api('getSettings', { eventCode: code });

  CURRENT_EVENT = {
    eventCode: data.eventCode,
    eventName: data.eventName,
    eventType: data.eventType,
    status: data.status,
    settings: data.settings
  };

  if (CURRENT_EVENT.settings && CURRENT_EVENT.settings['Theme']) {
    document.documentElement.setAttribute('data-theme', CURRENT_EVENT.settings['Theme']);
  }

  sessionStorage.setItem(CONFIG.STORAGE_KEY, CURRENT_EVENT.eventCode);
  return CURRENT_EVENT;
}

/**
 * Builds an href to another page that preserves the current event
 * code, e.g. eventLink('gallery.html') -> 'gallery.html?event=WED25001'.
 */
function eventLink(page) {
  const code = CURRENT_EVENT.eventCode || sessionStorage.getItem(CONFIG.STORAGE_KEY) || '';
  return `${page}?event=${encodeURIComponent(code)}`;
}

/**
 * Minimal toast notification. Expects a <div id="toastContainer"> on the page.
 */
function toast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast--out');
    setTimeout(() => el.remove(), 300);
  }, duration);
}

/**
 * Escapes text before it's ever inserted into innerHTML.
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

/**
 * Formats a number as currency. Defaults to INR since that's the
 * only gateway wired up so far, but takes the event's own Currency
 * setting when available.
 */
function fmtCurrency(amount, currency = 'INR') {
  const symbols = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
  const symbol = symbols[currency] || currency + ' ';
  return symbol + Number(amount || 0).toLocaleString('en-IN');
}

/**
 * Relative time string for donor list timestamps.
 */
function timeAgo(dateValue) {
  const diffMs = Date.now() - new Date(dateValue).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/**
 * The nav items every event page shares. `toggle` names a Settings
 * property that must be truthy for the link to show; null means the
 * link always shows. Defined once here — every page calls
 * renderTopNav() instead of building its own nav.
 */
const NAV_ITEMS = [
  { page: 'home.html',    toggle: null,              icon: '🏠', label: 'Home',    desc: 'Event overview' },
  { page: 'donors.html',  toggle: 'Show Donors',      icon: '🎁', label: 'Donors',  desc: 'See who\u2019s contributed' },
  { page: 'gallery.html', toggle: 'Show Gallery',     icon: '📷', label: 'Gallery', desc: 'Photos from the day' },
  { page: 'invite.html',  toggle: 'Show Invite',      icon: '💌', label: 'Invite',  desc: 'Your invitation' },
  { page: 'status.html',  toggle: 'Show Complaints',  icon: '📋', label: 'Status',  desc: 'Track a request' },
  { page: 'support.html', toggle: null,              icon: '💬', label: 'Support', desc: 'Get help' },
  { page: 'admin.html',   toggle: null,              icon: '🔑', label: 'Admin',   desc: 'Organizer login' }
];

function isSettingEnabled(settings, toggleName) {
  if (!toggleName) return true;
  const val = String((settings || {})[toggleName] || '').trim().toLowerCase();
  return val === '' || val === 'true' || val === 'yes' || val === '1';
}

/**
 * Renders the shared top nav into #topnavLinks, filtered by the
 * current event's Settings toggles, with `activePage` highlighted.
 */
function renderTopNav(activePage) {
  const container = document.getElementById('topnavLinks');
  if (!container) return;
  const settings = CURRENT_EVENT.settings || {};
  container.innerHTML = '';

  NAV_ITEMS.filter(item => isSettingEnabled(settings, item.toggle)).forEach(item => {
    const a = document.createElement('a');
    a.href = eventLink(item.page);
    a.textContent = item.label;
    if (item.page === activePage) a.classList.add('is-active');
    container.appendChild(a);
  });
}
