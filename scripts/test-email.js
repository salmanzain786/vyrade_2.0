/**
 * SMTP delivery test (pre-beta gate #6 / SMTP).
 *
 *   node scripts/test-email.js you@example.com
 *   (or set TEST_EMAIL and run `npm run test:email`)
 *
 * Sends one real message through the app's own mailer using your SMTP_* env.
 * `delivered: true`  → SMTP works, real users will get OTP codes.
 * `delivered: false` → still the console fallback; check SMTP_HOST/USER/PASS.
 */
import 'dotenv/config';
import { sendMail } from '../lib/services/mailer.js';

async function main() {
  const to = process.argv[2] || process.env.TEST_EMAIL;
  if (!to) { console.error('Usage: node scripts/test-email.js <recipient@example.com>'); process.exit(1); }

  const configured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
  console.log(`SMTP configured: ${configured ? 'yes → ' + process.env.SMTP_HOST : 'NO (console fallback expected)'}`);
  console.log(`Sending test email to ${to}…`);

  const res = await sendMail({
    to,
    subject: 'Vyrade SMTP test',
    text: 'If you received this, Vyrade SMTP delivery is working. OTP and password-reset emails will reach real users.',
    html: '<p>If you received this, <b>Vyrade SMTP delivery is working</b>. OTP and password-reset emails will reach real users.</p>',
  });

  if (res?.delivered) { console.log('✓ delivered: true — real email sent. Check the inbox (and spam).'); process.exit(0); }
  console.error('✗ delivered: false — message went to the console fallback, not a real inbox. Set SMTP_HOST/SMTP_USER/SMTP_PASS.');
  process.exit(1);
}
main().catch((err) => { console.error('email test error:', err.message); process.exit(1); });
