/**
 * Email delivery diagnostic — sends ONE real test email through the configured
 * provider (SendGrid → SMTP) and prints exactly what the provider answered.
 *
 *   cd backend
 *   npx tsx scripts/email-diag.ts you@example.com
 *
 * Exit 0 = provider accepted the message; 1 = rejected / no provider.
 */
import 'dotenv/config';
import { sendEmail, FROM_EMAIL } from '../src/emails/providers/sendgrid.provider';
import { isSmtpConfigured } from '../src/emails/providers/smtp.provider';

const PUBLIC_MAILBOX_DOMAINS = [
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com',
  'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'aol.com',
];

async function main(): Promise<void> {
  const to = process.argv[2];
  if (!to || !to.includes('@')) {
    console.error('Usage: npx tsx scripts/email-diag.ts <recipient@example.com>');
    process.exit(2);
  }

  const key = process.env.SENDGRID_API_KEY || '';
  const from = process.env.SENDGRID_FROM_EMAIL || '';

  console.log('NODE_ENV            :', process.env.NODE_ENV || '(unset → development)');
  console.log('SENDGRID_API_KEY    :', key ? `set (${key.slice(0, 3)}…, ${key.length} chars)` : 'MISSING');
  console.log('SENDGRID_FROM_EMAIL :', from || 'MISSING');
  console.log('SMTP configured     :', isSmtpConfigured() ? 'yes' : 'no');
  console.log('Effective FROM      :', FROM_EMAIL);

  const fromDomain = from.split('@')[1]?.toLowerCase();
  if (fromDomain && PUBLIC_MAILBOX_DOMAINS.includes(fromDomain)) {
    console.warn(
      `\n!! FROM address is on ${fromDomain}. Mail sent "from" a public mailbox domain through ` +
      'SendGrid fails DMARC alignment and is frequently junked or rejected by Gmail/Yahoo/Outlook. ' +
      'Send from an address on your own domain and complete SendGrid Domain Authentication.\n',
    );
  }

  console.log(`\nSending test email to ${to} …`);
  const ok = await sendEmail({
    to,
    subject: `Kanaku email diagnostic ${new Date().toISOString()}`,
    html: '<p>If you can read this, the Kanaku email provider is working.</p>',
    categories: ['kanaku-diag'],
  });

  console.log(
    ok
      ? '\nOK: provider ACCEPTED the message. If it still does not arrive, check the spam folder and the SendGrid Activity + Suppressions pages for this recipient.'
      : '\nFAIL: provider REJECTED the message or no provider is available — the [Email/...] log line above carries the reason.',
  );
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
