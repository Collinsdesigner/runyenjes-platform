// RUNYENJES-SETUP-V1
import nodemailer from 'nodemailer';
import { getInstitutionName } from './institution';

// Email goes out through SMTP, so an institution can use any mail provider.
//   EMAIL_HOST      SMTP server, e.g. smtp.gmail.com. If empty, Gmail is assumed.
//   EMAIL_PORT      465 or 587. Default 587.
//   EMAIL_SECURE    "true" or "false". Default: true for port 465, otherwise false.
//   EMAIL_USER      SMTP login.
//   EMAIL_PASSWORD  SMTP password (the older name EMAIL_APP_PASSWORD is still accepted).
//   EMAIL_FROM      Address emails come from. Default: EMAIL_USER.

function settings() {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD || process.env.EMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  const host = (process.env.EMAIL_HOST || '').trim();
  const port = Number(process.env.EMAIL_PORT) || 587;
  const secure = process.env.EMAIL_SECURE
    ? process.env.EMAIL_SECURE.toLowerCase() === 'true'
    : port === 465;
  const from = (process.env.EMAIL_FROM || '').trim() || user;
  return { user, pass, host, port, secure, from };
}

export function isEmailConfigured(): boolean {
  return settings() !== null;
}

// The portal's own mailbox, used for the wizard's test email. Never taken from a request.
export function emailTestRecipient(): string | null {
  const s = settings();
  if (!s) return null;
  return s.from.includes('@') ? s.from : null;
}

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  const s = settings();
  if (!s) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport(
      s.host
        ? {
            host: s.host,
            port: s.port,
            secure: s.secure,
            auth: { user: s.user, pass: s.pass },
            connectionTimeout: 15000,
            greetingTimeout: 15000,
            socketTimeout: 20000,
          }
        : { service: 'gmail', auth: { user: s.user, pass: s.pass } }
    );
  }
  return transporter;
}

// Reports success or the reason for failure (used by the wizard's test email).
export async function sendEmailChecked(
  to: string,
  subject: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  const t = getTransporter();
  const s = settings();
  if (!t || !s) return { ok: false, error: 'Email is not configured.' };
  try {
    const fromName = (await getInstitutionName()).replace(/"/g, '');
    await t.sendMail({ from: `"${fromName}" <${s.from}>`, to, subject, text });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// Fails silently (logs only) if email isn't configured yet, or if sending
// fails for any reason: a notification email should never crash the
// actual action (admitting a student, verifying a payment, etc.).
export async function sendEmail(to: string, subject: string, text: string) {
  if (!isEmailConfigured()) {
    console.log(`[email not configured] Would have sent to ${to}: ${subject}`);
    return;
  }
  const result = await sendEmailChecked(to, subject, text);
  if (!result.ok) console.error('Email send failed:', result.error);
}
