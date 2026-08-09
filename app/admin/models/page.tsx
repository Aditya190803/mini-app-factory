import { redirect } from 'next/navigation';
import { stackServerApp } from '@/stack/server';
import { isAdminUser } from '@/lib/admin-access';
import AIModelManagement from '@/components/admin/ai-model-management';

export default async function AdminModelsPage() {
  const user = await stackServerApp.getUser();

  if (!user) {
    redirect('/handler/sign-in');
  }

  if (!isAdminUser(user)) {
    redirect('/settings');
  }

  return <AIModelManagement />;
}
