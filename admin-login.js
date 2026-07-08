/**
 * admin-login.js
 * ------------------------------------------------------------------
 * One responsibility: the admin-login.html page. Logs in against
 * THIS event's Admins sheet (adminLogin action), stores the session
 * in sessionStorage, then redirects to admin.html.
 * ------------------------------------------------------------------
 */

const REMEMBERED_USERNAME_KEY = 'eventpay_admin_remember_username';
let failedLoginAttempts = 0;

document.addEventListener('DOMContentLoaded', initAdminLoginPage);

async function initAdminLoginPage() {
  try {
    await loadCurrentEvent();
    document.title = `Admin Login · ${CURRENT_EVENT.eventName || 'EventPay'}`;
    const nameEl = document.getElementById('loginEventName');
    if (nameEl) nameEl.textContent = CURRENT_EVENT.eventName || '';

    const backLink = document.getElementById('backToEventLink');
    if (backLink) backLink.innerHTML = `<a href="${eventLink('home.html')}">\u2190 Return to event page</a>`;

    // Already logged in for this event? Skip straight to the dashboard.
    if (sessionStorage.getItem(adminStorageKey_())) {
      window.location.href = eventLink('admin.html');
      return;
    }

    const remembered = localStorage.getItem(REMEMBERED_USERNAME_KEY);
    if (remembered) {
      const usernameEl = document.getElementById('adminUsername');
      const rememberEl = document.getElementById('rememberMe');
      const passwordEl = document.getElementById('adminPassword');
      if (usernameEl) usernameEl.value = remembered;
      if (rememberEl) rememberEl.checked = true;
      if (passwordEl) passwordEl.focus();
    }

    const loginForm = document.getElementById('adminLoginForm');
    if (loginForm) loginForm.addEventListener('submit', handleAdminLogin);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function adminStorageKey_() {
  return `eventpay_admin_${CURRENT_EVENT.eventCode}`;
}

async function handleAdminLogin(e) {
  e.preventDefault();
  const username = ((document.getElementById('adminUsername') || {}).value || '').trim();
  const password = (document.getElementById('adminPassword') || {}).value || '';
  const remember = (document.getElementById('rememberMe') || {}).checked || false;
  if (!username || !password) return toast('Enter your username and password.', 'warning');

  const btn = document.getElementById('adminLoginBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Logging in\u2026'; }

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
      if (btn) btn.textContent = 'Try again in 30s';
      setTimeout(() => {
        if (btn) { btn.disabled = false; btn.textContent = 'Log in'; }
        failedLoginAttempts = 0;
      }, 30000);
      return;
    }
    toast(err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Log in'; }
  }
}
