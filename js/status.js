/**
 * status.js
 * ------------------------------------------------------------------
 * One responsibility: the status.html page. Two independent flows:
 * submit a new complaint (submitComplaint), and check the status of
 * previously submitted ones by phone number (getComplaintStatus).
 * ------------------------------------------------------------------
 */

document.addEventListener('DOMContentLoaded', initStatusPage);

async function initStatusPage() {
  try {
    await loadCurrentEvent();
    document.title = `Status · ${CURRENT_EVENT.eventName || 'EventPay'}`;
    renderTopNav('status.html');
    setStatusTab('submit');

    const tabSubmit = document.getElementById('tabSubmit');
    const tabCheck = document.getElementById('tabCheck');
    const submitForm = document.getElementById('submitForm');
    const checkForm = document.getElementById('checkForm');

    if (tabSubmit) tabSubmit.addEventListener('click', () => setStatusTab('submit'));
    if (tabCheck) tabCheck.addEventListener('click', () => setStatusTab('check'));
    if (submitForm) submitForm.addEventListener('submit', handleSubmitComplaint);
    if (checkForm) checkForm.addEventListener('submit', handleCheckStatus);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function setStatusTab(tab) {
  const tabSubmit = document.getElementById('tabSubmit');
  const tabCheck = document.getElementById('tabCheck');
  const submitPanel = document.getElementById('submitPanel');
  const checkPanel = document.getElementById('checkPanel');
  if (tabSubmit) tabSubmit.classList.toggle('is-active', tab === 'submit');
  if (tabCheck) tabCheck.classList.toggle('is-active', tab === 'check');
  if (submitPanel) submitPanel.style.display = tab === 'submit' ? '' : 'none';
  if (checkPanel) checkPanel.style.display = tab === 'check' ? '' : 'none';
}

async function handleSubmitComplaint(e) {
  e.preventDefault();
  const name = ((document.getElementById('cName') || {}).value || '').trim();
  const phone = ((document.getElementById('cPhone') || {}).value || '').trim();
  const village = ((document.getElementById('cVillage') || {}).value || '').trim();
  const complaint = ((document.getElementById('cComplaint') || {}).value || '').trim();

  if (!name) return toast('Enter your name.', 'warning');
  if (!phone) return toast('Enter your phone number.', 'warning');
  if (!complaint) return toast('Describe the issue.', 'warning');

  const btn = document.getElementById('submitComplaintBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
  try {
    const result = await api('submitComplaint', {
      eventCode: CURRENT_EVENT.eventCode, name, phone, village, complaint
    }, 'POST');
    toast(`Submitted. Reference: ${result.complaintId}`, 'success');
    const form = document.getElementById('submitForm');
    if (form) form.reset();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Submit'; }
  }
}

async function handleCheckStatus(e) {
  e.preventDefault();
  const phone = ((document.getElementById('checkPhone') || {}).value || '').trim();
  if (!phone) return toast('Enter your phone number.', 'warning');

  const btn = document.getElementById('checkStatusBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }
  try {
    const { complaints } = await api('getComplaintStatus', { eventCode: CURRENT_EVENT.eventCode, phone });
    renderComplaintResults(complaints);
  } catch (err) {
    renderComplaintResults([]);
    toast(err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Check status'; }
  }
}

function renderComplaintResults(complaints) {
  const list = document.getElementById('complaintResults');
  const empty = document.getElementById('complaintResultsEmpty');
  if (!list) return;
  list.innerHTML = '';

  if (!complaints || !complaints.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  complaints.forEach(c => {
    const li = document.createElement('li');
    li.className = 'donor-card';
    li.innerHTML = `
      <div class="donor-card__row">
        <span class="donor-card__name">${escapeHtml(c.complaint)}</span>
        <span class="donor-card__amount">${escapeHtml(c.status)}</span>
      </div>
      <div class="donor-card__meta">Submitted ${timeAgo(c.createdTime)}</div>
      ${c.reply ? `<div class="donor-card__message">Reply: \u201c${escapeHtml(c.reply)}\u201d</div>` : ''}
    `;
    list.appendChild(li);
  });
}
