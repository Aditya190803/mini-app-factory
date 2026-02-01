'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import MetadataDashboard from '@/components/metadata-dashboard';
import { Spinner } from '@/components/ui/spinner';
import { ProjectFile } from '@/lib/page-builder';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ProjectMetadataPage() {
  const params = useParams();
  const router = useRouter();
  const projectName = params.projectName as string;

  const project = useQuery(api.projects.getProject, { projectName });
  const files = useQuery(api.files.getFilesByProject, 
    project?._id ? { projectId: project._id } : "skip"
  );

  if (!project || !files) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <Spinner />
      </div>
    );
  }

  // Type cast Convex files to ProjectFile
  const formattedFiles: ProjectFile[] = (files as any[]).map(f => ({
    path: f.path,
    content: f.content,
    language: f.language as any,
    fileType: f.fileType as any
  }));

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      <header className="h-16 border-b border-[var(--border)] flex items-center px-6 justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => router.push('/dashboard')}
            className="hover:bg-[var(--background-overlay)]"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-xs font-mono uppercase font-black tracking-widest text-[var(--foreground)]">
              {projectName}
            </h1>
            <p className="text-[9px] font-mono uppercase text-[var(--muted-text)]">
              SEO & Favicon Settings
            </p>
          </div>
        </div>
        
        <Button 
          variant="outline" 
          onClick={() => router.push(`/edit/${projectName}`)}
          className="border-[var(--border)] font-mono uppercase text-[10px] h-8"
        >
          Open in Editor
        </Button>
      </header>
      
      <main className="flex-1 max-w-4xl mx-auto w-full py-10">
        <MetadataDashboard 
          projectId={project._id}
          projectName={projectName}
          files={formattedFiles}
        />
      </main>
    </div>
  );
}
