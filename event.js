/**
 * event.js
 * ------------------------------------------------------------------
 * One responsibility: power the index.html search form.
 * Handles tab switching, API call to searchEvent, and navigation.
 * ------------------------------------------------------------------
 */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  // ── Tab state ────────────────────────────────────────────────────
  let activeTab = 'code'; // 'code' | 'name'

  // All DOM queries are inside DOMContentLoaded so elements exist
  const tabCodeBtn   = document.getElementById('tabCode');
  const tabNameBtn   = document.getElementById('tabName');
  const searchLabel  = document.getElementById('searchLabel');
  const searchInput  = document.getElementById('searchInput');
  const searchForm   = document.getElementById('searchForm');
  const resultsList  = document.getElementById('resultsList');

  // Guard: if any required element is missing this script is on the
  // wrong page — bail out silently instead of throwing null errors.
  if (!tabCodeBtn || !searchForm) return;

  // ── Tab switching ────────────────────────────────────────────────
  function setTab(tab) {
    activeTab = tab;

    tabCodeBtn.classList.toggle('is-active', tab === 'code');
    tabNameBtn.classList.toggle('is-active', tab === 'name');

    if (tab === 'code') {
      searchLabel.textContent  = 'EVENT CODE';
      searchInput.placeholder  = 'e.g. WED25001';
      searchInput.autocomplete = 'off';
    } else {
      searchLabel.textContent  = 'EVENT NAME';
      searchInput.placeholder  = 'e.g. Ram & Sita Wedding';
      searchInput.autocomplete = 'off';
    }

    searchInput.value = '';
    resultsList.hidden = true;
    resultsList.innerHTML = '';
    searchInput.focus();
  }

  tabCodeBtn.addEventListener('click', () => setTab('code'));
  tabNameBtn.addEventListener('click', () => setTab('name'));

  // Initialise the first tab
  setTab('code');

  // ── Form submission ──────────────────────────────────────────────
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const query = searchInput.value.trim();
    if (!query) {
      toast('Please enter a search term.', 'error');
      return;
    }

    const btn = document.getElementById('openEventBtn');
    btn.disabled = true;
    btn.textContent = 'Searching…';

    try {
      const params = activeTab === 'code'
        ? { code: query.toUpperCase() }
        : { name: query };

      const data = await api('searchEvent', params);
      const matches = data.matches || [];

      if (matches.length === 0) {
        toast('No event found. Please check the code or name.', 'error');
        return;
      }

      if (matches.length === 1) {
        // Single match — navigate directly
        const code = matches[0].eventCode;
        sessionStorage.setItem(CONFIG.STORAGE_KEY, code);
        window.location.href = 'home.html?event=' + encodeURIComponent(code);
        return;
      }

      // Multiple matches — show a pick list
      showResults(matches);

    } catch (err) {
      toast(err.message || 'Search failed. Please try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Open Event';
    }
  });

  // ── Results list ─────────────────────────────────────────────────
  function showResults(matches) {
    resultsList.innerHTML = '';
    resultsList.hidden = false;

    matches.forEach((match) => {
      const li = document.createElement('li');
      li.className = 'result-item';
      li.innerHTML =
        '<span class="result-item__name">' + escapeHtml(match.eventName) + '</span>' +
        '<span class="result-item__meta">' + escapeHtml(match.eventType) +
        ' &nbsp;·&nbsp; ' + escapeHtml(match.eventCode) + '</span>';

      li.addEventListener('click', () => {
        const code = match.eventCode;
        sessionStorage.setItem(CONFIG.STORAGE_KEY, code);
        window.location.href = 'home.html?event=' + encodeURIComponent(code);
      });

      resultsList.appendChild(li);
    });
  }

});
