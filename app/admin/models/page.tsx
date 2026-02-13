import { redirect } from 'next/navigation';
import { stackServerApp } from '@/stack/server';
import { isAdminEmail } from '@/lib/admin-access';
import AIModelManagement from '@/components/admin/ai-model-management';

export default async function AdminModelsPage() {
  const user = await stackServerApp.getUser();

  if (!user) {
    redirect('/handler/sign-in');
  }

  if (!isAdminEmail(user.primaryEmail)) {
    redirect('/settings');
  }

  return <AIModelManagement />;
}
