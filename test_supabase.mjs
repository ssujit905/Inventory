import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, 'desktop', '.env') });
dotenv.config({ path: join(__dirname, 'desktop', '.env.local') });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.log("NO URL OR KEY");
  process.exit(1);
}

const supabase = createClient(url, key);

async function run() {
  const { data: orders } = await supabase.from('website_orders').select('id').order('created_at', { ascending: false }).limit(1);
  if (!orders || orders.length === 0) return console.log("No orders found");
  
  const testId = orders[0].id;
  console.log("Triggering RPC for order ID:", testId);
  console.log("Order data:", orders[0]);
  
  const { data, error } = await supabase.rpc('process_website_order_stock', { p_order_id: testId });
  if (error) {
    console.log("RPC ERROR STATS:");
    console.log("Message:", error.message);
    console.log("Details:", error.details);
    console.log("Hint:", error.hint);
  } else {
    console.log("RPC SUCCESS:", data);
  }
}

run();
