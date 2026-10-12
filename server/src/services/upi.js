/**
 * UPI deep-link builder.
 *
 * This is the core of the "no payment gateway" claim. We never move money and
 * never see a transaction — we only assemble a standard UPI intent URI. The
 * client renders it as a QR code; the wisher scans it with GPay/PhonePe/Paytm
 * and pays the volunteer's bank directly. Madad is a phonebook, not a bank.
 *
 * Spec: upi://pay?pa=<vpa>&pn=<name>&am=<amount>&cu=INR&tn=<note>&tr=<ref>
 */

const VPA_RE = /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/;

export function isValidUpiId(vpa) {
  return typeof vpa === 'string' && VPA_RE.test(vpa.trim());
}

/**
 * @param {object} p
 * @param {string} p.payeeVpa    volunteer's UPI ID
 * @param {string} p.payeeName   volunteer's display name
 * @param {number} p.amount      bounty in rupees
 * @param {string} [p.note]      transaction note shown in the UPI app
 * @param {string} [p.ref]       our task id, echoed back as the reference
 * @returns {string} upi:// URI
 */
export function buildUpiUri({ payeeVpa, payeeName, amount, note, ref }) {
  if (!isValidUpiId(payeeVpa)) {
    throw new Error('Invalid UPI ID');
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error('Invalid amount');
  }

  const params = new URLSearchParams();
  params.set('pa', payeeVpa.trim().toLowerCase());
  params.set('pn', (payeeName || 'Madad Volunteer').slice(0, 50));
  params.set('am', amt.toFixed(2));
  params.set('cu', 'INR');
  // UPI notes reject most punctuation; keep it boringly alphanumeric.
  params.set('tn', (note || 'Madad bounty').replace(/[^\w\s]/g, '').slice(0, 50));
  if (ref) params.set('tr', String(ref).replace(/[^\w]/g, '').slice(0, 35));

  return `upi://pay?${params.toString()}`;
}

/**
 * Everything the client needs to render the payment screen. The QR image
 * itself is generated client-side so the URI never has to round-trip.
 */
export function buildPaymentPayload({ volunteer, task }) {
  if (!volunteer?.upiId) {
    return {
      ready: false,
      reason: 'The volunteer has not added a UPI ID yet.',
      payeeName: volunteer?.name || null,
    };
  }

  const uri = buildUpiUri({
    payeeVpa: volunteer.upiId,
    payeeName: volunteer.name,
    amount: task.bounty,
    note: `Madad ${task.category}`,
    ref: task._id.toString(),
  });

  return {
    ready: true,
    uri,
    payeeVpa: volunteer.upiId,
    payeeName: volunteer.name,
    amount: task.bounty,
    currency: 'INR',
    taskId: task._id,
    // Shown under the QR so the wisher can pay manually if scanning fails.
    manual: {
      upiId: volunteer.upiId,
      amount: task.bounty,
    },
  };
}

export default { buildUpiUri, buildPaymentPayload, isValidUpiId };
