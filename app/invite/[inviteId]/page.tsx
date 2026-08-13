'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation } from 'convex/react';
import { useUser } from '@stackframe/stack';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button } from '@/components/ui/button';

export default function InvitePage() {
  const { inviteId } = useParams<{ inviteId: string }>();
  const user = useUser();
  const router = useRouter();
  const accept = useMutation(api.collaboration.acceptInvite);
  const started = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;
    void accept({ inviteId: inviteId as Id<'projectInvites'> }).then(({ projectName }) => router.replace(`/edit/${projectName}`)).catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not accept invitation'));
  }, [accept, inviteId, router, user]);
  if (!user) return <main className="grid min-h-screen place-items-center p-6"><div className="max-w-sm text-center"><h1 className="text-xl font-semibold">Sign in to join this project</h1><p className="mt-2 text-sm text-[var(--muted-text)]">Invitations are bound to the account that accepts them.</p><Button className="mt-5" onClick={() => router.push(`/handler/sign-in?after_auth_return_to=${encodeURIComponent(`/invite/${inviteId}`)}`)}>Sign in</Button></div></main>;
  return <main className="grid min-h-screen place-items-center p-6"><div className="text-center"><h1 className="text-xl font-semibold">{error ? 'Invitation unavailable' : 'Joining project…'}</h1><p className="mt-2 text-sm text-[var(--muted-text)]">{error || 'Applying your access securely.'}</p>{error ? <Button className="mt-5" variant="outline" onClick={() => router.push('/dashboard')}>Back to dashboard</Button> : null}</div></main>;
}
