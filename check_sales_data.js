const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://abmsiyczgmdhsaebjsbk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFibXNpeWN6Z21kaHNhZWJqc2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDY5NTMsImV4cCI6MjA4NTYyMjk1M30._iYMW2hbewo4QS73MMA167BB91ZKSFx6zCmDDZDVLxo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase
    .from('sales')
    .select('order_date, parcel_status')
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Last 10 sales:');
  console.table(data);
  
  const { count: delCount } = await supabase.from('sales').select('*', { count: 'exact', head: true }).eq('parcel_status', 'delivered');
  const { count: retCount } = await supabase.from('sales').select('*', { count: 'exact', head: true }).eq('parcel_status', 'returned');
  
  console.log('Total Delivered in DB:', delCount);
  console.log('Total Returned in DB:', retCount);
  
  // Check for this month
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  
  console.log('Checking for month range:', start, 'to', end);
  
  const { count: mDelCount } = await supabase.from('sales').select('*', { count: 'exact', head: true }).eq('parcel_status', 'delivered').gte('order_date', start).lte('order_date', end);
  const { count: mRetCount } = await supabase.from('sales').select('*', { count: 'exact', head: true }).eq('parcel_status', 'returned').gte('order_date', start).lte('order_date', end);
  
  console.log('MTD Delivered:', mDelCount);
  console.log('MTD Returned:', mRetCount);
}

check();
