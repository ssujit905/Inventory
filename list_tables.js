const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://abmsiyczgmdhsaebjsbk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFibXNpeWN6Z21kaHNhZWJqc2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDY5NTMsImV4cCI6MjA4NTYyMjk1M30._iYMW2hbewo4QS73MMA167BB91ZKSFx6zCmDDZDVLxo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('website_orders').select('id').limit(1);
  console.log('website_orders sample:', data);
  
  const { data: sales, error: err2 } = await supabase.from('sales').select('id').limit(1);
  console.log('sales sample:', sales);
}

check();
