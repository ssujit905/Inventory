// Supabase Edge Function: send-otp-whatsapp
// Deploy this to your Supabase project to send real WhatsApp messages!

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (req) => {
  const { phone } = await req.json()
  
  // 1. Generate a 6-digit OTP
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString()
  
  // 2. Initialize Supabase
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  // 3. Store OTP in database (expires in 5 minutes)
  const { error: dbError } = await supabase
    .from('website_otps')
    .upsert({ 
      phone: phone, 
      otp_code: otpCode, 
      expires_at: new Date(Date.now() + 5 * 60000).toISOString() 
    })

  if (dbError) return new Response(JSON.stringify({ error: dbError.message }), { status: 500 })

  // 4. SEND WHATSAPP MESSAGE (Example using Twilio)
  // Replace these with your actual Twilio / Meta / WATI credentials
  /*
  const accountSid = Deno.env.get('TWILIO_ACCOUNT_SID');
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN');
  const fromWhatsApp = 'whatsapp:+14155238886'; // Twilio Sandbox or your number
  
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      'To': `whatsapp:+977${phone}`,
      'From': fromWhatsApp,
      'Body': `Your Shopy Nepal reset code is: ${otpCode}. It expires in 5 minutes.`
    })
  });
  */

  // For now, we return success so you can see how it works
  return new Response(JSON.stringify({ 
    success: true, 
    message: 'OTP generated and stored. (API call commented out)',
    debug_code: otpCode // Remove this in production!
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
