import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/server/auth';

export default async function RootPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  redirect(session ? '/home' : '/register');
}
