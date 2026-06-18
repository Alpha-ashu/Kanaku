/**
 * Shared email layout + helpers. All templates render a consistent branded card
 * so the look-and-feel lives in one place.
 */

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return String(text ?? '').replace(/[&<>"']/g, (char) => map[char]);
}

export function emailButton(url: string, label: string): string {
  // url is a trusted, app-generated link; label is escaped.
  return `<a href="${url}" style="display:inline-block;padding:12px 24px;background-color:#5B21B6;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;margin-top:16px;">${escapeHtml(label)}</a>`;
}

/**
 * Wrap pre-built (already-escaped) inner HTML in the branded card layout.
 * `category` and `heading` are escaped here; `bodyHtml` is inserted verbatim,
 * so callers must escape any user-provided values they interpolate into it.
 */
export function renderLayout(opts: { heading: string; bodyHtml: string; category?: string }): string {
  const { heading, bodyHtml, category } = opts;
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; }
          .card { background-color: #fff; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
          .header { margin-bottom: 24px; border-bottom: 2px solid #5B21B6; padding-bottom: 16px; }
          .logo { font-size: 24px; font-weight: bold; color: #5B21B6; }
          .title { font-size: 22px; font-weight: 600; margin: 16px 0 8px 0; color: #1f2937; }
          .category { font-size: 12px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px; }
          .message { font-size: 16px; margin: 20px 0; color: #4b5563; line-height: 1.8; }
          .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="card">
            <div class="header"><div class="logo">KANAKU</div></div>
            ${category ? `<div class="category">${escapeHtml(category)}</div>` : ''}
            <div class="title">${escapeHtml(heading)}</div>
            <div class="message">${bodyHtml}</div>
            <div class="footer">
              <p>This is an automated message from KANAKU. You can manage your preferences in your account settings.</p>
              <p>&copy; ${new Date().getFullYear()} KANAKU. All rights reserved.</p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;
}
