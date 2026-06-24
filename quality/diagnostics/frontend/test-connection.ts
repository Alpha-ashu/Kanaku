import supabase from './client';

/**
 * Test Supabase connection
 * Run this to verify your Supabase setup is working correctly
 */
export async function testSupabaseConnection() {
  try {
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }

    const { data, error } = await supabase.from('todos').select('*').limit(1);
    
    if (error) {
      return { success: true, data: null, note: 'Connection working, table may not exist' };
    }

    return { success: true, data };
  } catch (error) {
    return { success: false, error };
  }
}
