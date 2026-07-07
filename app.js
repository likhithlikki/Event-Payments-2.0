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
