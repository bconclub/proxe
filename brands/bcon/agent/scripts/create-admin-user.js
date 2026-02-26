// Script to create admin user
// Run with: node scripts/create-admin-user.js
// Make sure to set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function createAdminUser() {
  const email = 'proxeadmin@proxe.com'
  const password = 'proxepass'

  try {
    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: 'PROXe Admin'
      }
    })

    if (authError) {
      console.error('Error creating auth user:', authError)
      return
    }

    console.log('✅ Auth user created:', authData.user.id)

    // Update dashboard_users table to set admin role
    const { data: dashboardData, error: dashboardError } = await supabase
      .from('dashboard_users')
      .update({ role: 'admin' })
      .eq('id', authData.user.id)
      .select()

    if (dashboardError) {
      console.error('Error updating dashboard user:', dashboardError)
      return
    }

    console.log('✅ Admin user created successfully!')
    console.log('Email:', email)
    console.log('Password:', password)
    console.log('User ID:', authData.user.id)
    console.log('Role:', dashboardData[0]?.role || 'admin')

  } catch (error) {
    console.error('Error:', error)
  }
}

createAdminUser()

