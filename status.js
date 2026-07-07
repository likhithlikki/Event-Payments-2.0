/**
 * status.js
 * ------------------------------------------------------------------
 * One responsibility: the status.html page. Two independent flows:
 * submit a new complaint (submitComplaint), and check the status of
 * previously submitted ones by phone number (getComplaintStatus).
 * Neither flow requires an account — a guest only ever needs their
 * own phone number, matching the same "no login" model as Donors.
 * ------------------------------------------------------------------
 */

document.addEventListener('DOMContentLoaded', initStatusPage);

async function initStatusPage() {
  try {
    await loadCurrentEvent();
    document.title = `Status · ${CURRENT_EVENT.eventName || 'EventPay'}`;
    renderTopNav('status.html');
    setStatusTab('submit');

    document.getElementById('tabSubmit').addEventListener('click', () => setStatusTab('submit'));
    document.getElementById('tabCheck').addEventListener('click', () => setStatusTab('check'));
    document.getElementById('submitForm').addEventListener('submit', handleSubmitComplaint);
    document.getElementById('checkForm').addEventListener('submit', handleCheckStatus);
  } catch (err) {
    toast(err.message, 'error');
  }
}

function setStatusTab(tab) {
  document.getElementById('tabSubmit').classList.toggle('is-active', tab === 'submit');
  document.getElementById('tabCheck').classList.toggle('is-active', tab === 'check');
  document.getElementById('submitPanel').style.display = tab === 'submit' ? '' : 'none';
  document.getElementById('checkPanel').style.display = tab === 'check' ? '' : 'none';
}

async function handleSubmitComplaint(e) {
  e.preventDefault();
  const name = document.getElementById('cName').value.trim();
  const phone = document.getElementById('cPhone').value.trim();
  const village = document.getElementById('cVillage').value.trim();
  const complaint = document.getElementById('cComplaint').value.trim();

  if (!name) return toast('Enter your name.', 'warning');
  if (!phone) return toast('Enter your phone number.', 'warning');
  if (!complaint) return toast('Describe the issue.', 'warning');

  const btn = document.getElementById('submitComplaintBtn');
  btn.disabled = true;
  btn.textContent = 'Submitting…';
  try {
    const result = await api('submitComplaint', {
      eventCode: CURRENT_EVENT.eventCode, name, phone, village, complaint
    }, 'POST');
    toast(`Submitted. Reference: ${result.complaintId}`, 'success');
    document.getElementById('submitForm').reset();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit';
  }
}

async function handleCheckStatus(e) {
  e.preventDefault();
  const phone = document.getElementById('checkPhone').value.trim();
  if (!phone) return toast('Enter your phone number.', 'warning');

  const btn = document.getElementById('checkStatusBtn');
  btn.disabled = true;
  btn.textContent = 'Checking…';
  try {
    const { complaints } = await api('getComplaintStatus', { eventCode: CURRENT_EVENT.eventCode, phone });
    renderComplaintResults(complaints);
  } catch (err) {
    renderComplaintResults([]);
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check status';
  }
}

function renderComplaintResults(complaints) {
  const list = document.getElementById('complaintResults');
  const empty = document.getElementById('complaintResultsEmpty');
  list.innerHTML = '';

  if (!complaints.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

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
