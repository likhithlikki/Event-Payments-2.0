/**
 * api.js
 * ------------------------------------------------------------------
 * One responsibility: talk to the Apps Script backend. Every page
 * calls api(action, params) — nothing else builds a fetch() call by
 * hand. Always returns the parsed { success, data | error } envelope.
 * ------------------------------------------------------------------
 */

async function api(action, params = {}, method = 'GET') {
  if (!CONFIG.API_URL || CONFIG.API_URL.indexOf('PASTE_') === 0) {
    throw new Error('API_URL is not configured in js/config.js yet.');
  }

  let response;
  if (method === 'GET') {
    const url = new URL(CONFIG.API_URL);
    url.searchParams.set('action', action);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    response = await fetch(url.toString());
  } else {
    response = await fetch(CONFIG.API_URL, {
      method: 'POST',
      body: new URLSearchParams({ action, ...params })
    });
  }

  const json = await response.json();
  if (!json.success) {
    throw new Error(json.error || 'Something went wrong. Please try again.');
  }
  return json.data;
}
