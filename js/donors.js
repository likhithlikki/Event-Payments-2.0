/**
 * donors.js
 * ------------------------------------------------------------------
 * One responsibility: the donors.html page. Loads the event, renders
 * the goal bar + donor list from getDonors, and drives the
 * contribute flow: createPaymentOrder -> openCheckout (via Razorpay)
 * -> verifyPayment -> refresh.
 * ------------------------------------------------------------------
 */

let selectedAmount = null;
let razorpaySdkPromise = null;

document.addEventListener('DOMContentLoaded', initDonorsPage);

async function initDonorsPage() {
  try {
    await loadCurrentEvent();
    document.title = `Donors · ${CURRENT_EVENT.eventName || 'EventPay'}`;
    renderTopNav('donors.html');
    renderDonorsTitle();
    renderQuickAmounts();
    const form = document.getElementById('contributeForm');
    if (form) form.addEventListener('submit', handleContributeSubmit);
    await refreshDonors();
  } catch (err) {
    toast(err.message, 'error');
  }
}

function renderDonorsTitle() {
  const settings = CURRENT_EVENT.settings || {};
  const bride = settings['Bride Name'];
  const groom = settings['Groom Name'];
  const title = (bride && groom) ? `Bless ${bride} & ${groom}` : `Bless ${CURRENT_EVENT.eventName || 'the celebration'}`;
  const el = document.getElementById('donorsTitle');
  if (el) el.textContent = title;
}

function renderQuickAmounts() {
  const container = document.getElementById('quickAmounts');
  if (!container) return;
  container.innerHTML = '';
  CONFIG.QUICK_AMOUNTS.forEach(amount => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'chip';
    chip.textContent = fmtCurrency(amount, CURRENT_EVENT.settings && CURRENT_EVENT.settings.Currency);
    chip.addEventListener('click', () => selectAmount(amount, chip));
    container.appendChild(chip);
  });
}

function selectAmount(amount, chipEl) {
  selectedAmount = amount;
  const input = document.getElementById('amountInput');
  if (input) input.value = amount;
  document.querySelectorAll('#quickAmounts .chip').forEach(c => c.classList.remove('is-selected'));
  chipEl.classList.add('is-selected');
}

async function refreshDonors() {
  const data = await api('getDonors', { eventCode: CURRENT_EVENT.eventCode });
  renderGoalPanel(data);
  renderDonorList(data.donors);
}

function renderGoalPanel(data) {
  const panel = document.getElementById('goalPanel');
  const collected = document.getElementById('goalCollected');
  const count = document.getElementById('goalCount');
  if (collected) collected.textContent = fmtCurrency(data.totalCollected, data.currency);
  if (count) count.textContent = `${data.donorCount} contribution${data.donorCount === 1 ? '' : 's'} so far`;

  if (panel) {
    if (data.goalAmount > 0) {
      panel.hidden = false;
      const target = document.getElementById('goalTarget');
      const fill = document.getElementById('goalBarFill');
      if (target) target.textContent = `of ${fmtCurrency(data.goalAmount, data.currency)} goal`;
      const pct = Math.min((data.totalCollected / data.goalAmount) * 100, 100);
      if (fill) fill.style.width = pct + '%';
    } else {
      panel.hidden = data.donorCount === 0;
      const target = document.getElementById('goalTarget');
      const fill = document.getElementById('goalBarFill');
      if (target) target.textContent = '';
      if (fill) fill.style.width = '0%';
    }
  }
}

function renderDonorList(donors) {
  const list = document.getElementById('donorList');
  const empty = document.getElementById('donorListEmpty');
  if (!list) return;
  list.innerHTML = '';

  if (!donors || !donors.length) {
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  donors.forEach(d => {
    const li = document.createElement('li');
    li.className = 'donor-card';
    li.innerHTML = `
      <div class="donor-card__row">
        <span class="donor-card__name">${escapeHtml(d.name)}${d.village ? ' · ' + escapeHtml(d.village) : ''}</span>
        <span class="donor-card__amount">${fmtCurrency(d.amount)}</span>
      </div>
      <div class="donor-card__meta">${timeAgo(d.paymentDate)}</div>
      ${d.message ? `<div class="donor-card__message">\u201c${escapeHtml(d.message)}\u201d</div>` : ''}
    `;
    list.appendChild(li);
  });
}

async function handleContributeSubmit(e) {
  e.preventDefault();
  const amount = Number((document.getElementById('amountInput') || {}).value);
  const name = ((document.getElementById('nameInput') || {}).value || '').trim();
  const village = ((document.getElementById('villageInput') || {}).value || '').trim();
  const phone = ((document.getElementById('phoneInput') || {}).value || '').trim();
  const message = ((document.getElementById('messageInput') || {}).value || '').trim();

  if (!amount || amount <= 0) return toast('Enter a valid amount.', 'warning');
  if (!name) return toast('Enter your name.', 'warning');
  if (!phone) return toast('Enter your phone number.', 'warning');

  setContributeLoading(true);
  try {
    const order = await api('createPaymentOrder', {
      eventCode: CURRENT_EVENT.eventCode, amount, name, village, phone, message
    }, 'POST');

    openCheckout(
      order,
      { name, phone, eventName: CURRENT_EVENT.eventName },
      (response) => handleCheckoutSuccess(response),
      (errorMsg) => {
        setContributeLoading(false);
        if (errorMsg) toast(errorMsg, 'error');
      }
    );
  } catch (err) {
    setContributeLoading(false);
    toast(err.message, 'error');
  }
}

async function handleCheckoutSuccess(response) {
  try {
    await api('verifyPayment', {
      eventCode: CURRENT_EVENT.eventCode,
      razorpay_order_id: response.razorpay_order_id,
      razorpay_payment_id: response.razorpay_payment_id,
      razorpay_signature: response.razorpay_signature
    }, 'POST');

    toast('Thank you for your contribution!', 'success');
    const form = document.getElementById('contributeForm');
    if (form) form.reset();
    document.querySelectorAll('#quickAmounts .chip').forEach(c => c.classList.remove('is-selected'));
    await refreshDonors();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setContributeLoading(false);
  }
}

function setContributeLoading(isLoading) {
  const btn = document.getElementById('contributeBtn');
  if (!btn) return;
  btn.disabled = isLoading;
  btn.textContent = isLoading ? 'Processing…' : 'Contribute';
}

// ---------------------------------------------------------------
// Razorpay checkout helper
// ---------------------------------------------------------------

function loadRazorpaySdk() {
  if (razorpaySdkPromise) return razorpaySdkPromise;
  razorpaySdkPromise = new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve();
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the payment gateway. Check your connection.'));
    document.head.appendChild(script);
  });
  return razorpaySdkPromise;
}

async function openCheckout(order, donor, onSuccess, onDismiss) {
  await loadRazorpaySdk();

  const rzp = new Razorpay({
    key: order.keyId,
    order_id: order.razorpayOrderId,
    amount: order.amountPaise,
    currency: order.currency || 'INR',
    name: donor.eventName || 'EventPay',
    prefill: {
      name: donor.name || '',
      contact: donor.phone || '',
      email: donor.email || ''
    },
    theme: { color: '#cda355' },
    handler: (response) => onSuccess && onSuccess(response),
    modal: {
      ondismiss: () => onDismiss && onDismiss()
    }
  });

  rzp.on('payment.failed', (resp) => {
    onDismiss && onDismiss(resp.error && resp.error.description);
  });

  rzp.open();
}
