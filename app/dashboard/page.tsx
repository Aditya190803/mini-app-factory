'use client';

import { useUser } from "@stackframe/stack";
import { usePaginatedQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import AccountMenu from "@/components/account-menu";
import ProjectCard from "@/components/dashboard/project-card";
import RedeployDialog from "@/components/dashboard/redeploy-dialog";
import type { ProjectCardData } from "@/components/dashboard/project-card";

export default function DashboardPage() {
  const user = useUser();
  const router = useRouter();
  const PAGE_SIZE = 12;
  const { results: projects, status, loadMore } = usePaginatedQuery(
    api.projects.getUserProjects,
    user ? { userId: user.id } : "skip",
    { initialNumItems: PAGE_SIZE }
  );
  const isLoading = status === "LoadingFirstPage";
  const hasMore = status === "CanLoadMore";
  const deleteProject = useMutation(api.projects.deleteProject);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [optimisticallyDeleted, setOptimisticallyDeleted] = useState<Set<string>>(new Set());
  const [isRedeployDialogOpen, setIsRedeployDialogOpen] = useState(false);
  const [redeployProject, setRedeployProject] = useState<ProjectCardData | null>(null);

  const handleDelete = (projectName: string) => {
    if (!user) return;
    setDeleteTarget(projectName);
  };

  const confirmDelete = async () => {
    if (!user || !deleteTarget) return;
    const targetName = deleteTarget;
    setDeleteTarget(null);
    setOptimisticallyDeleted(prev => new Set(prev).add(targetName));
    try {
      await deleteProject({ projectName: targetName, userId: user.id });
      toast.success(`"${targetName}" deleted`);
    } catch (error) {
      console.error("Failed to delete project:", error);
      toast.error("Failed to delete project. Please try again.");
      setOptimisticallyDeleted(prev => {
        const next = new Set(prev);
        next.delete(targetName);
        return next;
      });
    } finally {
      setIsDeleting(null);
    }
  };

  const openRedeploy = (project: ProjectCardData) => {
    setRedeployProject(project);
    setIsRedeployDialogOpen(true);
  };

  if (isLoading) {
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

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Unauthorized</h1>
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
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--background)' }}>
      {/* Ambient background accent */}
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-[var(--primary)] opacity-[0.03] blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto w-full px-6 py-8 flex-1">
        <div className="flex items-center justify-between mb-8 relative z-50">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="w-10 h-10 flex items-center justify-center border border-[var(--border)] hover:border-[var(--primary)] text-[var(--secondary-text)] hover:text-[var(--primary)] transition-all"
              aria-label="Go back to home"
            >
              ←
            </button>
            <div>
              <h1 className="text-sm font-mono uppercase font-black tracking-[0.4em]" style={{ color: 'var(--foreground)' }}>
                System Dashboard
              </h1>
              <p className="text-[11px] font-mono uppercase tracking-widest mt-1 opacity-50" style={{ color: 'var(--muted-text)' }}>
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
            <AccountMenu />
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="h-[400px] border border-dashed flex flex-col items-center justify-center gap-6 rounded-lg" style={{ borderColor: 'var(--border)' }}>
            <div className="w-16 h-16 border flex items-center justify-center text-3xl opacity-20 rounded-full" style={{ borderColor: 'var(--border)' }}>
              <span aria-hidden="true">∅</span>
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
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects
                .filter(p => !optimisticallyDeleted.has(p.projectName))
                .map((project) => (
                  <ProjectCard
                    key={project._id}
                    project={project}
                    isDeleting={isDeleting === project.projectName}
                    onDelete={handleDelete}
                    onRedeploy={openRedeploy}
                  />
                ))}
            </div>
            {hasMore && (
              <div className="flex justify-center mt-8">
                <Button
                  variant="outline"
                  onClick={() => loadMore(PAGE_SIZE)}
                  className="font-mono uppercase text-xs tracking-wider border-[var(--border)] text-[var(--secondary-text)] hover:text-[var(--primary)] hover:border-[var(--primary)]"
                >
                  Load more projects
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <RedeployDialog
        open={isRedeployDialogOpen}
        onOpenChange={(open) => {
          setIsRedeployDialogOpen(open);
          if (!open) setRedeployProject(null);
        }}
        project={redeployProject}
        userId={user.id}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="max-w-sm bg-[var(--background)] border-[var(--border)]">
          <DialogHeader>
            <DialogTitle className="text-sm font-mono uppercase font-black tracking-widest text-[var(--foreground)]">
              Confirm Deletion
            </DialogTitle>
            <DialogDescription className="text-xs font-mono text-[var(--muted-text)]">
              Are you sure you want to delete &quot;{deleteTarget}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              className="flex-1 font-mono uppercase text-[10px] border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--background-overlay)]"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmDelete}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-mono uppercase text-[10px] font-black"
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
