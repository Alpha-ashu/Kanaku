const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(' Supabase credentials not found in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@kanaku.com';

async function updateUserToAdmin() {
  try {
    console.log(' Checking user in Supabase...');
    
    // Try different table names
    let users = null;
    let error = null;
    let tableName = 'User';
    
    for (const tname of ['User', 'users', '"User"', 'public.User']) {
      const { data: result, error: err } = await supabase
        .from(tname)
        .select('id, email, name, role, isApproved')
        .eq('email', adminEmail)
        .limit(1);
      
      if (!err) {
        users = result;
        tableName = tname;
        break;
      }
      error = err;
    }

    if (error && (!users || users.length === 0)) {
      console.error(' Error fetching user:', error.message);
      console.log('\n Trying to list all tables...');
      const { data: tables, error: tableError } = await supabase
        .rpc('get_tables'); // custom RPC if exists
      if (!tableError && tables) {
        console.log('Available tables:', tables);
      }
      process.exit(1);
    }

    if (!users || users.length === 0) {
      console.log(`\n User ${adminEmail} not found in Table '${tableName}'`);
      process.exit(1);
    }

    const user = users[0];
    console.log('\n User details found:');
    console.log(`  ID: ${user.id}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Name: ${user.name}`);
    console.log(`  Current Role: ${user.role}`);
    console.log(`  Approved: ${user.isApproved}`);

    if (user.role === 'admin' && user.isApproved) {
      console.log('\n User already has admin role and is approved!');
      process.exit(0);
    }

    console.log('\n  Updating user to admin role...');
    
    const { data: updatedUser, error: updateError } = await supabase
      .from(tableName)
      .update({ role: 'admin', isApproved: true })
      .eq('email', adminEmail)
      .select('email, role, isApproved');

    if (updateError) {
      console.error(' Error updating user:', updateError.message);
      process.exit(1);
    }

    console.log(' User successfully updated to admin!');
    if (updatedUser && updatedUser.length > 0) {
      console.log(`  New Role: ${updatedUser[0].role}`);
      console.log(`  New Approved Status: ${updatedUser[0].isApproved}`);
    }

    console.log('\n Please re-login to see admin features');
    process.exit(0);
  } catch (error) {
    console.error(' Unexpected error:', error.message);
    process.exit(1);
  }
}

updateUserToAdmin();
