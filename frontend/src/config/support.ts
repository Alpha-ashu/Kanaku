/**
 * Where users reach KANAKU support (contact page, privacy policy, data deletion).
 *
 * kanaku.in has no MX record, so the old `support@kanaku.in` fallback bounced.
 * Set VITE_SUPPORT_EMAIL once a monitored product inbox exists.
 */
export const SUPPORT_EMAIL: string = import.meta.env.VITE_SUPPORT_EMAIL || 'shaik.job.details@gmail.com';

export const supportMailto = (subject?: string, body?: string): string => {
  const params = new URLSearchParams();
  if (subject) params.set('subject', subject);
  if (body) params.set('body', body);
  // URLSearchParams encodes spaces as "+", which mail clients show literally.
  const query = params.toString().replace(/\+/g, '%20');
  return `mailto:${SUPPORT_EMAIL}${query ? `?${query}` : ''}`;
};
