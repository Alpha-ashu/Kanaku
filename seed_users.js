/**
 * SEED USERS SCRIPT
 * Run this locally with: node seed_users.js
 * This script will create the 4 required role-based users in your Supabase project.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from project root
dotenv.config({ path: path.resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(' Error: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in your .env file.');
  console.log('Current URL:', supabaseUrl || 'MISSING');
  console.log('Current Key:', supabaseServiceKey ? `${supabaseServiceKey.substring(0, 10)}...` : 'MISSING');
  process.exit(1);
}

console.log(' Connecting to:', supabaseUrl);
console.log(' Using Service Key starting with:', supabaseServiceKey.substring(0, 10));

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const testUsers = [
  { email: 'admin@KANAKU.com', password: 'Admin@2026!k', role: 'admin', name: 'System Admin' },
  { email: 'manager@KANAKU.com', password: 'Manager@2026!k', role: 'manager', name: 'Compliance Manager' },
  { email: 'advisor@KANAKU.com', password: 'Advisor@2026!k', role: 'advisor', name: 'Senior Advisor' },
  { email: 'user@KANAKU.com', password: 'User@2026!k', role: 'user', name: 'Premium Client' }
];

async function seed() {
  console.log(' Starting user seeding process...');

  for (const userData of testUsers) {
    console.log(`\nChecking user: ${userData.email}...`);

    try {
      // 1. Check if user exists in Auth
      const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) throw listError;

      let user = authUsers.users.find(u => u.email === userData.email);

      if (!user) {
        console.log(`  Creating auth user: ${userData.email}...`);
        const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
          email: userData.email,
          password: userData.password,
          email_confirm: true,
          user_metadata: { role: userData.role, full_name: userData.name }
        });
        
        if (createError) throw createError;
        user = newUser.user;
        console.log(`   Auth user created: ${user.id}`);
      } else {
        console.log(`  User already exists in Auth: ${user.id}`);
        // Ensure password and metadata are correct
        await supabase.auth.admin.updateUserById(user.id, { 
          password: userData.password,
          user_metadata: { role: userData.role, full_name: userData.name }
        });
        console.log('   Password and metadata updated/confirmed.');
      }

      // 2. Ensure user exists in public.users table
      console.log(`  Syncing role in public.users table...`);
      const { error: dbError } = await supabase
        .from('User')
        .upsert({
          id: user.id,
          email: userData.email,
          role: userData.role,
          name: userData.name,
          status: 'active'
        }, { onConflict: 'email' });

      if (dbError) throw dbError;
      console.log(`   Successfully synced ${userData.role} role.`);

    } catch (error) {
      console.error(`   Error processing ${userData.email}:`, error.message);
    }
  }

  console.log('\n Seeding complete! You can now login with the credentials provided.');
}

seed();
