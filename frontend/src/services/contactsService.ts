/**
 * Contacts Service — Device & File Contact Import
 *
 * Supports:
 * 1. Native Android/iOS apps: the system contact picker via @capacitor-community/contacts.
 *    (The Android WebView and iOS WKWebView do not implement the Web Contact Picker
 *    API, so before this the native apps could only import .vcf/.csv files.)
 * 2. HTML5 Web Contact Picker API (`navigator.contacts.select`) for mobile browsers.
 * 3. vCard (.vcf) file parsing for cross-platform contact export/import.
 * 4. Sanitization, duplicate detection, and normalization for Kanaku friends.
 */
import { Capacitor } from '@capacitor/core';
import { Contacts } from '@capacitor-community/contacts';

export interface DeviceContact {
  name: string;
  email?: string;
  phone?: string;
}

const isNativeApp = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

/** Check if a device contact picker (native or browser) is available on this platform */
export function isContactPickerSupported(): boolean {
  if (isNativeApp()) return true;
  return typeof window !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;
}

/**
 * Native apps: asks for contacts access (Android READ_CONTACTS / iOS Contacts),
 * then opens the system picker for one contact. The picked contact joins the
 * same review queue as browser-picked ones.
 */
async function pickNativeContact(): Promise<DeviceContact[]> {
  let permission = await Contacts.checkPermissions();
  if (permission.contacts !== 'granted' && permission.contacts !== 'limited') {
    permission = await Contacts.requestPermissions();
  }
  if (permission.contacts !== 'granted' && permission.contacts !== 'limited') {
    throw new Error('Allow Contacts access for KANAKU in your phone settings to pick friends from your contacts.');
  }

  try {
    const { contact } = await Contacts.pickContact({ projection: { name: true, phones: true, emails: true, organization: true } });
    if (!contact) return [];
    const email = contact.emails?.find((e) => e.address)?.address?.trim().toLowerCase() || undefined;
    const phone = contact.phones?.find((p) => p.number)?.number?.trim().replace(/[\s\-()]/g, '') || undefined;
    const rawName = contact.name?.display
      || [contact.name?.given, contact.name?.family].filter(Boolean).join(' ');
    const name = sanitizeContactName(rawName || '', { email, phone, org: contact.organization?.company ?? undefined });
    return name ? [{ name, email, phone }] : [];
  } catch (err: any) {
    if (/cancel/i.test(String(err?.message ?? err))) return [];
    throw err;
  }
}

/**
 * Open the device contact picker — the system picker in the native apps, the Web
 * Contact Picker API in supporting mobile browsers. Returns the selected contacts.
 */
export async function pickDeviceContacts(): Promise<DeviceContact[]> {
  if (isNativeApp()) {
    return pickNativeContact();
  }
  if (!isContactPickerSupported()) {
    throw new Error('Contact Picker API is not supported on this browser/device.');
  }

  try {
    const props = ['name', 'email', 'tel'];
    const opts = { multiple: true };
    const rawContacts = await (navigator as any).contacts.select(props, opts);

    if (!Array.isArray(rawContacts) || rawContacts.length === 0) {
      return [];
    }

    const contacts: DeviceContact[] = [];

    for (const c of rawContacts) {
      const rawName = Array.isArray(c.name) ? c.name[0] : c.name;
      const rawEmail = Array.isArray(c.email) ? c.email[0] : c.email;
      const rawTel = Array.isArray(c.tel) ? c.tel[0] : c.tel;

      const email = (rawEmail || '').trim().toLowerCase() || undefined;
      let phone = (rawTel || '').trim().replace(/[\s\-()]/g, '');
      if (!phone) phone = undefined as any;

      const name = sanitizeContactName(rawName || '', { email, phone });
      if (!name) continue;

      contacts.push({ name, email, phone });
    }

    return contacts;
  } catch (err: any) {
    if (err.name === 'AbortError' || err.message?.includes('cancel')) {
      return [];
    }
    throw err;
  }
}

/**
 * Decode Quoted-Printable encoded strings (e.g. from vCard FN;ENCODING=QUOTED-PRINTABLE).
 * Converts hex byte sequences like =E2=9D=A4 to proper UTF-8 characters.
 */
export function decodeQuotedPrintable(str: string): string {
  if (!str) return '';
  if (!str.includes('=')) return str;

  // Remove soft line breaks (= followed by CRLF or LF)
  const normalized = str.replace(/=[\r\n]+/g, '');
  const bytes: number[] = [];

  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i] === '=' && i + 2 < normalized.length) {
      const hex = normalized.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    const charCode = normalized.charCodeAt(i);
    if (charCode < 128) {
      bytes.push(charCode);
    } else {
      const encoded = new TextEncoder().encode(normalized[i]);
      for (const b of encoded) bytes.push(b);
    }
  }

  try {
    return new TextDecoder('utf-8', { fatal: false, ignoreBOM: true }).decode(new Uint8Array(bytes));
  } catch {
    return str.replace(/(=[A-Fa-f0-9]{2})+/g, '');
  }
}

/**
 * Remove emojis, memojis, pictographs, stray punctuation clusters (like -:;)=d),
 * and leftover encoding artifacts from a contact name so it imports cleanly.
 */
