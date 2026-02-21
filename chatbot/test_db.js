const { createClient } = require('@supabase/supabase-js');
const supabase = createClient("https://abmsiyczgmdhsaebjsbk.supabase.co", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFibXNpeWN6Z21kaHNhZWJqc2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDY5NTMsImV4cCI6MjA4NTYyMjk1M30._iYMW2hbewo4QS73MMA167BB91ZKSFx6zCmDDZDVLxo");

async function run() {
    const { data, error } = await supabase.from('settings').select('*');
    if (data) {
        console.log(JSON.stringify(data));
    }
    if (error) console.error('Error:', error);
}
run();
