/**
 * SEED USERS SCRIPT
 * Run this locally with: node scripts/seed_users.js
 *
 * Creates / refreshes the 4 role-based demo accounts in Supabase Auth and the
 * backend User table.  Each account gets a full profile (dateOfBirth, jobType,
 * salary, etc.) so the onboarding wizard is skipped on first login.
 *
 * Prerequisites — set in .env at the project root:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const supabaseUrl        = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
  process.exit(1);
}

console.log('Connecting to:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Demo account definitions
// Passwords: 18-20 chars · uppercase · lowercase · digits · multiple symbols
// ---------------------------------------------------------------------------
const TEST_USERS = [
  {
    email:       'admin@kanku.com',
    password:    'K@n4ku_Adm!n#2Xz9$',
    role:        'admin',
    isApproved:  true,
    firstName:   'Arjun',
    lastName:    'Mehta',
    name:        'Arjun Mehta',
    gender:      'male',
    dateOfBirth: '1985-03-15',
    jobType:     'Full-time Employment',
    salary:      1800000,
    country:     'India',
    state:       'Maharashtra',
    city:        'Mumbai',
    avatarId:    'new-7',
  },
  {
    email:       'manager@kanku.com',
    password:    'K@n4ku_M4n4g3r#7Qw8$',
    role:        'manager',
    isApproved:  true,
    firstName:   'Priya',
    lastName:    'Sharma',
    name:        'Priya Sharma',
    gender:      'female',
    dateOfBirth: '1990-07-22',
    jobType:     'Full-time Employment',
    salary:      1200000,
    country:     'India',
    state:       'Karnataka',
    city:        'Bengaluru',
    avatarId:    'new-10',
  },
  {
    email:        'advisor@kanku.com',
    password:     'K@n4ku_Adv!s0r#5Tz6^',
    role:         'advisor',
    isApproved:   true,
    advisorStatus:'AVAILABLE',
    firstName:    'Vikram',
    lastName:     'Nair',
    name:         'Vikram Nair',
    gender:       'male',
    dateOfBirth:  '1988-11-05',
    jobType:      'Self-employed',
    salary:       2400000,
    country:      'India',
    state:        'Kerala',
    city:         'Kochi',
    avatarId:     'new-13',
  },
  {
    email:       'user@kanku.com',
    password:    'K@n4ku_Us3r#3Pm2*Wy',
    role:        'user',
    isApproved:  true,
    firstName:   'Ananya',
    lastName:    'Patel',
    name:        'Ananya Patel',
    gender:      'female',
    dateOfBirth: '1995-05-30',
    jobType:     'Freelance',
    salary:      600000,
    country:     'India',
    state:       'Gujarat',
    city:        'Ahmedabad',
    avatarId:    'new-6',
  },
];

// ---------------------------------------------------------------------------
// Avatar URL helper (mirrors avatar-gallery.ts logic)
// ---------------------------------------------------------------------------
const AVATAR_STYLE_MAP = {
  'new-1':  'avataaars', 'new-2':  'avataaars', 'new-3':  'avataaars',
  'new-4':  'avataaars', 'new-5':  'avataaars', 'new-6':  'avataaars',
  'new-7':  'avataaars', 'new-8':  'avataaars', 'new-9':  'avataaars',
  'new-10': 'avataaars', 'new-11': 'micah',     'new-12': 'micah',
  'new-13': 'micah',     'new-14': 'micah',     'new-15': 'micah',
  'new-16': 'micah',     'new-17': 'lorelei',   'new-18': 'lorelei',
  'new-19': 'lorelei',   'new-20': 'lorelei',   'new-21': 'big-smile',
  'new-22': 'big-smile', 'new-23': 'big-smile', 'new-24': 'big-smile',
  'new-25': 'bottts',    'new-26': 'bottts',    'new-27': 'bottts',
  'new-28': 'bottts',
};
const AVATAR_SEED_MAP = {
  'new-7': 'Atticus', 'new-10': 'Amara', 'new-13': 'Orion', 'new-6': 'Lyra',
};

function avatarUrl(id) {
  const style = AVATAR_STYLE_MAP[id] || 'avataaars';
  const seed  = AVATAR_SEED_MAP[id] || id;
  return `/api/v1/avatars/dicebear/${style}/svg?seed=${encodeURIComponent(seed)}`;
}

// ---------------------------------------------------------------------------
// Main seeding logic
// ---------------------------------------------------------------------------
async function seed() {
  console.log('\nStarting user seeding...\n');

  const { data: authList, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) { console.error('Cannot list auth users:', listErr.message); process.exit(1); }

  for (const u of TEST_USERS) {
    console.log(`Processing: ${u.email} (${u.role})`);

    try {
      // ── 1. Auth user ──────────────────────────────────────────────────────
      let authUser = authList.users.find(a => a.email?.toLowerCase() === u.email.toLowerCase());

      const metadata = {
        role:                 u.role,
        full_name:            u.name,
        first_name:           u.firstName,
        last_name:            u.lastName,
        onboarding_completed: true,        // skips profile-setup wizard
      };

      if (!authUser) {
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email:          u.email,
          password:       u.password,
          email_confirm:  true,
          user_metadata:  metadata,
        });
        if (createErr) throw createErr;
        authUser = created.user;
        console.log(`  Created auth user  → ${authUser.id}`);
      } else {
        await supabase.auth.admin.updateUserById(authUser.id, {
          password:      u.password,
          user_metadata: metadata,
        });
        console.log(`  Updated auth user  → ${authUser.id}`);
      }

      // ── 2. Backend User table ─────────────────────────────────────────────
      const { error: dbErr } = await supabase
        .from('User')
        .upsert(
          {
            id:             authUser.id,
            email:          u.email,
            name:           u.name,
            role:           u.role,
            status:         'active',
            isApproved:     u.isApproved ?? false,
            advisorStatus:  u.advisorStatus ?? 'NOT_AVAILABLE',
            firstName:      u.firstName,
            lastName:       u.lastName,
            gender:         u.gender,
            dateOfBirth:    new Date(u.dateOfBirth).toISOString(),
            jobType:        u.jobType,
            salary:         u.salary,
            country:        u.country,
            state:          u.state,
            city:           u.city,
            avatarId:       u.avatarId,
            updatedAt:      new Date().toISOString(),
          },
          { onConflict: 'email' },
        );

      if (dbErr) throw dbErr;
      console.log(`  Upserted User row  → role=${u.role}, city=${u.city}`);

      // ── 3. UserSettings (currency, language) ─────────────────────────────
      const { error: settingsErr } = await supabase
        .from('UserSettings')
        .upsert(
          {
            userId:      authUser.id,
            currency:    'INR',
            language:    'en',
            updatedAt:   new Date().toISOString(),
          },
          { onConflict: 'userId' },
        );

      if (settingsErr) {
        console.warn(`  UserSettings upsert skipped (table may differ): ${settingsErr.message}`);
      } else {
        console.log(`  Upserted UserSettings → INR / en`);
      }

      console.log(`  Done: ${u.email}\n`);
    } catch (err) {
      console.error(`  Error processing ${u.email}: ${err.message}\n`);
    }
  }

  console.log('========================================');
  console.log('Seeding complete!');
  console.log('========================================');
  console.log('');
  console.log('Demo credentials (keep private):');
  console.log('');
  for (const u of TEST_USERS) {
    console.log(`  ${u.role.padEnd(8)}  ${u.email.padEnd(24)}  ${u.password}`);
  }
  console.log('');
}

seed();
