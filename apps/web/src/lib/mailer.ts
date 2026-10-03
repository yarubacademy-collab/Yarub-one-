import nodemailer from 'nodemailer';

/**
 * Sends one email, BCC'd to every address given.
 *
 * Uses SMTP_URL and AUTH_EMAIL_FROM — both already present in this project's
 * config as unused placeholders, now actually wired up. SMTP_URL works with
 * any ordinary mailbox, Gmail included: a Gmail App Password (not the normal
 * account password — Google requires a separate one for this) produces a URL
 * like smtps://you@gmail.com:the-app-password@smtp.gmail.com:465.
 *
 * One email with many BCC recipients rather than one email per person: a
 * course announcement is the same message for everyone, and this keeps a
 * reminder for, say, 60 signed-up users to a single send instead of 60.
 *
 * Silently does nothing when SMTP isn't configured, matching every other
 * optional integration in this app (Tavily, the image/video providers): a
 * missing key is a feature that is not live yet, not a crash.
 */
export async function sendAnnouncementEmail(input: {
  recipients: string[];
  subject: string;
  html: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const smtpUrl = process.env.SMTP_URL;
  const from = process.env.AUTH_EMAIL_FROM;

  if (!smtpUrl || !from) return { sent: false, reason: 'SMTP_URL/AUTH_EMAIL_FROM not set' };
  if (input.recipients.length === 0) return { sent: false, reason: 'no recipients' };

  try {
    const transport = nodemailer.createTransport(smtpUrl);
    await transport.sendMail({
      from,
      to: from, // the visible "to" is the academy itself; everyone else is BCC'd
      bcc: input.recipients,
      subject: input.subject,
      html: input.html,
    });
    return { sent: true };
  } catch (error) {
    console.error('[mailer] send failed', error instanceof Error ? error.message : error);
    return { sent: false, reason: 'send failed' };
  }
}
