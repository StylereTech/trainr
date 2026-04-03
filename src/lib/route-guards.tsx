import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/auth'

export async function requireAuth(allowedRoles?: string[]) {
  const session = await getServerSession()

  if (!session?.user) {
    redirect('/auth/signin')
  }

  const role = (session.user as any).role as string | undefined

  if (allowedRoles?.length && (!role || !allowedRoles.includes(role))) {
    redirect('/dashboard')
  }

  return session
}

export async function redirectIfAuthenticated() {
  const session = await getServerSession()
  if (session?.user) {
    redirect('/dashboard')
  }
}
