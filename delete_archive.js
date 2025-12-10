const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '/home/ubuntu/dental-clinic-complete-FINAL/.env' });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteArchive() {
  try {
    console.log('🗑️  Deleting archive for date: 2025-11-30...');
    
    // Update patients: remove archive_date for 2025-11-30
    const { data, error } = await supabase
      .from('patients')
      .update({ archive_date: null })
      .eq('archive_date', '2025-11-30')
      .select();
    
    if (error) {
      console.error('❌ Error:', error);
      return;
    }
    
    console.log('✅ Successfully deleted archive!');
    console.log(`📊 Restored ${data.length} patients to Timeline`);
    
    if (data.length > 0) {
      console.log('\n📋 Restored patients:');
      data.forEach(p => {
        console.log(`  - ${p.name} (Queue: ${p.queue_number})`);
      });
    }
    
  } catch (err) {
    console.error('❌ Fatal error:', err);
  }
}

deleteArchive();
