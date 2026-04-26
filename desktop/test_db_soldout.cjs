const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://abmsiyczgmdhsaebjsbk.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFibXNpeWN6Z21kaHNhZWJqc2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDY5NTMsImV4cCI6MjA4NTYyMjk1M30._iYMW2hbewo4QS73MMA167BB91ZKSFx6zCmDDZDVLxo';
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: products, error } = await supabase.from('website_products').select('title, is_sold_out');
    if (error) {
        console.error("Error fetching products:", error);
        return;
    }
    const soldOut = products.filter(p => p.is_sold_out === true);
    console.log(`Total Products: ${products.length}`);
    console.log(`Sold Out Products: ${soldOut.length}`);
    if (soldOut.length > 0) {
        console.log("Sold out list:", soldOut.map(p => p.title).join(', '));
    }
}
run();
