import { redirect } from 'next/navigation'

export default function SignupPage() {
  // Signup is disabled - redirect to login
  redirect('/auth/login')
}
