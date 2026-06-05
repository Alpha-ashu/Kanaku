
export interface BankInfo {
  name: string;
  shortName: string;
  color: string;
  textColor: string;
  initials: string;
  type: string;
}

export const BANKS_BY_COUNTRY: Record<string, BankInfo[]> = {
  India: [
    // Public Sector Banks (PSBs)
    { name: 'State Bank of India', shortName: 'SBI', color: '#2563eb', textColor: '#fff', initials: 'SBI', type: 'Public Sector' },
    { name: 'Bank of Baroda', shortName: 'BOB', color: '#f97316', textColor: '#fff', initials: 'BOB', type: 'Public Sector' },
    { name: 'Punjab National Bank', shortName: 'PNB', color: '#831843', textColor: '#fff', initials: 'PNB', type: 'Public Sector' },
    { name: 'Canara Bank', shortName: 'Canara', color: '#0369a1', textColor: '#fff', initials: 'CNB', type: 'Public Sector' },
    { name: 'Union Bank of India', shortName: 'UBI', color: '#1d4ed8', textColor: '#fff', initials: 'UBI', type: 'Public Sector' },
    { name: 'Bank of India', shortName: 'BOI', color: '#1e3a5f', textColor: '#fff', initials: 'BOI', type: 'Public Sector' },
    { name: 'Indian Bank', shortName: 'IndianB', color: '#065f46', textColor: '#fff', initials: 'IB', type: 'Public Sector' },
    { name: 'Central Bank of India', shortName: 'CBI', color: '#7c3aed', textColor: '#fff', initials: 'CBI', type: 'Public Sector' },
    { name: 'Indian Overseas Bank', shortName: 'IOB', color: '#1d4ed8', textColor: '#fff', initials: 'IOB', type: 'Public Sector' },
    { name: 'UCO Bank', shortName: 'UCO', color: '#0f766e', textColor: '#fff', initials: 'UCO', type: 'Public Sector' },
    { name: 'Bank of Maharashtra', shortName: 'BOM', color: '#b45309', textColor: '#fff', initials: 'BOM', type: 'Public Sector' },
    { name: 'Punjab & Sind Bank', shortName: 'PSB', color: '#7e22ce', textColor: '#fff', initials: 'PSB', type: 'Public Sector' },
    // Private Sector Banks
    { name: 'HDFC Bank', shortName: 'HDFC', color: '#1e40af', textColor: '#fff', initials: 'HDFC', type: 'Private Sector' },
    { name: 'ICICI Bank', shortName: 'ICICI', color: '#ea580c', textColor: '#fff', initials: 'ICICI', type: 'Private Sector' },
    { name: 'Axis Bank', shortName: 'AXIS', color: '#9d174d', textColor: '#fff', initials: 'AXIS', type: 'Private Sector' },
    { name: 'Kotak Mahindra Bank', shortName: 'Kotak', color: '#dc2626', textColor: '#fff', initials: 'KMB', type: 'Private Sector' },
    { name: 'IndusInd Bank', shortName: 'IndusInd', color: '#7c2d12', textColor: '#fff', initials: 'IND', type: 'Private Sector' },
    { name: 'YES Bank', shortName: 'YES', color: '#2563eb', textColor: '#fff', initials: 'YES', type: 'Private Sector' },
    { name: 'IDFC FIRST Bank', shortName: 'IDFC', color: '#9f1239', textColor: '#fff', initials: 'IDFC', type: 'Private Sector' },
    { name: 'Federal Bank', shortName: 'Federal', color: '#1e40af', textColor: '#fff', initials: 'FED', type: 'Private Sector' },
    { name: 'Bandhan Bank', shortName: 'Bandhan', color: '#0284c7', textColor: '#fff', initials: 'BDB', type: 'Private Sector' },
    { name: 'CSB Bank', shortName: 'CSB', color: '#4338ca', textColor: '#fff', initials: 'CSB', type: 'Private Sector' },
    { name: 'City Union Bank', shortName: 'CUB', color: '#b45309', textColor: '#fff', initials: 'CUB', type: 'Private Sector' },
    { name: 'DCB Bank', shortName: 'DCB', color: '#0e7490', textColor: '#fff', initials: 'DCB', type: 'Private Sector' },
    { name: 'Dhanlaxmi Bank', shortName: 'Dhan', color: '#7e22ce', textColor: '#fff', initials: 'DLB', type: 'Private Sector' },
    { name: 'Jammu & Kashmir Bank', shortName: 'J&K Bank', color: '#166534', textColor: '#fff', initials: 'JKB', type: 'Private Sector' },
    { name: 'Karnataka Bank', shortName: 'KBL', color: '#c2410c', textColor: '#fff', initials: 'KBL', type: 'Private Sector' },
    { name: 'Karur Vysya Bank', shortName: 'KVB', color: '#92400e', textColor: '#fff', initials: 'KVB', type: 'Private Sector' },
    { name: 'South Indian Bank', shortName: 'SIB', color: '#1e3a5f', textColor: '#fff', initials: 'SIB', type: 'Private Sector' },
    { name: 'Tamilnad Mercantile Bank', shortName: 'TMB', color: '#0f172a', textColor: '#fff', initials: 'TMB', type: 'Private Sector' },
    { name: 'Nainital Bank', shortName: 'Nainital', color: '#1d4ed8', textColor: '#fff', initials: 'NTL', type: 'Private Sector' },
    { name: 'RBL Bank', shortName: 'RBL', color: '#b91c1c', textColor: '#fff', initials: 'RBL', type: 'Private Sector' },
    { name: 'IDBI Bank', shortName: 'IDBI', color: '#0c4a6e', textColor: '#fff', initials: 'IDBI', type: 'Private Sector' },
    // Small Finance Banks
    { name: 'AU Small Finance Bank', shortName: 'AU SFB', color: '#ea580c', textColor: '#fff', initials: 'AU', type: 'Small Finance Bank' },
    { name: 'Capital Small Finance Bank', shortName: 'Capital SFB', color: '#16a34a', textColor: '#fff', initials: 'CSF', type: 'Small Finance Bank' },
    { name: 'Equitas Small Finance Bank', shortName: 'Equitas', color: '#0284c7', textColor: '#fff', initials: 'EQT', type: 'Small Finance Bank' },
    { name: 'ESAF Small Finance Bank', shortName: 'ESAF', color: '#7c3aed', textColor: '#fff', initials: 'ESAF', type: 'Small Finance Bank' },
    { name: 'Suryoday Small Finance Bank', shortName: 'Suryoday', color: '#d97706', textColor: '#fff', initials: 'SRY', type: 'Small Finance Bank' },
    { name: 'Ujjivan Small Finance Bank', shortName: 'Ujjivan', color: '#dc2626', textColor: '#fff', initials: 'UJV', type: 'Small Finance Bank' },
    { name: 'Utkarsh Small Finance Bank', shortName: 'Utkarsh', color: '#059669', textColor: '#fff', initials: 'UTK', type: 'Small Finance Bank' },
    { name: 'Jana Small Finance Bank', shortName: 'Jana', color: '#2563eb', textColor: '#fff', initials: 'JANA', type: 'Small Finance Bank' },
    { name: 'Shivalik Small Finance Bank', shortName: 'Shivalik', color: '#0f766e', textColor: '#fff', initials: 'SHV', type: 'Small Finance Bank' },
    { name: 'Unity Small Finance Bank', shortName: 'Unity', color: '#7c2d12', textColor: '#fff', initials: 'UNT', type: 'Small Finance Bank' },
    { name: 'North East Small Finance Bank', shortName: 'NESFB', color: '#4338ca', textColor: '#fff', initials: 'NEF', type: 'Small Finance Bank' },
    // Payments Banks
    { name: 'Airtel Payments Bank', shortName: 'Airtel', color: '#E40000', textColor: '#fff', initials: 'APB', type: 'Payments Bank' },
    { name: 'India Post Payments Bank', shortName: 'IPPB', color: '#b45309', textColor: '#fff', initials: 'IPPB', type: 'Payments Bank' },
    { name: 'FINO Payments Bank', shortName: 'FINO', color: '#0284c7', textColor: '#fff', initials: 'FINO', type: 'Payments Bank' },
    { name: 'Paytm Payments Bank', shortName: 'Paytm', color: '#00BAF2', textColor: '#fff', initials: 'PTM', type: 'Payments Bank' },
    { name: 'Jio Payments Bank', shortName: 'Jio', color: '#2563eb', textColor: '#fff', initials: 'JIO', type: 'Payments Bank' },
    { name: 'NSDL Payments Bank', shortName: 'NSDL', color: '#065f46', textColor: '#fff', initials: 'NSDL', type: 'Payments Bank' },
    // Foreign Banks in India
    { name: 'HSBC India', shortName: 'HSBC', color: '#be123c', textColor: '#fff', initials: 'HSBC', type: 'Foreign Bank' },
    { name: 'Standard Chartered', shortName: 'StanC', color: '#15803d', textColor: '#fff', initials: 'SC', type: 'Foreign Bank' },
    { name: 'Citibank India', shortName: 'Citi', color: '#003B70', textColor: '#fff', initials: 'CITI', type: 'Foreign Bank' },
    { name: 'Deutsche Bank India', shortName: 'Deutsche', color: '#003189', textColor: '#fff', initials: 'DB', type: 'Foreign Bank' },
    { name: 'DBS Bank India', shortName: 'DBS', color: '#e11d48', textColor: '#fff', initials: 'DBS', type: 'Foreign Bank' },
    { name: 'Bank of America India', shortName: 'BofA', color: '#E31837', textColor: '#fff', initials: 'BOA', type: 'Foreign Bank' },
    // Regional Rural Banks (select major ones)
    { name: 'Andhra Pradesh Grameena Vikas Bank', shortName: 'APGVB', color: '#065f46', textColor: '#fff', initials: 'APGV', type: 'Regional Rural Bank' },
    { name: 'Kerala Gramin Bank', shortName: 'KGB', color: '#166534', textColor: '#fff', initials: 'KGB', type: 'Regional Rural Bank' },
    { name: 'Baroda Gujarat Gramin Bank', shortName: 'BGGB', color: '#f97316', textColor: '#fff', initials: 'BGGB', type: 'Regional Rural Bank' },
    { name: 'Aryavart Bank', shortName: 'Aryavart', color: '#7c2d12', textColor: '#fff', initials: 'ARY', type: 'Regional Rural Bank' },
    { name: 'Prathama UP Gramin Bank', shortName: 'PUGB', color: '#1d4ed8', textColor: '#fff', initials: 'PUG', type: 'Regional Rural Bank' },
  ],
  'United States': [
    { name: 'Chase Bank', shortName: 'Chase', color: '#117ACA', textColor: '#fff', initials: 'JPM', type: 'National Bank' },
    { name: 'Bank of America', shortName: 'BofA', color: '#E31837', textColor: '#fff', initials: 'BOA', type: 'National Bank' },
    { name: 'Wells Fargo', shortName: 'Wells', color: '#CD1409', textColor: '#fff', initials: 'WF', type: 'National Bank' },
    { name: 'Citibank', shortName: 'Citi', color: '#003B70', textColor: '#fff', initials: 'CITI', type: 'National Bank' },
    { name: 'Capital One', shortName: 'CapOne', color: '#D03027', textColor: '#fff', initials: 'C1', type: 'National Bank' },
    { name: 'US Bank', shortName: 'USB', color: '#0C2074', textColor: '#fff', initials: 'USB', type: 'National Bank' },
    { name: 'PNC Bank', shortName: 'PNC', color: '#E04B27', textColor: '#fff', initials: 'PNC', type: 'National Bank' },
    { name: 'Goldman Sachs (Marcus)', shortName: 'Marcus', color: '#2C2C2C', textColor: '#fff', initials: 'GS', type: 'National Bank' },
  ],
  'United Kingdom': [
    { name: 'Barclays', shortName: 'Barclays', color: '#00AEEF', textColor: '#fff', initials: 'BRC', type: 'High Street Bank' },
    { name: 'HSBC UK', shortName: 'HSBC', color: '#DB0011', textColor: '#fff', initials: 'HSBC', type: 'High Street Bank' },
    { name: 'Lloyds Bank', shortName: 'Lloyds', color: '#024731', textColor: '#fff', initials: 'LBG', type: 'High Street Bank' },
    { name: 'NatWest', shortName: 'NatWest', color: '#42145F', textColor: '#fff', initials: 'NW', type: 'High Street Bank' },
    { name: 'Santander UK', shortName: 'Santander', color: '#EC0000', textColor: '#fff', initials: 'SAN', type: 'High Street Bank' },
    { name: 'Monzo', shortName: 'Monzo', color: '#FF5F5D', textColor: '#fff', initials: 'MNZ', type: 'Digital Bank' },
    { name: 'Starling Bank', shortName: 'Starling', color: '#6935D3', textColor: '#fff', initials: 'STR', type: 'Digital Bank' },
  ],
  Default: [
    { name: 'Primary Local Bank', shortName: 'Local', color: '#6B7280', textColor: '#fff', initials: 'BNK', type: 'Bank' },
    { name: 'International Bank', shortName: 'Intl', color: '#374151', textColor: '#fff', initials: 'INT', type: 'Bank' },
  ],
};