export function removeEmojisAndMemojis(rawName: string): string {
  if (!rawName) return '';

  // 1. Decode quoted-printable first (if encoded)
  let name = decodeQuotedPrintable(rawName);

  // 2. Unescape vCard escape sequences (\;, \,, \:, \n, \r)
  name = name.replace(/\\[,;:nN]/g, ' ').replace(/\\/g, '');

  // 3. Remove Unicode emojis, memojis, pictographs, symbols, dingbats, and variation selectors
  name = name
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/[\uFE00-\uFE0F\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[\uD800-\uDFFF]/g, '');

  // 4. Strip any residual quoted-printable hex markers (=XX)
  name = name.replace(/(=[A-Fa-f0-9]{2})+/g, '');

  // 5. Remove ascii emoticons and symbol clusters (like -:;)=d, :-), :D, =D, etc.)
  name = name.replace(/[^\p{L}\p{N}\s]{2,}[a-zA-Z0-9]?/gu, ' ');
  name = name.replace(/(?:^|\s)(?:[-:;=8][oO-]?[)\]([dDpP/\\|*]|[<>]?[:;=8][)\]([dDpP/\\|*])(?:\s|$)/gi, ' ');
  name = name.replace(/(?:^|\s)[=:;]-?[)\]([dDpP](?:\s|$)/gi, ' ');

  // 6. Clean dangling punctuation from start and end (preserving valid parenthesis if balanced)
  name = name.replace(/^[-:;=,._~#*+|/\\s]+|[-:;=,._~#*+|/\\s]+$/gu, '');

  // 7. Collapse whitespace
  name = name.replace(/\s+/g, ' ').trim();

  return name;
}

/**
 * Sanitize and clean a contact's display name by removing emojis/memojis.
 * If the resulting name is empty, provides a fallback from email, phone, org, or nickname.
 */
export function sanitizeContactName(
  rawName: string,
  fallback?: { email?: string; phone?: string; org?: string; nickname?: string }
): string {
  const cleaned = removeEmojisAndMemojis(rawName);
  if (cleaned.length > 0) {
    return cleaned;
  }

  // Fallback 1: Nickname (cleaned)
  if (fallback?.nickname) {
    const cleanNick = removeEmojisAndMemojis(fallback.nickname);
    if (cleanNick) return cleanNick;
  }

  // Fallback 2: Organization (cleaned)
  if (fallback?.org) {
    const cleanOrg = removeEmojisAndMemojis(fallback.org);
    if (cleanOrg) return cleanOrg;
  }

  // Fallback 3: Email prefix (e.g. "alex" from "alex@gmail.com")
  if (fallback?.email) {
    const prefix = fallback.email.split('@')[0].trim();
    if (prefix) {
      return prefix.charAt(0).toUpperCase() + prefix.slice(1);
    }
  }

  // Fallback 4: Phone number digits
  if (fallback?.phone) {
    const digits = fallback.phone.replace(/\D/g, '');
    if (digits) {
      return `Contact (${digits.slice(-4)})`;
    }
  }

  return 'Contact';
}

/** Alias for backward compatibility */
export const cleanContactName = sanitizeContactName;

/**
 * Parse standard vCard (.vcf) format files exported from iOS / Android Contacts.
 * Automatically decodes Quoted-Printable strings, unfolds continuation lines,
 * strips emojis and memojis, and returns clean, properly named contacts.
 */
export function parseVCardContent(vcfText: string): DeviceContact[] {
  const contacts: DeviceContact[] = [];

  // Step 1: Unfold lines according to RFC 2426 and Quoted-Printable rules
  const rawLines = vcfText.split(/\r\n|\r|\n/);
  const unfoldedLines: string[] = [];
  let inPhoto = false;

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];
    const trimmed = line.trim();

    // Skip heavy base64 PHOTO blocks to keep parsing fast and prevent memory bloat
    if (trimmed.toUpperCase().startsWith('PHOTO;') || trimmed.toUpperCase().startsWith('PHOTO:')) {
      inPhoto = true;
    }
    if (inPhoto) {
      if (i + 1 < rawLines.length) {
        const next = rawLines[i + 1];
        if (next.startsWith(' ') || next.startsWith('\t') || next.endsWith('=')) {
          continue; // skip photo continuation lines
        }
      }
      inPhoto = false;
      continue;
    }

    // Unfold QP soft line breaks (ending with '=')
    while (line.endsWith('=') && i + 1 < rawLines.length) {
      i++;
      line = line.slice(0, -1) + rawLines[i].trimStart();
    }

    // Unfold RFC 2426 continuation lines (starting with space or tab)
    while (i + 1 < rawLines.length && (rawLines[i + 1].startsWith(' ') || rawLines[i + 1].startsWith('\t'))) {
      i++;
      const nextPart = rawLines[i].slice(1);
      if (line.endsWith('=')) {
        line = line.slice(0, -1) + nextPart;
      } else {
        line = line + nextPart;
      }
    }

    unfoldedLines.push(line);
  }

  // Step 2: Parse vCard cards
  let current: {
    fn?: string;
    n?: string;
    nickname?: string;
    org?: string;
    phone?: string;
    email?: string;
  } | null = null;

  for (const line of unfoldedLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.toUpperCase().startsWith('BEGIN:VCARD')) {
      current = {};
      continue;
    }

    if (trimmed.toUpperCase().startsWith('END:VCARD')) {
      if (current) {
        const rawName = current.fn || current.n || current.nickname || current.org || '';
        const name = sanitizeContactName(rawName, {
          email: current.email,
          phone: current.phone,
          org: current.org,
          nickname: current.nickname,
        });

        if (name || current.email || current.phone) {
          contacts.push({
            name: name || current.email || current.phone || 'Contact',
            email: current.email,
            phone: current.phone,
          });
        }
      }
      current = null;
      continue;
    }

    if (!current) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const propHeader = trimmed.slice(0, colonIdx).trim();
    const rawVal = trimmed.slice(colonIdx + 1).trim();

    // Remove group prefixes like "item1.FN" -> "FN"
    const propWithoutGroup = propHeader.replace(/^[a-zA-Z0-9_-]+\./, '');
    const semiIdx = propWithoutGroup.indexOf(';');
    const propName = (semiIdx === -1 ? propWithoutGroup : propWithoutGroup.slice(0, semiIdx)).toUpperCase();
    const propParams = (semiIdx === -1 ? '' : propWithoutGroup.slice(semiIdx + 1)).toUpperCase();

    const isQP = propParams.includes('QUOTED-PRINTABLE') || propHeader.toUpperCase().includes('QUOTED-PRINTABLE');
    const val = isQP ? decodeQuotedPrintable(rawVal) : rawVal;

    if (propName === 'FN') {
      current.fn = val;
    } else if (propName === 'N' && !current.fn) {
      const parts = val.split(';');
      const lastName = parts[0]?.trim() || '';
      const firstName = parts[1]?.trim() || '';
      const middleName = parts[2]?.trim() || '';
      const constructed = [firstName, middleName, lastName].filter(Boolean).join(' ');
      if (constructed) current.n = constructed;
    } else if (propName === 'TEL') {
      const cleanPhone = val.replace(/[\s\-()]/g, '');
      if (cleanPhone && !current.phone) {
        current.phone = cleanPhone;
      }
    } else if (propName === 'EMAIL') {
      const cleanEmail = val.trim().toLowerCase();
      if (cleanEmail && !current.email) {
        current.email = cleanEmail;
      }
    } else if (propName === 'NICKNAME' && !current.nickname) {
      current.nickname = val;
    } else if (propName === 'ORG' && !current.org) {
      current.org = val;
    }
  }

  return contacts;
}

