// ============================================================
// EventPay 2.0 — Configuration & Shared Utilities
// ============================================================

const EP = {
  // ── Replace with your deployed Apps Script URL ──
  API: "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec",

  // ── Razorpay Key (public) ──
  RAZORPAY_KEY: "rzp_live_YOUR_KEY",

  // ── App Info ──
  APP_NAME: "EventPay",
  APP_VERSION: "2.0",
  TAGLINE: "Beautiful event contribution platform",

  // ── Local Storage Keys ──
  LS: {
    THEME: "ep_theme",
    LAST_EVENT: "ep_last_event",
    ADMIN_TOKEN: "ep_admin_token",
    ADMIN_EXPIRY: "ep_admin_expiry",
    ADMIN_USER: "ep_admin_user",
    ADMIN_ROLE: "ep_admin_role",
  },

  // ── Event Types ──
  EVENT_TYPES: {
    WED: "Wedding",
    BD:  "Birthday",
    TEMP:"Temple",
    HW:  "Housewarming",
    OTH: "Other"
  },

  // ── Quick Amounts ──
  QUICK_AMOUNTS: [101, 251, 501, 1001, 2001, 5001],
};

// ============================================================
// API HELPER
// ============================================================
async function api(action, params = {}, method = "GET") {
  const url = new URL(EP.API);
  url.searchParams.set("action", action);

  if (method === "GET") {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const r = await fetch(url.toString());
    return r.json();
  } else {
    const body = new URLSearchParams({ action, ...params });
    const r = await fetch(EP.API, { method: "POST", body });
    return r.json();
  }
}

// ============================================================
// THEME
// ============================================================
function initTheme() {
  const saved = localStorage.getItem(EP.LS.THEME) || "dark";
  document.documentElement.setAttribute("data-theme", saved);
  updateThemeBtn(saved);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute("data-theme") || "dark";
  const next = cur === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  localStorage.setItem(EP.LS.THEME, next);
  updateThemeBtn(next);
}

function updateThemeBtn(theme) {
  const btn = document.getElementById("themeBtn");
  if (btn) btn.textContent = theme === "dark" ? "☀️" : "🌙";
}

