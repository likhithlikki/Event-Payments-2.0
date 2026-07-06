// ════════════════════════════════════════════════════════════
// EventPay 2.0 — Admin Dashboard Logic (admin.js)
// Loaded by admin.html. Requires config.js (APP_CONFIG) to be loaded first.
// ════════════════════════════════════════════════════════════

let ADMIN = {
  token: localStorage.getItem("ep_admin_token"),
  user: localStorage.getItem("ep_admin_user"),
  role: localStorage.getItem("ep_admin_role"),
  access: localStorage.getItem("ep_admin_access"),
  scope: localStorage.getItem("ep_admin_scope"),
  eventCode: localStorage.getItem("ep_admin_event") || "",
  expiry: localStorage.getItem("ep_admin_expiry"),
  editorMode: false
};

// ── Guard: redirect to login if no valid session ──
(function guard(){
  if (!ADMIN.token || !ADMIN.expiry || new Date(ADMIN.expiry) < new Date()) {
    window.location.href = "admin-login.html";
  }
})();

document.getElementById("welcomeMsg").textContent = "Hi, " + (ADMIN.user || "Admin");
document.getElementById("roleBadge").textContent = (ADMIN.role || "viewer").toUpperCase() +
  (ADMIN.eventCode ? " · " + ADMIN.eventCode : " · Platform");

// Viewer-role accounts never get an Editor Mode option — read only.
if (ADMIN.role === "viewer" || ADMIN.access === "view_only") {
  document.getElementById("editorToggle").style.display = "none";
}

// ── API helper — always includes adminToken/eventCode ──
function adminApi(action, extra = {}) {
  const params = new URLSearchParams({
    action,
    adminToken: ADMIN.token,
    adminUser: ADMIN.user,
    adminExpiry: ADMIN.expiry,
    eventCode: ADMIN.eventCode,
    ...extra
  });
  return fetch(APP_CONFIG.SCRIPT_URL, { method: "POST", body: params }).then(r => r.json());
}

function logout() {
  localStorage.removeItem("ep_admin_token");
  localStorage.removeItem("ep_admin_expiry");
  localStorage.removeItem("ep_admin_user");
  localStorage.removeItem("ep_admin_role");
  localStorage.removeItem("ep_admin_access");
  localStorage.removeItem("ep_admin_scope");
  localStorage.removeItem("ep_admin_event");
  window.location.href = "admin-login.html";
}

function toast(msg, type = "info") {
  const tc = document.getElementById("toastContainer");
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  tc.appendChild(t);
  setTimeout(() => { t.classList.add("fade-out"); setTimeout(() => t.remove(), 300); }, 3200);
}

// ── EDITOR MODE — required confirmation, matches "Mode 2" spec ──
function toggleEditorMode() {
  if (!ADMIN.editorMode) {
    if (!confirm("Enable Editor Mode? Every change you make will require a reason and will be logged to the Audit Log.")) return;
    ADMIN.editorMode = true;
    const btn = document.getElementById("editorToggle");
    btn.textContent = "✏️ Editor Mode ON";
    btn.classList.add("on");
    toast("Editor Mode enabled — changes are now logged", "warning");
  } else {
    ADMIN.editorMode = false;
    const btn = document.getElementById("editorToggle");
    btn.textContent = "🔒 View Mode";
    btn.classList.remove("on");
    toast("Back to View Mode", "info");
  }
}

function requireReason(promptText) {
  const reason = prompt(promptText || "Reason for this change (required):");
  if (!reason || !reason.trim()) { toast("A reason is required — change cancelled", "error"); return null; }
  return reason.trim();
}

// ── PANEL SWITCHING ──
function showPanel(name) {
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".side-item[data-panel]").forEach(s => s.classList.remove("active"));
  document.getElementById("panel-" + name).classList.add("active");
  const item = document.querySelector('.side-item[data-panel="' + name + '"]');
  if (item) item.classList.add("active");

  if (name === "payments") loadPayments();
  if (name === "complaints") loadComplaints();
  if (name === "villages") loadVillages();
  if (name === "settings") loadSettings();
  if (name === "audit") loadAudit();
}

