export const buildAllowedOrigins = (): string[] => {
  const origins = (process.env.CORS_ORIGIN || process.env.FRONTEND_URL || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

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
