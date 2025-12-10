const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkClinicsTable() {
  try {
    // Try to query the clinics table
    const { data, error } = await supabase
      .from('clinics')
      .select('*')
      .limit(1);
    
    if (error) {
      console.log('❌ Clinics table does not exist or error:', error.message);
      console.log('Need to create clinics table');
      return false;
    }
    
    console.log('✅ Clinics table exists!');
    console.log('Sample data:', data);
    return true;
  } catch (err) {
    console.error('Error:', err);
    return false;
  }
}

checkClinicsTable();
