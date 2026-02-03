import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://abmsiyczgmdhsaebjsbk.supabase.co'
const SUPABASE_Key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFibXNpeWN6Z21kaHNhZWJqc2JrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAwNDY5NTMsImV4cCI6MjA4NTYyMjk1M30._iYMW2hbewo4QS73MMA167BB91ZKSFx6zCmDDZDVLxo'

const supabase = createClient(SUPABASE_URL, SUPABASE_Key)

async function createAdmin() {
    console.log('Attempting to create admin user...')

    const email = 'ssujit905@gmail.com'
    const password = 'Sujitsam@1'

    // 1. Try to Sign In first (since user might exist)
    let { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })

    // If sign in fails, try signing up
    if (error) {
        console.log('User not found, signing up...')
        const signUpResult = await supabase.auth.signUp({
            email,
            password,
        })
        data = signUpResult.data
        error = signUpResult.error
    }

    if (error) {
        console.error('Error authenticating:', error.message)
        return
    }

    const user = data.user
    const session = data.session

    if (!user) {
        console.error('User creation failed (no user returned).')
        return
    }

    console.log('User created with ID:', user.id)

    if (!session) {
        console.warn('WARNING: No session returned. Email confirmation might be required.')
        console.warn('Cannot automatically insert Profile row safely via Client (RLS requires active session).')
        console.warn('Please check your email to confirm, specifically for:', email)
        return
    }

    // 2. Insert Profile
    console.log('Session active. Attempting to create Admin Profile...')

    const { error: profileError } = await supabase
        .from('profiles')
        .insert([
            {
                id: user.id,
                role: 'admin',
                full_name: 'Admin User'
            }
        ])

    if (profileError) {
        console.error('Error creating profile:', profileError.message)
        console.log('Tip: Does the "profiles" table exist? Did you run the schema SQL?')
    } else {
        console.log('SUCCESS: Admin profile created!')
    }
}

createAdmin()
