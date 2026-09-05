import { describe, expect, it } from 'vitest';
import { parseVCardContent, parseCsvContacts } from '@/services/contactsService';

describe('contactsService', () => {
  describe('parseVCardContent', () => {
    it('parses single and multi-line vCards correctly', () => {
      const vcfData = `
BEGIN:VCARD
VERSION:3.0
FN:Rohan Sharma
TEL;TYPE=CELL:+91 98765 43210
EMAIL;TYPE=HOME:rohan.sharma@example.com
END:VCARD
BEGIN:VCARD
VERSION:3.0
N:Verma;Priya;;;
TEL;TYPE=WORK:(555) 123-4567
EMAIL:priya.verma@example.com
END:VCARD
      `.trim();

      const contacts = parseVCardContent(vcfData);
      expect(contacts).toHaveLength(2);
      expect(contacts[0]).toEqual({
        name: 'Rohan Sharma',
        email: 'rohan.sharma@example.com',
        phone: '+919876543210',
      });
      expect(contacts[1]).toEqual({
        name: 'Priya Verma',
        email: 'priya.verma@example.com',
        phone: '5551234567',
      });
    });

    it('gracefully handles empty or malformed vCards', () => {
      expect(parseVCardContent('')).toEqual([]);
      expect(parseVCardContent('NOT A VCARD')).toEqual([]);
    });
  });

  describe('parseCsvContacts', () => {
    it('parses standard Name, Email, Phone CSV format', () => {
      const csvData = `Name,Email,Phone
Aarav Patel,aarav@example.com,+91 9123456789
Ananya Sen,ananya@test.org,9876543210`;

      const contacts = parseCsvContacts(csvData);
      expect(contacts).toHaveLength(2);
      expect(contacts[0]).toEqual({
        name: 'Aarav Patel',
        email: 'aarav@example.com',
        phone: '+919123456789',
      });
      expect(contacts[1]).toEqual({
        name: 'Ananya Sen',
        email: 'ananya@test.org',
        phone: '9876543210',
      });
    });

    it('parses Google Contacts export CSV format with Given Name and Family Name', () => {
      const googleCsv = `"Given Name","Family Name","E-mail 1 - Value","Phone 1 - Value"
"Vikram","Reddy","vikram.reddy@gmail.com","+91 98450 11223"
"Sunita","","sunita@example.com",""`;

      const contacts = parseCsvContacts(googleCsv);
      expect(contacts).toHaveLength(2);
      expect(contacts[0].name).toBe('Vikram Reddy');
      expect(contacts[0].email).toBe('vikram.reddy@gmail.com');
      expect(contacts[0].phone).toBe('+919845011223');

      expect(contacts[1].name).toBe('Sunita');
      expect(contacts[1].email).toBe('sunita@example.com');
    });

    it('handles headerless CSV safely', () => {
      const rawCsv = `John Doe,john@doe.com,555-0199`;
      const contacts = parseCsvContacts(rawCsv);
      expect(contacts).toHaveLength(1);
      expect(contacts[0].name).toBe('John Doe');
      expect(contacts[0].email).toBe('john@doe.com');
      expect(contacts[0].phone).toBe('5550199');
    });
  });
});
