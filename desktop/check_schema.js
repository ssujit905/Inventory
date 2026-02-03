import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '')

async function checkSchema() {
    const { data, error } = await supabase
        .from('sales')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching sales:', error);
    } else {
        console.log('Sample sale record:', data[0]);
    }
}

checkSchema();
