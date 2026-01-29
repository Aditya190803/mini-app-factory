'use client';

import { useUser } from "@stackframe/stack";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";

export default function DashboardPage() {
  const user = useUser();
  const router = useRouter();
  const projects = useQuery(api.projects.getUserProjects, { userId: user?.id ?? "" });

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
        <div className="text-center">
          <h1 className="text-lg font-mono uppercase tracking-widest" style={{ color: 'var(--foreground)' }}>
            Sign in required
          </h1>
          <p className="text-xs mt-2" style={{ color: 'var(--secondary-text)' }}>
            Please sign in to view your dashboard.
          </p>
          <button
            onClick={() => router.push('/handler/sign-in')}
            className="mt-4 px-4 py-2 text-[10px] font-mono uppercase border border-[var(--border)] text-[var(--primary)] hover:border-[var(--primary)]"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-sm font-mono uppercase tracking-[0.3em]" style={{ color: 'var(--foreground)' }}>
            Dashboard
          </h1>
          <button
            onClick={() => user.signOut()}
            className="px-3 py-1 text-[10px] font-mono border border-[var(--border)] uppercase"
            style={{ color: 'var(--secondary-text)' }}
          >
            Sign Out
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(projects ?? []).map((project) => (
            <div key={project._id} className="border p-4" style={{ borderColor: 'var(--border)' }}>
              <div className="text-sm font-mono" style={{ color: 'var(--foreground)' }}>
                {project.projectName}
              </div>
              <div className="text-[10px] mt-1" style={{ color: 'var(--muted-text)' }}>
                {new Date(project.createdAt).toLocaleDateString()}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => router.push(`/edit/${project.projectName}`)}
                  className="px-3 py-1 text-[10px] font-mono uppercase border border-[var(--border)]"
                  style={{ color: 'var(--secondary-text)' }}
                >
                  Edit
                </button>
                {project.isPublished && (
                  <button
                    onClick={() => window.open(`/results/${project.projectName}`, '_blank')}
                    className="px-3 py-1 text-[10px] font-mono uppercase border border-[var(--primary)] text-[var(--primary)]"
                  >
                    View
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
