'use client';

import { useUser } from "@stackframe/stack";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { 
  Trash2, 
  ExternalLink, 
  Settings2, 
  Code2, 
  Calendar, 
  Layers, 
  Layout,
  Globe,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";

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
          <div className="h-[400px] border border-dashed flex flex-col items-center justify-center gap-6 rounded-lg" style={{ borderColor: 'var(--border)' }}>
            <div className="w-16 h-16 border flex items-center justify-center text-3xl opacity-20 rounded-full" style={{ borderColor: 'var(--border)' }}>
              ∅
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xs font-mono uppercase font-bold tracking-widest text-[var(--foreground)]">
                No Active Fabrications
              </h3>
              <p className="text-[10px] font-mono max-w-xs leading-relaxed text-[var(--muted-text)]">
                Your production queue is currently empty. Initialize a new project from the workshop.
              </p>
            </div>
            <Button
              onClick={() => router.push('/')}
              className="px-6 h-9 font-mono uppercase border border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)]/10 transition-all font-bold"
              variant="outline"
            >
              Enter Workshop <ArrowRight className="ml-2 w-3 h-3" />
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <div
                key={project._id}
                className="group relative flex flex-col bg-[var(--background-surface)] border border-[var(--border)] rounded-sm hover:border-[var(--primary)] transition-all duration-300"
              >
                <div className="p-6 flex-1">
                  <div className="flex justify-between items-start mb-6">
                    <div className="space-y-1">
                      <h2 className="text-sm font-mono font-black text-[var(--foreground)] tracking-tight group-hover:text-[var(--primary)] transition-colors">
                        {project.projectName.toUpperCase()}
                      </h2>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 gap-px bg-[var(--border)]/30 border border-[var(--border)]/30 mb-6 overflow-hidden rounded-sm">
                    <div className="bg-[var(--background-surface)] p-3 space-y-1">
                      <div className="flex items-center gap-1.5 opacity-50">
                        <Layout className="w-2.5 h-2.5" />
                        <span className="text-[8px] font-mono uppercase">Topology</span>
                      </div>
                      <div className="text-[9px] font-mono uppercase font-bold text-[var(--secondary-text)]">
                        {project.isMultiPage ? 'Multi' : 'Single'}
                      </div>
                    </div>
                    <div className="bg-[var(--background-surface)] p-3 space-y-1">
                      <div className="flex items-center gap-1.5 opacity-50">
                        <Layers className="w-2.5 h-2.5" />
                        <span className="text-[8px] font-mono uppercase">Modules</span>
                      </div>
                      <div className="text-[9px] font-mono font-bold text-[var(--secondary-text)]">
                        {project.pageCount || 1} Nodes
                      </div>
                    </div>
                    <div className="bg-[var(--background-surface)] p-3 space-y-1 col-span-2">
                      <div className="flex items-center gap-1.5 opacity-50">
                        <Calendar className="w-2.5 h-2.5" />
                        <span className="text-[8px] font-mono uppercase">Last Sync</span>
                      </div>
                      <div className="text-[9px] font-mono font-bold text-[var(--secondary-text)]">
                        {new Date(project.createdAt).toLocaleDateString(undefined, { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(project.projectName)}
                      disabled={isDeleting === project.projectName}
                      className="h-8 flex-1 text-red-500/60 hover:text-red-500 hover:bg-red-500/5 text-[9px] font-mono uppercase px-0"
                    >
                      <Trash2 className="w-3 h-3 mr-2" />
                      Decom
                    </Button>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="p-3 border-t border-[var(--border)] bg-[var(--background)]/50 grid grid-cols-4 gap-2">
                  <Button
                    onClick={() => router.push(`/edit/${project.projectName}`)}
                    className="col-span-2 h-9 bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 font-mono uppercase text-[10px] font-black rounded-none shadow-[2px_2px_0px_rgba(var(--primary-rgb),0.1)]"
                  >
                    Launch
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/dashboard/${project.projectName}/metadata`)}
                    className="h-9 border-[var(--border)] text-[var(--secondary-text)] hover:border-[var(--primary)] hover:text-[var(--primary)] font-mono uppercase text-[10px] font-bold rounded-none"
                    title="Metadata & SEO"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!project.isPublished}
                    onClick={() => window.open(`/results/${project.projectName}`, '_blank')}
                    className="h-9 border-[var(--border)] text-[var(--secondary-text)] hover:border-[var(--primary)] hover:text-[var(--primary)] font-mono uppercase text-[10px] font-bold rounded-none disabled:opacity-20"
                    title="View Live Site"
                  >
                    <Globe className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
