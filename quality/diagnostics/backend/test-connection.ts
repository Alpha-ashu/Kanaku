
import { supabase } from './supabase';
import dotenv from 'dotenv';

dotenv.config();

async function testConnection() {
  try {
    console.log('Testing Supabase connection...');
    
    // Test basic connection
    const { data, error } = await supabase.from('profiles').select('*').limit(1);
    
    if (error) {
      console.error('Connection failed:', error);
      return;
    }
    
    console.log('Connection successful!');
    console.log('Test query result:', data);
    
    // Test connection details
    console.log('Supabase URL:', process.env.SUPABASE_URL);
    console.log('Supabase Anon Key available:', !!process.env.SUPABASE_ANON_KEY);
    console.log('Supabase Pooler URL available:', !!process.env.SUPABASE_POOLER_URL);
    console.log('Supabase Direct URL available:', !!process.env.SUPABASE_DIRECT_URL);
    
  } catch (error) {
    console.error('Connection test failed:', error);
  }
}

testConnection();