// ── OVERVIEW STATS ──
function loadOverview() {
  adminApi("getDashboardOverview").then(res => {
    if (res.error) { toast(res.error, "error"); return; }
    const grid = document.getElementById("statGrid");
    grid.innerHTML = `
      <div class="stat-box"><div class="lbl">Total Collected</div><div class="val">₹${Number(res.totalCollected||0).toLocaleString("en-IN")}</div></div>
      <div class="stat-box"><div class="lbl">Paid Contributions</div><div class="val">${res.paidCount||0}</div></div>
      <div class="stat-box"><div class="lbl">Pending Payments</div><div class="val">${res.pendingPayments||0}</div></div>
      <div class="stat-box"><div class="lbl">Open Complaints</div><div class="val">${res.openComplaints||0}</div></div>
      <div class="stat-box"><div class="lbl">Villages to Review</div><div class="val">${res.pendingVillages||0}</div></div>
    `;
  });
}

// ── PAYMENTS ──
function loadPayments() {
  const el = document.getElementById("paymentsTable");
  el.textContent = "Loading...";
  adminApi("getPayments").then(res => {
    if (res.error) { el.textContent = res.error; return; }
    const rows = res.payments || [];
    if (!rows.length) { el.innerHTML = "<p style='font-size:13px;color:var(--text-muted)'>No payments yet.</p>"; return; }
    el.innerHTML = `<table class="data-table"><thead><tr>
      <th>Name</th><th>Village</th><th>Phone</th><th>Amount</th><th>Status</th><th>Date</th>
    </tr></thead><tbody>${rows.map(r => `
      <tr><td>${r.Name||""}</td><td>${r.Village||""}</td><td>${r.Phone||""}</td>
      <td>₹${Number(r.Amount||0).toLocaleString("en-IN")}</td>
      <td><span class="pill ${String(r.PaymentStatus||"").toLowerCase()==="paid"?"approved":"pending"}">${r.PaymentStatus||""}</span></td>
      <td>${r.PaymentDate||""}</td></tr>`).join("")}</tbody></table>`;
  });
}

// ── COMPLAINTS ──
function loadComplaints() {
  const el = document.getElementById("complaintsTable");
  el.textContent = "Loading...";
  adminApi("getComplaints").then(res => {
    if (res.error) { el.textContent = res.error; return; }
    const rows = res.complaints || [];
    if (!rows.length) { el.innerHTML = "<p style='font-size:13px;color:var(--text-muted)'>No complaints yet.</p>"; return; }
    el.innerHTML = `<table class="data-table"><thead><tr>
      <th>Name</th><th>Village</th><th>Complaint</th><th>Status</th><th>Actions</th>
    </tr></thead><tbody>${rows.map(r => `
      <tr><td>${r.Name||""}</td><td>${r.Village||""}</td>
      <td style="max-width:280px">${(r.Complaint||"").slice(0,120)}</td>
      <td><span class="pill ${String(r.Status||"").toLowerCase()==="resolved"?"approved":"pending"}">${r.Status||"Open"}</span></td>
      <td>
        <button class="small-btn" onclick="resolveComplaint(${r._row})">Resolve</button>
      </td></tr>`).join("")}</tbody></table>`;
  });
}

function resolveComplaint(row) {
  if (ADMIN.editorMode !== true) { toast("Enable Editor Mode to make changes", "warning"); return; }
  const reason = requireReason("Reason for resolving this complaint:");
  if (!reason) return;
  adminApi("updateComplaint", { row, status: "Resolved", reason }).then(res => {
    if (res.error) toast(res.error, "error");
    else { toast("Complaint resolved", "success"); loadComplaints(); }
  });
}

// ── VILLAGES ──
function loadVillages() {
  const el = document.getElementById("villagesList");
  el.textContent = "Loading...";
  adminApi("getVillagesForReview").then(res => {
    if (res.error) { el.textContent = res.error; return; }
    const rows = res.villages || [];
    if (!rows.length) { el.innerHTML = "<p style='font-size:13px;color:var(--text-muted)'>No villages recorded yet.</p>"; return; }
    el.innerHTML = rows.map(v => `
      <div class="village-row">
        <div><strong>${v.village}</strong> <span style="color:var(--text-dim);font-size:11px">(${v.count} contribution${v.count==1?"":"s"})</span></div>
        <div style="display:flex;gap:6px;align-items:center">
          <span class="pill ${String(v.status).toLowerCase()}">${v.status}</span>
          <button class="small-btn" onclick="approveVillageRow(${v._row})">Approve</button>
          <button class="small-btn" onclick="mergeVillageRow(${v._row})">Merge into...</button>
          <button class="small-btn" onclick="rejectVillageRow(${v._row})">Reject</button>
        </div>
      </div>`).join("");
  });
}

