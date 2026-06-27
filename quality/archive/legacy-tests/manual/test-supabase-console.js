/**
 * Quick Browser Console Test for Supabase
 * 
 * Open browser console (F12) and paste this code to test your Supabase connection
 * 
 * Usage:
 * 1. Open http://localhost:5173 in your browser
 * 2. Open Developer Console (F12)
 * 3. Paste this entire code
 * 4. Press Enter
 */

// Test Supabase Connection
(async function testSupabase() {
  console.log('%c Supabase Connection Test', 'font-size: 16px; font-weight: bold; color: #3B82F6');
  console.log(''.repeat(50));

  // Import Supabase dynamically
  try {
    const { createClient } = await import('@supabase/supabase-js');
    
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

    if (!supabaseUrl || !supabaseKey) {
      console.error(' VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY must be set.');
      return;
    }

    console.log(' URL:', supabaseUrl);
    console.log(' Key:', ' Configured');
    console.log(''.repeat(50));

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Test 1: Auth Check
    console.log('%c Test 1: Auth Module', 'font-weight: bold; color: #10B981');
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.log('  Auth warning:', error.message);
      } else {
        console.log(' Auth module working');
        console.log('   Session:', session ? ' Active' : ' No active session');
      }
    } catch (err) {
      console.error(' Auth failed:', err);
    }

    // Test 2: Database Query
    console.log('\n%c Test 2: Database Query', 'font-weight: bold; color: #8B5CF6');
    try {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .limit(5);
      
      if (error) {
        console.log('  Query error:', error.message);
        console.log(' This is expected if "todos" table doesn\'t exist');
        console.log('   Error code:', error.code);
        
        if (error.code === '42P01') {
          console.log('    Connection working! Just need to create tables.');
        }
      } else {
        console.log(' Query successful!');
        console.log('   Records found:', data?.length || 0);
        if (data && data.length > 0) {
          console.table(data);
        }
      }
    } catch (err) {
      console.error(' Query failed:', err);
    }

    // Test 3: Realtime
    console.log('\n%c Test 3: Realtime Connection', 'font-weight: bold; color: #F59E0B');
    try {
      const channel = supabase.channel('test-channel');
      const status = channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log(' Realtime connected!');
          channel.unsubscribe();
        }
      });
      
      setTimeout(() => {
        console.log('  Realtime connection: timeout (this is OK)');
      }, 3000);
    } catch (err) {
      console.log('  Realtime test skipped:', err);
    }

    console.log('\n' + ''.repeat(50));
    console.log('%c Connection test complete!', 'font-size: 14px; font-weight: bold; color: #10B981');
    console.log('\n Next steps:');
    console.log('   1. Create tables in Supabase Dashboard');
    console.log('   2. Enable Row Level Security');
    console.log('   3. Start building your app!');
    console.log('\n Open your Supabase Dashboard to manage your project');
    
  } catch (err) {
    console.error(' Test failed to load:', err);
    console.log('\n Make sure you have @supabase/supabase-js installed:');
    console.log('   npm install @supabase/supabase-js');
  }
})();
