import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function Home() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) {
      // If there's an auth error, redirect to login
      console.warn('Auth error on home page:', error.message)
      redirect('/auth/login')
    }

    if (user) {
      redirect('/dashboard')
    } else {
      redirect('/auth/login')
    }
  } catch (error) {
    console.error('Error checking auth on home page:', error)
    redirect('/auth/login')
  }
}


