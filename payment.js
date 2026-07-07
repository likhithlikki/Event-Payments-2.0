/**
 * payment.js
 * ------------------------------------------------------------------
 * One responsibility: the Razorpay Checkout popup. Nothing in here
 * knows about donors, forms, or the DOM beyond the checkout modal
 * itself — donors.js (and later pages) call openCheckout() with an
 * order returned by the createPaymentOrder action and get a plain
 * callback with the raw Razorpay response.
 * ------------------------------------------------------------------
 */

let razorpaySdkPromise = null;

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

/**
 * Opens the Razorpay checkout modal for an order created via the
 * createPaymentOrder action.
 *
 * order: { razorpayOrderId, amountPaise, currency, keyId }
 * donor: { name, phone, email } — prefills the checkout form
 * onSuccess(response) — response has razorpay_order_id, razorpay_payment_id, razorpay_signature
 * onDismiss() — called if the visitor closes the modal without paying
 */
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
