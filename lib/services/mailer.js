// Email delivery with a graceful dev fallback.
//
// If SMTP_* env vars are set AND `nodemailer` is installed, mail is sent for
// real. Otherwise the message is logged to the server console so the OTP flows
// remain fully testable in local dev with zero setup.
//
// To enable real email:  npm install nodemailer  and set SMTP_HOST/PORT/USER/
// PASS/FROM in .env (see .env.example).

let _transporterPromise;

function smtpConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

async function getTransporter() {
  if (!_transporterPromise) {
    _transporterPromise = (async () => {
      try {
        const nodemailer = (await import('nodemailer')).default;
        return nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT || 587),
          secure: Number(process.env.SMTP_PORT) === 465,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
      } catch (err) {
        console.warn(
          '[mailer] SMTP is configured but `nodemailer` is not installed — falling back to console. Run `npm install nodemailer`.'
        );
        return null;
      }
    })();
  }
  return _transporterPromise;
}

/**
 * Send an email. Returns { delivered: boolean } — false means it was logged to
 * the console rather than sent (dev fallback), which callers can ignore.
 */
export async function sendMail({ to, subject, text, html }) {
  const from = process.env.SMTP_FROM || 'Vyrade <no-reply@vyrade.local>';

  if (smtpConfigured()) {
    const transporter = await getTransporter();
    if (transporter) {
      await transporter.sendMail({ from, to, subject, text, html });
      return { delivered: true };
    }
  }

  // Dev fallback: make the content obvious in the server log.
  console.log(
    `\n──────── EMAIL (dev, not sent) ────────\n` +
      `To:      ${to}\nSubject: ${subject}\n\n${text}\n` +
      `───────────────────────────────────────\n`
  );
  return { delivered: false };
}

export async function sendOtpEmail({ to, name, code, purpose }) {
  const isReset = purpose === 'password_reset';
  const subject = isReset
    ? 'Your Vyrade password reset code'
    : 'Verify your Vyrade email';
  const action = isReset ? 'reset your password' : 'verify your email address';

  const text =
    `Hi ${name || 'there'},\n\n` +
    `Your Vyrade code to ${action} is:\n\n    ${code}\n\n` +
    `It expires in 10 minutes. If you didn't request this, you can ignore this email.\n\n— Vyrade`;

  const html =
    `<div style="font-family:system-ui,sans-serif;max-width:420px">` +
    `<p>Hi ${name || 'there'},</p>` +
    `<p>Your Vyrade code to ${action} is:</p>` +
    `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>` +
    `<p style="color:#666">It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>` +
    `<p>— Vyrade</p></div>`;

  return sendMail({ to, subject, text, html });
}
