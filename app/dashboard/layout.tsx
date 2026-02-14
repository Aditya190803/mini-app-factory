import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Dashboard — Mini App Factory',
  description: 'Manage your generated projects, deploy to GitHub and Netlify, and track deployments.',
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children
}
