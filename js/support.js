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