/**
 * Parse CSV contacts export (Google Contacts, Outlook, iOS, or standard Name,Email,Phone).
 */
export function parseCsvContacts(csvText: string): DeviceContact[] {
  const lines = csvText.split(/\r\n|\r|\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  const splitRow = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    return cells;
  };

  const headerRow = splitRow(lines[0]);
  const headerLower = headerRow.map(h => h.toLowerCase());

  // Find column indices
  let nameIdx = headerLower.findIndex(h => h === 'name' || h === 'full name' || h.includes('display name'));
  const givenNameIdx = headerLower.findIndex(h => h.includes('given name') || h.includes('first name'));
  const familyNameIdx = headerLower.findIndex(h => h.includes('family name') || h.includes('last name'));
  let emailIdx = headerLower.findIndex(h => h.includes('email') || h.includes('e-mail'));
  let phoneIdx = headerLower.findIndex(h => h.includes('phone') || h.includes('mobile') || h.includes('tel'));

  const hasHeader = nameIdx !== -1 || givenNameIdx !== -1 || emailIdx !== -1 || phoneIdx !== -1;
  const dataLines = hasHeader ? lines.slice(1) : lines;

  if (!hasHeader) {
    nameIdx = 0;
    emailIdx = 1;
    phoneIdx = 2;
  }

  const contacts: DeviceContact[] = [];

  for (const line of dataLines) {
    const cells = splitRow(line);
    let rawName = '';
    if (nameIdx >= 0 && cells[nameIdx]) {
      rawName = cells[nameIdx];
    } else if (givenNameIdx >= 0 || familyNameIdx >= 0) {
      const first = givenNameIdx >= 0 ? cells[givenNameIdx] || '' : '';
      const last = familyNameIdx >= 0 ? cells[familyNameIdx] || '' : '';
      rawName = `${first} ${last}`.trim();
    }

    const email = emailIdx >= 0 && cells[emailIdx] ? cells[emailIdx].trim().toLowerCase() : undefined;
    const rawPhone = phoneIdx >= 0 && cells[phoneIdx] ? cells[phoneIdx].trim() : undefined;
    const phone = rawPhone ? rawPhone.replace(/[\s\-()]/g, '') : undefined;
    const name = sanitizeContactName(rawName, { email, phone });

    if (name || email || phone) {
      contacts.push({
        name: name || email || phone || 'Contact',
        email: email || undefined,
        phone: phone || undefined,
      });
    }
  }

  return contacts;
}

