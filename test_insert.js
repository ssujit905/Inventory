const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://abmsiyczgmdhsaebjsbk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFibXNpeWN6Z21kaHNhZWJqc2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDY5NTMsImV4cCI6MjA4NTYyMjk1M30._iYMW2hbewo4QS73MMA167BB91ZKSFx6zCmDDZDVLxo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('sales')
    .insert([{ 
      order_date: '2026-05-01', 
      customer_name: 'Test', 
      phone1: '1234567890',
      destination_branch: 'KTM',
      parcel_status: 'delivered'
    }])
    .select();
    
  if (error) {
    console.error('Insert Error:', error);
  } else {
    console.log('Insert Success:', data);
    const { count } = await supabase.from('sales').select('*', { count: 'exact', head: true });
    console.log('Total Sales after insert:', count);
  }
}

check();
