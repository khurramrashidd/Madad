/**
 * Dates and times in IST.
 *
 * Madad is an India-only product — UPI, ₹, Indian mobile numbers — so the
 * header shows Indian Standard Time regardless of what the device thinks. A
 * user whose phone clock is on the wrong timezone (common on cheap handsets
 * and after travel) should still see the same date as the person they are
 * about to meet.
 *
 * `Asia/Kolkata` is handed to Intl rather than computed as UTC+5:30 by hand,
 * so the formatting is locale-correct and the offset is the platform's
 * problem, not ours.
 */

export const IST = 'Asia/Kolkata';

const fmt = (options) => new Intl.DateTimeFormat('en-IN', { timeZone: IST, ...options });

/** "Mon, 12 Oct" — the header strip. */
export const istShortDate = (date = new Date()) =>
  fmt({ weekday: 'short', day: 'numeric', month: 'short' }).format(date);

/** "Monday, 12 October 2026" — for anywhere with room. */
export const istLongDate = (date = new Date()) =>
  fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(date);

/** "1:55 pm" */
export const istTime = (date = new Date()) =>
  fmt({ hour: 'numeric', minute: '2-digit', hour12: true })
    .format(date)
    .toLowerCase()
    .replace(/\s/g, ' ');

/**
 * The hour in IST, 0-23 — what the greeting keys off.
 *
 * Read from the formatted parts rather than `date.getHours()`, which would
 * give the device's local hour and greet a user "good morning" at 9pm if
 * their phone is set to another timezone.
 */
export function istHour(date = new Date()) {
  const parts = fmt({ hour: 'numeric', hour12: false }).formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour')?.value;
  const n = Number(hour);
  return Number.isFinite(n) ? n % 24 : date.getHours();
}

/** 'morning' | 'afternoon' | 'evening' — IST, not device time. */
export function istGreetingSlot(date = new Date()) {
  const h = istHour(date);
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

export default { IST, istShortDate, istLongDate, istTime, istHour, istGreetingSlot };
