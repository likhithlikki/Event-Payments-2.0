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
