import { redirect } from 'next/navigation';
import { stackServerApp } from '@/stack/server';
import { isAdminEmail } from '@/lib/admin-access';
import AIAdminConsole from '@/components/admin/ai-admin-console';

export default async function AdminPage() {
  const user = await stackServerApp.getUser();

  if (!user) {
    redirect('/handler/sign-in');
  }

  if (!isAdminEmail(user.primaryEmail)) {
    redirect('/settings');
  }

  return <AIAdminConsole />;
}
