const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://abmsiyczgmdhsaebjsbk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFibXNpeWN6Z21kaHNhZWJqc2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDY5NTMsImV4cCI6MjA4NTYyMjk1M30._iYMW2hbewo4QS73MMA167BB91ZKSFx6zCmDDZDVLxo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { count, error } = await supabase.from('sales').select('*', { count: 'exact', head: true });
  console.log('Total Sales Count:', count);
  
  if (count > 0) {
    const { data } = await supabase.from('sales').select('order_date, parcel_status').limit(1);
    console.log('Sample Sale:', data[0]);
  }
}

check();
