// Capacitor native webview origins — always permitted regardless of CORS_ORIGIN.
// On Android the webview origin is `capacitor://localhost`; on iOS it is
// `ionic://localhost` (Capacitor <5) or `https://localhost` (Capacitor ≥5,
// androidScheme:"https"). These origins are safe to allow unconditionally:
// every API call already carries a short-lived JWT in the Authorization header,
// and the android/ios apps are our own code — not third-party web pages.
const CAPACITOR_ORIGINS = [
  'capacitor://localhost',
  'ionic://localhost',
  'https://localhost',
  'http://localhost',
];

export const buildAllowedOrigins = (): string[] => {
  const origins = (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  // Always allow Capacitor native webview origins (Android & iOS).
  origins.push(...CAPACITOR_ORIGINS);

  if (process.env.NODE_ENV !== 'production') {
    origins.push(
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:9002',
      'http://127.0.0.1:9002',
    );
  }

  if (process.env.VERCEL_URL) {
    origins.push(`https://${process.env.VERCEL_URL}`);
  }

  return Array.from(new Set(origins));
};

export const allowedOrigins = buildAllowedOrigins();
export const allowAllOrigins = allowedOrigins.length === 0 || allowedOrigins.includes('*');

export const isAllowedOrigin = (origin: string): boolean => {
  if (allowAllOrigins) return true;
  if (allowedOrigins.includes(origin)) return true;

  const wildcard = allowedOrigins.find(value => value.startsWith('*.'));
  if (wildcard) {
    const suffix = wildcard.slice(1);
    return origin.endsWith(suffix);
  }

  return false;
};
