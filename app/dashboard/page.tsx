import { redirect } from 'next/navigation'

/** Kept so old /dashboard bookmarks and typed URLs still land on Projects. */
export default function DashboardRedirect() {
  redirect('/projects')
}
