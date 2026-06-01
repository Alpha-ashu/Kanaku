// Supabase connection test utility

import supabase from '@/utils/supabase/client';

// Test 1: Simple Query
async function testQuery() {
  console.log('\n Test 1: Querying database...');
  try {
    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .limit(5);
    
    if (error) {
      console.log('  Query error:', error.message);
      console.log(' This is normal if the "todos" table doesn\'t exist yet');
      
      // Try to list all tables
      const { data: tables, error: tablesError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public');
        
      if (!tablesError && tables) {
        console.log(' Available tables:', tables.map((t: any) => t.table_name));
      }
    } else {
      console.log(' Query successful!');
      console.log(' Data:', data);
    }
  } catch (err) {
    console.error(' Test failed:', err);
  }
}

// Test 2: Authentication
async function testAuth() {
  console.log('\n Test 2: Checking auth...');
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      console.log('  Auth error:', error.message);
    } else {
      console.log(' Auth module working');
      console.log('Session:', session ? 'Active' : 'No active session');
    }
  } catch (err) {
    console.error(' Auth test failed:', err);
  }
}

// Test 3: Connection Status
async function testConnection() {
  console.log('\n Test 3: Connection status...');
  try {
    const { data, error } = await supabase.rpc('version');
    
    if (error) {
      console.log('  RPC error:', error.message);
      console.log(' This is normal - trying alternative connection test...');
      
      // Alternative: Try to access auth
      const { error: healthError } = await supabase.auth.getSession();
      if (!healthError) {
        console.log(' Connection to Supabase is working!');
      }
    } else {
      console.log(' Database connection verified!');
      console.log('PostgreSQL version:', data);
    }
  } catch (err) {
    console.error(' Connection test failed:', err);
  }
}

// Run all tests
export async function runAllTests() {
  console.log(' Starting Supabase Connection Tests...\n');
  await testConnection();
  await testAuth();
  await testQuery();
  console.log('\n All tests completed!');
}

// Auto-run in development
if (import.meta.env.DEV) {
  runAllTests().catch(console.error);
}

export { testQuery, testAuth, testConnection };
