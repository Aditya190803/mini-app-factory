import { NextResponse } from 'next/server';
import { stackServerApp } from '@/stack/server';
import { isVerifiedAdmin } from '@/lib/admin-access';

export async function GET() {
  const user = await stackServerApp.getUser();
  if (!user) {
    return NextResponse.json({ authenticated: false, isAdmin: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    isAdmin: isVerifiedAdmin(user.primaryEmail, user.primaryEmailVerified),
    email: user.primaryEmail,
  });
}
