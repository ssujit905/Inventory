const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './desktop/.env' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function run() {
  const { data: lots } = await supabase.from('product_lots').select('id, product_id, quantity_received, quantity_remaining').order('id', { ascending: false }).limit(10);
  console.log("Lots:", lots);

  const { data: txs } = await supabase.from('transactions').select('id, type, quantity_changed, sale_id').order('created_at', { ascending: false }).limit(10);
  console.log("Transactions:", txs);

  const { data: views } = await supabase.from('website_variant_stock_view').select('current_stock, parent_product_id').order('current_stock', { ascending: false }).limit(5);
  console.log("Views:", views);
}
run();