// ============================================================
// TOAST
// ============================================================
function toast(msg, type = "info", duration = 3500) {
  const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  const tc = document.getElementById("toastContainer");
  if (!tc) return;
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type] || ""}</span><span>${msg}</span>`;
  tc.appendChild(el);
  setTimeout(() => { el.classList.add("fade-out"); setTimeout(() => el.remove(), 350); }, duration);
}

// ============================================================
// MOBILE MENU
// ============================================================
function toggleMobileMenu() {
  const m = document.getElementById("mobileMenu");
  if (m) m.classList.toggle("open");
}

// ============================================================
// FORMAT HELPERS
// ============================================================
function fmtINR(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}

function fmtDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date)) return d;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date)) return d;
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function timeAgo(d) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function sanitize(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

// ============================================================
// SCROLL REVEAL
// ============================================================
function initReveal() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); });
  }, { threshold: 0.1 });
  document.querySelectorAll(".reveal").forEach(el => obs.observe(el));
}

// ============================================================
// COUNTDOWN
// ============================================================
function startCountdown(targetDate, containerId) {
  function update() {
    const diff = new Date(targetDate) - Date.now();
    const el = document.getElementById(containerId);
    if (!el || diff <= 0) return;
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.innerHTML = `
      <div class="countdown-unit"><div class="countdown-num">${String(d).padStart(2,"0")}</div><div class="countdown-lbl">Days</div></div>
      <div class="countdown-unit"><div class="countdown-num">${String(h).padStart(2,"0")}</div><div class="countdown-lbl">Hours</div></div>
      <div class="countdown-unit"><div class="countdown-num">${String(m).padStart(2,"0")}</div><div class="countdown-lbl">Mins</div></div>
      <div class="countdown-unit"><div class="countdown-num">${String(s).padStart(2,"0")}</div><div class="countdown-lbl">Secs</div></div>`;
  }
  update();
  return setInterval(update, 1000);
}

// ============================================================
// GOAL PROGRESS
// ============================================================
function renderGoalBar(collected, goal, barId, labelId) {
  const pct = Math.min((collected / goal) * 100, 100).toFixed(1);
  const bar = document.getElementById(barId);
  const lbl = document.getElementById(labelId);
  if (bar) bar.style.width = pct + "%";
  if (lbl) lbl.textContent = pct + "% of " + fmtINR(goal);
}

// ============================================================
// EVENT CODE from URL / localStorage
// ============================================================
function getEventCode() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get("event") || localStorage.getItem(EP.LS.LAST_EVENT);
  return code ? code.toUpperCase().trim() : null;
}

function setEventCode(code) {
  localStorage.setItem(EP.LS.LAST_EVENT, code.toUpperCase().trim());
}

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.add("open"); document.body.style.overflow = "hidden"; }
}
function closeModal(id) {
  const m = document.getElementById(id);
  if (m) { m.classList.remove("open"); document.body.style.overflow = ""; }
}
function closeModalOnBg(e, id) {
  if (e.target === document.getElementById(id)) closeModal(id);
}

// ============================================================
// FAQ ACCORDION
// ============================================================
function initFAQ() {
  document.querySelectorAll(".faq-question").forEach(btn => {
    btn.addEventListener("click", () => {
      const item = btn.closest(".faq-item");
      const isOpen = item.classList.contains("open");
      document.querySelectorAll(".faq-item").forEach(i => i.classList.remove("open"));
      if (!isOpen) item.classList.add("open");
    });
  });
}

// ============================================================
// RAZORPAY
// ============================================================
function initRazorpay(options, onSuccess, onFailure) {
  if (typeof Razorpay === "undefined") {
    toast("Payment gateway not loaded. Please refresh.", "error");
    return;
  }
  const rzp = new Razorpay({
    key: EP.RAZORPAY_KEY,
    currency: "INR",
    theme: { color: "#f5c842" },
    ...options,
    handler: function(response) { onSuccess && onSuccess(response); },
    modal: { ondismiss: function() { onFailure && onFailure("dismissed"); } }
  });
  rzp.on("payment.failed", function(r) { onFailure && onFailure(r.error.description); });
  rzp.open();
}

// ============================================================
// INIT — runs on every page
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initReveal();
  initFAQ();
});

// ============================================================
// ============================================================
//  ADDED — nothing above this line was changed.
//
//  complaint.html / contact.html / privacy.html / index.html all
//  load this same file via <script src="config.js"></script>, but
//  they read from a global `APP_CONFIG` object (APP_CONFIG.SCRIPT_URL,
//  APP_CONFIG.EVENT_NAME, APP_CONFIG.UPI_ID, APP_CONFIG.ORG_NAME,
//  APP_CONFIG.MIN_AMOUNT, APP_CONFIG.MAX_AMOUNT) which didn't exist
//  anywhere yet. Without it those pages can't talk to the backend
//  at all. This block defines it — fill in the values below.
//  (EP.API above is unused by those pages; APP_CONFIG.SCRIPT_URL is
//  the one actually called. Point both at the same deployed Apps
//  Script /exec URL.)
// ============================================================

const APP_CONFIG = {
  // Paste your deployed Google Apps Script Web App URL here.
  // Deploy → New deployment → Web app → Execute as: Me → Who has access: Anyone
  SCRIPT_URL: "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec",

  // Shown in the navbar / page titles before getSettings() responds
  EVENT_NAME: "EventPay",

  // Your organisation / family name, shown on receipts
  ORG_NAME: "EventPay",

  // UPI ID that receives contributions, e.g. "yourname@upi"
  // (only used to build the upi://pay deep link + QR — never logged with donor PII)
  UPI_ID: "yourname@upi",

  // Fallback min/max contribution (₹) shown before getSettings() responds.
  // Real values live in the Settings sheet and override these at runtime.
  MIN_AMOUNT: 50,
  MAX_AMOUNT: 0, // 0 = no maximum

  // Used by manifest.json / sw.js cache versioning
  APP_VERSION: "2.0.0",
};
