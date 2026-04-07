import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Read .env manually
const envPath = path.resolve('.env')
const envContent = fs.readFileSync(envPath, 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
    const [key, ...value] = line.split('=')
    if (key && value) {
        env[key.trim()] = value.join('=').trim()
    }
})

const supabaseUrl = env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function diagnose() {
    console.log('--- Extensive Database Diagnostics ---')
    const tables = [
        'profiles', 'products', 'product_lots', 'sales', 'transactions', 
        'expenses', 'website_products', 'website_product_images', 
        'website_product_variations', 'website_orders'
    ];
    
    for (const table of tables) {
        try {
            const { count, error } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true })
            
            if (error) {
                console.log(`- ${table}: Error or Not Accessible (${error.message})`)
            } else {
                console.log(`- ${table}: ${count} rows`)
            }
        } catch (e) {
            console.log(`- ${table}: Exception (${e.message})`)
        }
    }
}

diagnose()
