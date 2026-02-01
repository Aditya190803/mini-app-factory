'use client';

import { useUser } from "@stackframe/stack";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DashboardPage() {
  const user = useUser();
  const router = useRouter();
  const projects = useQuery(api.projects.getUserProjects, { userId: user?.id ?? "" });
  const deleteProject = useMutation(api.projects.deleteProject);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

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

  const handleDelete = async (projectName: string) => {
    if (!user) return;
    if (confirm(`Are you sure you want to delete "${projectName}"?`)) {
      setIsDeleting(projectName);
      try {
        await deleteProject({ projectName, userId: user.id });
      } catch (error) {
        console.error("Failed to delete project:", error);
        alert("Failed to delete project. Please try again.");
      } finally {
        setIsDeleting(null);
      }
    }
  };

  if (projects === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent animate-spin" />
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] animate-pulse" style={{ color: 'var(--muted-text)' }}>
            Retrieving Fabrication Units...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--background)' }}>
      {/* Ambient background accent */}
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-[var(--primary)] opacity-[0.03] blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-5xl mx-auto w-full px-6 py-10 flex-1">
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="w-10 h-10 flex items-center justify-center border border-[var(--border)] hover:border-[var(--primary)] text-[var(--secondary-text)] hover:text-[var(--primary)] transition-all"
            >
              ←
            </button>
            <div>
              <h1 className="text-sm font-mono uppercase font-black tracking-[0.4em]" style={{ color: 'var(--foreground)' }}>
                System Dashboard
              </h1>
              <p className="text-[9px] font-mono uppercase tracking-widest mt-1 opacity-50" style={{ color: 'var(--muted-text)' }}>
                Active Production Archive
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 text-[10px] font-mono uppercase bg-[var(--primary)] text-black font-black hover:opacity-90 transition-all"
            >
              + Create New
            </button>
            <button
              onClick={() => user.signOut()}
              className="px-4 py-2 text-[10px] font-mono border border-[var(--border)] uppercase hover:bg-[var(--background-surface)] transition-all"
              style={{ color: 'var(--secondary-text)' }}
            >
              Log Out
            </button>
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="h-[400px] border border-dashed flex flex-col items-center justify-center gap-6" style={{ borderColor: 'var(--border)' }}>
            <div className="w-16 h-16 border flex items-center justify-center text-3xl opacity-20" style={{ borderColor: 'var(--border)' }}>
              ∅
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xs font-mono uppercase font-bold tracking-widest" style={{ color: 'var(--foreground)' }}>
                No Active Fabrications
              </h3>
              <p className="text-[10px] font-mono max-w-xs leading-relaxed" style={{ color: 'var(--muted-text)' }}>
                Your production queue is currently empty. Initialize a new project from the workshop.
              </p>
            </div>
            <button
              onClick={() => router.push('/')}
              className="px-6 py-2 text-[10px] font-mono uppercase border border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)]/10 transition-all font-bold"
            >
              Enter Workshop
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project._id}
                className="group border p-6 bg-[var(--background-surface)] hover:border-[var(--primary)] transition-all relative overflow-hidden"
                style={{ borderColor: 'var(--border)' }}
              >
                <div className="absolute top-0 right-0 w-16 h-16 bg-[var(--primary)] opacity-[0.02] -translate-y-8 translate-x-8 rotate-45" />

                <div className="flex justify-between items-start mb-8">
                  <div>
                    <div className="text-[10px] font-mono uppercase tracking-widest opacity-50 mb-1" style={{ color: 'var(--muted-text)' }}>
                      Identifier
                    </div>
                    <div className="text-sm font-mono font-black" style={{ color: 'var(--foreground)' }}>
                      {project.projectName.toUpperCase()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(project.projectName)}
                    disabled={isDeleting === project.projectName}
                    className="text-[9px] font-mono uppercase opacity-30 group-hover:opacity-100 hover:bg-red-500/10 transition-all px-2 py-1 border border-transparent hover:border-red-500/20"
                    style={{ color: '#ff4444' }}
                  >
                    {isDeleting === project.projectName ? 'Purging...' : 'Purge'}
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between text-[9px] font-mono">
                    <span style={{ color: 'var(--muted-text)' }}>Type</span>
                    <span className="text-[var(--secondary-text)] uppercase">{project.isMultiPage ? 'Multi-Page' : 'Single-Page'}</span>
                  </div>
                  {project.isMultiPage && (
                    <div className="flex items-center justify-between text-[9px] font-mono">
                      <span style={{ color: 'var(--muted-text)' }}>Pages</span>
                      <span className="text-[var(--secondary-text)]">{project.pageCount || 1}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-[9px] font-mono">
                    <span style={{ color: 'var(--muted-text)' }}>Timestamp</span>
                    <span style={{ color: 'var(--secondary-text)' }}>{new Date(project.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t flex gap-2" style={{ borderColor: 'var(--border)' }}>
                  <button
                    onClick={() => router.push(`/edit/${project.projectName}`)}
                    className="flex-1 px-3 py-2 text-[10px] font-mono uppercase font-black bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 transition-all text-center"
                  >
                    Load Editor
                  </button>
                  {project.isPublished && (
                    <button
                      onClick={() => window.open(`/results/${project.projectName}`, '_blank')}
                      className="px-4 py-2 text-[10px] font-mono uppercase border border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)]/10 transition-all font-bold"
                    >
                      View
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
