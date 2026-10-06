import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('ERROR: Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment.')
    console.error('Usage: SUPABASE_URL=... SUPABASE_ANON_KEY=... ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/create-admin.js')
    process.exit(1)
}

const email = process.env.ADMIN_EMAIL || process.argv[2]
const password = process.env.ADMIN_PASSWORD || process.argv[3]

if (!email || !password) {
    console.error('ERROR: Admin email and password must be provided via environment variables or CLI arguments.')
    console.error('Usage: ADMIN_EMAIL="admin@example.com" ADMIN_PASSWORD="secure_password" node scripts/create-admin.js')
    console.error('   or: node scripts/create-admin.js "admin@example.com" "secure_password"')
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function createAdmin() {
    console.log(`Attempting to set up admin user: ${email}...`)

    // 1. Try to Sign In first (if user already exists)
    let { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    // If sign in fails, try signing up
    if (error) {
        console.log('User not found or credentials mismatched, attempting sign up...')
        const signUpResult = await supabase.auth.signUp({
            email,
            password,
        })
        data = signUpResult.data
        error = signUpResult.error
    }

    if (error) {
        console.error('Error authenticating:', error.message)
        process.exit(1)
    }

    const user = data.user
    const session = data.session

    if (!user) {
        console.error('User creation failed (no user returned).')
        process.exit(1)
    }

    console.log('User authenticated with ID:', user.id)

    if (!session) {
        console.warn('WARNING: No session returned. Email confirmation may be required.')
        console.warn('Please confirm the email if required by Supabase settings.')
        return
    }

    // 2. Insert or update Admin Profile
    console.log('Ensuring Admin Profile exists...')

    const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
            id: user.id,
            role: 'admin',
            full_name: 'Admin User',
            email: email
        })

    if (profileError) {
        console.error('Error creating profile:', profileError.message)
        process.exit(1)
    } else {
        console.log('SUCCESS: Admin profile verified and ready!')
    }
}

createAdmin().catch((err) => {
    console.error('Fatal error creating admin:', err)
    process.exit(1)
})
