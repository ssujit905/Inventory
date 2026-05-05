const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://abmsiyczgmdhsaebjsbk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFibXNpeWN6Z21kaHNhZWJqc2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDY5NTMsImV4cCI6MjA4NTYyMjk1M30._iYMW2hbewo4QS73MMA167BB91ZKSFx6zCmDDZDVLxo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  // This is a hack to get table names if we don't have access to information_schema
  const tables = ['sales', 'website_orders', 'products', 'expenses', 'income_entries', 'transactions', 'product_lots'];
  for (const t of tables) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
    console.log(`Table ${t}: ${count} rows`);
  }
}

check();
