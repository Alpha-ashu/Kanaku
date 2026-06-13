const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error(' Supabase credentials not found in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

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
        .eq('email', 'Shaik.job.details@gmail.com')
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
      
      // Try to get any data to see what tables exist
      const { error: listError } = await supabase
        .from('User')
        .select('*')
        .limit(1);
      
      if (listError) {
        console.log(`\n Table names might be lowercase. Trying 'users'...`);
      }
      
      process.exit(1);
    }

    if (!users || users.length === 0) {
      console.log(' User not found with that email');
      console.log('\n Listing all users:');
      const { data: allUsers } = await supabase
        .from(tableName)
        .select('email, role, isApproved');
      
      if (allUsers && allUsers.length > 0) {
        allUsers.forEach(u => {
          console.log(`  - ${u.email} (role: ${u.role}, approved: ${u.isApproved})`);
        });
      } else {
        console.log('  No users found');
      }
      process.exit(0);
    }

    const user = users[0];
    console.log(' User found:');
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
      .eq('email', 'Shaik.job.details@gmail.com')
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
