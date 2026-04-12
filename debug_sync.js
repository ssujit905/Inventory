import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

// Read config from desktop app to get supabase url and key
const file = fs.readFileSync('desktop/src/lib/supabase.ts', 'utf8');
const urlMatch = file.match(/supabaseUrl = ['"]([^'"]+)['"]/);
const keyMatch = file.match(/supabaseAnonKey = ['"]([^'"]+)['"]/);

if (urlMatch && keyMatch) {
  const supabase = createClient(urlMatch[1], keyMatch[1]);
  
  async function test() {
    console.log("Checking last 2 orders...");
    const { data: orders, error: ordersError } = await supabase
      .from('website_orders')
      .select('id, created_at, customer_name, total_amount')
      .order('created_at', { ascending: false })
      .limit(2);
      
    if (ordersError) { console.error(ordersError); return; }
    
    for (const o of orders) {
      console.log('Order:', o);
      const { data: items } = await supabase
        .from('website_order_items')
        .select('*')
        .eq('order_id', o.id);
      console.log('Items:', items);
      
      const { data: sales, error: salesError } = await supabase.rpc('process_website_order_stock', { p_order_id: o.id });
      console.log('RPC execution for order', o.id, 'returned:', salesError || sales);
    }
  }
  
  test();
}