function approveVillageRow(row) {
  if (!ADMIN.editorMode) { toast("Enable Editor Mode to make changes", "warning"); return; }
  const reason = requireReason("Reason for approving this village:");
  if (!reason) return;
  adminApi("approveVillage", { row, status: "Approved", reason }).then(res => {
    if (res.error) toast(res.error, "error"); else { toast("Village approved", "success"); loadVillages(); }
  });
}
function rejectVillageRow(row) {
  if (!ADMIN.editorMode) { toast("Enable Editor Mode to make changes", "warning"); return; }
  const reason = requireReason("Reason for rejecting this village entry:");
  if (!reason) return;
  adminApi("approveVillage", { row, status: "Rejected", reason }).then(res => {
    if (res.error) toast(res.error, "error"); else { toast("Village rejected", "success"); loadVillages(); }
  });
}
function mergeVillageRow(row) {
  if (!ADMIN.editorMode) { toast("Enable Editor Mode to make changes", "warning"); return; }
  const mergeInto = prompt("Merge this spelling into which existing village name? (type the correct spelling exactly)");
  if (!mergeInto || !mergeInto.trim()) return;
  const reason = requireReason("Reason for this merge:");
  if (!reason) return;
  adminApi("renameVillage", { row, mergeInto: mergeInto.trim(), reason }).then(res => {
    if (res.error) toast(res.error, "error"); else { toast("Merged — past records updated too", "success"); loadVillages(); }
  });
}

// ── SETTINGS ──
const SETTINGS_FIELDS = [
  ["EventName","Event Name"], ["BrideName","Bride Name"], ["GroomName","Groom Name"],
  ["Venue","Venue"], ["GoogleMapsLink","Google Maps Link"], ["EventDate","Event Date"],
  ["GoalAmount","Goal Amount (₹)"], ["MIN_AMOUNT","Minimum Contribution (₹)"], ["MAX_AMOUNT","Maximum Contribution (₹, 0 = no max)"]
];

function loadSettings() {
  const el = document.getElementById("settingsForm");
  el.textContent = "Loading...";
  adminApi("getSettings").then(s => {
    if (s.error) { el.textContent = s.error; return; }
    el.innerHTML = SETTINGS_FIELDS.map(([key,label]) => `
      <div class="form-group" style="margin-bottom:12px">
        <label class="form-label">${label}</label>
        <div style="display:flex;gap:8px">
          <input class="form-input" id="set_${key}" value="${(s[key]!==undefined?s[key]:"")}">
          <button class="small-btn" onclick="saveSetting('${key}')">Save</button>
        </div>
      </div>`).join("");
  });
}

function saveSetting(key) {
  if (!ADMIN.editorMode) { toast("Enable Editor Mode to make changes", "warning"); return; }
  const value = document.getElementById("set_" + key).value;
  const reason = requireReason("Reason for changing " + key + ":");
  if (!reason) return;
  adminApi("updateSettings", { field: key, value, reason }).then(res => {
    if (res.error) toast(res.error, "error"); else toast(key + " updated", "success");
  });
}

// ── AUDIT LOG ──
function loadAudit() {
  const el = document.getElementById("auditTable");
  el.textContent = "Loading...";
  adminApi("getAuditLog").then(res => {
    if (res.error) { el.textContent = res.error; return; }
    const rows = res.log || [];
    if (!rows.length) { el.innerHTML = "<p style='font-size:13px;color:var(--text-muted)'>No audit entries yet.</p>"; return; }
    el.innerHTML = `<table class="data-table"><thead><tr>
      <th>Time</th><th>Admin</th><th>Action</th><th>Field</th><th>Old</th><th>New</th><th>Reason</th>
    </tr></thead><tbody>${rows.map(r => `
      <tr><td>${r.Timestamp||""}</td><td>${r.Admin||""}</td><td>${r.Action||""}</td>
      <td>${r.Field||""}</td><td>${r["Old Value"]!==undefined?r["Old Value"]:(r.OldValue||"")}</td>
      <td>${r["New Value"]!==undefined?r["New Value"]:(r.NewValue||"")}</td><td>${r.Reason||""}</td></tr>`).join("")}</tbody></table>`;
  });
}

// ── INIT ──
loadOverview();
