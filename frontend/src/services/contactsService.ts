/**
 * Contacts Service — Device & File Contact Import
 *
 * Supports:
 * 1. HTML5 Web Contact Picker API (`navigator.contacts.select`) for mobile browsers / WebViews.
 * 2. vCard (.vcf) file parsing for cross-platform contact export/import.
 * 3. Sanitization, duplicate detection, and normalization for Kanaku friends.
 */

export interface DeviceContact {
  name: string;
  email?: string;
  phone?: string;
}

/** Check if the native/browser Web Contact Picker API is supported on this platform */
export function isContactPickerSupported(): boolean {
  return typeof window !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;
}

/**
 * Open the native device contact picker dialog (supported on Android Chrome, Samsung Internet, mobile WebViews).
 * Returns array of selected contacts.
 */
export async function pickDeviceContacts(): Promise<DeviceContact[]> {
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

      const name = (rawName || '').trim();
      if (!name) continue;

      const email = (rawEmail || '').trim().toLowerCase() || undefined;
      let phone = (rawTel || '').trim().replace(/[\s\-()]/g, '');
      if (!phone) phone = undefined as any;

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
 * Parse standard vCard (.vcf) format files exported from iOS / Android Contacts.
 */
export function parseVCardContent(vcfText: string): DeviceContact[] {
  const contacts: DeviceContact[] = [];
  const lines = vcfText.split(/\r\n|\r|\n/);

  let currentContact: Partial<DeviceContact> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.startsWith('BEGIN:VCARD')) {
      currentContact = {};
    } else if (line.startsWith('END:VCARD')) {
      if (currentContact && currentContact.name) {
        contacts.push({
          name: currentContact.name.trim(),
          email: currentContact.email?.trim().toLowerCase() || undefined,
          phone: currentContact.phone?.trim() || undefined,
        });
      }
      currentContact = null;
    } else if (currentContact) {
      // Full Name
      if (line.startsWith('FN:') || line.startsWith('FN;')) {
        const val = line.substring(line.indexOf(':') + 1).trim();
        if (val) currentContact.name = val;
      } else if (!currentContact.name && (line.startsWith('N:') || line.startsWith('N;'))) {
        const parts = line.substring(line.indexOf(':') + 1).split(';');
        const lastName = parts[0]?.trim() || '';
        const firstName = parts[1]?.trim() || '';
        const constructed = `${firstName} ${lastName}`.trim();
        if (constructed) currentContact.name = constructed;
      }
      // Phone
      else if (line.startsWith('TEL') && !currentContact.phone) {
        const val = line.substring(line.indexOf(':') + 1).trim().replace(/[\s\-()]/g, '');
        if (val) currentContact.phone = val;
      }
      // Email
      else if (line.startsWith('EMAIL') && !currentContact.email) {
        const val = line.substring(line.indexOf(':') + 1).trim();
        if (val) currentContact.email = val;
      }
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
  let givenNameIdx = headerLower.findIndex(h => h.includes('given name') || h.includes('first name'));
  let familyNameIdx = headerLower.findIndex(h => h.includes('family name') || h.includes('last name'));
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
    let name = '';
    if (nameIdx >= 0 && cells[nameIdx]) {
      name = cells[nameIdx];
    } else if (givenNameIdx >= 0 || familyNameIdx >= 0) {
      const first = givenNameIdx >= 0 ? cells[givenNameIdx] || '' : '';
      const last = familyNameIdx >= 0 ? cells[familyNameIdx] || '' : '';
      name = `${first} ${last}`.trim();
    }

    name = name.trim();
    const email = emailIdx >= 0 && cells[emailIdx] ? cells[emailIdx].trim().toLowerCase() : undefined;
    const rawPhone = phoneIdx >= 0 && cells[phoneIdx] ? cells[phoneIdx].trim() : undefined;
    const phone = rawPhone ? rawPhone.replace(/[\s\-()]/g, '') : undefined;

    if (name || email || phone) {
      contacts.push({
        name: name || email || phone || 'Unnamed Contact',
        email: email || undefined,
        phone: phone || undefined,
      });
    }
  }

  return contacts;
}

