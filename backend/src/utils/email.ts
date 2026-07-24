import nodemailer from 'nodemailer';

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

// Fails silently (logs only) if email isn't configured yet, or if sending
// fails for any reason — a notification email should never crash the
// actual action (admitting a student, verifying a payment, etc.).
export async function sendEmail(to: string, subject: string, text: string) {
  const t = getTransporter();
  if (!t) {
    console.log(`[email not configured] Would have sent to ${to}: ${subject}`);
    return;
  }
  try {
    await t.sendMail({
      from: `"Runyenjes Technical & Vocational College" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
    });
  } catch (err) {
    console.error('Email send failed:', err);
  }
}
