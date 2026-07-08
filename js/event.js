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
