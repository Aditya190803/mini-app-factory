'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';
import { ProjectFile } from '@/lib/page-builder';
import { Badge, Button, Field, Input, Textarea } from '@/components/kit';
import { cn } from '@/lib/utils';

interface MetadataDashboardProps {
  projectId?: Id<"projects">;
  projectName: string;
  files?: ProjectFile[];
  onClose?: () => void;
}

export default function MetadataDashboard({ projectId, projectName, files: initialFiles, onClose }: MetadataDashboardProps) {
  const project = useQuery(api.projects.getProject, { projectName });
  const updateMetadata = useMutation(api.projects.updateMetadata);
  
  const [isSaving, setIsSaving] = useState(false);
  const [showStatus, setShowStatus] = useState<'success' | 'error' | null>(null);
  const [favicon, setFavicon] = useState('');
  const [globalSeo, setGlobalSeo] = useState({
    siteName: '',
    description: '',
    ogImage: ''
  });
  const [seoData, setSeoData] = useState<Array<{
    path: string;
    title?: string;
    description?: string;
    ogImage?: string;
  }>>([]);

  const isPartial = (path: string) => {
    const p = path.toLowerCase();
    return p.includes('header.html') || 
           p.includes('footer.html') || 
           p.includes('nav.html') || 
           p.includes('layout.html') || 
           p.includes('.css') || 
           p.includes('.js') ||
           p.includes('.json');
  };

  const pages = (initialFiles || []).filter(f => !isPartial(f.path) && (f.fileType === 'page' || f.path.endsWith('.html')));

  useEffect(() => {
    if (project) {
      setFavicon(project.favicon || '🏭');
      setGlobalSeo({
        siteName: project.globalSeo?.siteName || '',
        description: project.globalSeo?.description || '',
        ogImage: project.globalSeo?.ogImage || ''
      });
      setSeoData(project.seoData || []);
    }
  }, [project]);

  const handleUpdateSeo = (path: string, field: string, value: string) => {
    setSeoData(prev => {
      const existing = prev.find(s => s.path === path);
      if (existing) {
        return prev.map(s => s.path === path ? { ...s, [field]: value } : s);
      }
      return [...prev, { path, [field]: value }];
    });
  };

  const save = async () => {
    if (!projectId) return;
    setIsSaving(true);
    try {
      await updateMetadata({
        projectId: projectId,
        favicon,
        globalSeo,
        seoData
      });
      setShowStatus('success');
      setTimeout(() => {
        setShowStatus(null);
        if (onClose) onClose();
      }, 2000);
    } catch (err) {
      console.error(err);
      setShowStatus('error');
      setTimeout(() => setShowStatus(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const getPageSeo = (path: string) => {
    return seoData.find(s => s.path === path) || { path };
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="key mb-3">Site wide</p>
        <div className="grid gap-4 sm:grid-cols-[6rem_minmax(0,1fr)]">
          <Field
            label="Favicon"
            hint="One emoji"
          >
            <Input
              value={favicon}
              maxLength={4}
              onChange={(event) => setFavicon(event.target.value)}
              className="text-center text-lg"
            />
          </Field>

          <div className="space-y-4">
            <Field
              label="Site name"
              hint="Appended to every page title."
            >
              <Input
                value={globalSeo.siteName}
                onChange={(event) => setGlobalSeo((prev) => ({ ...prev, siteName: event.target.value }))}
                placeholder={projectName}
              />
            </Field>

            <Field
              label="Default description"
              hint="Used for any page that does not set its own. Aim for 150 to 160 characters."
              aside={
                <span
                  className={cn(
                    'tabular text-xs',
                    globalSeo.description.length > 160
                      ? 'text-[var(--warning-text)]'
                      : 'text-[var(--muted-foreground)]'
                  )}
                >
                  {globalSeo.description.length}/160
                </span>
              }
            >
              <Textarea
                value={globalSeo.description}
                onChange={(event) =>
                  setGlobalSeo((prev) => ({ ...prev, description: event.target.value }))
                }
                placeholder="What this site is, in one sentence."
                className="min-h-16"
              />
            </Field>

            <Field
              label="Default social image"
              optional
              hint="An absolute URL. Shown when a link to this site is shared."
            >
              <Input
                value={globalSeo.ogImage}
                onChange={(event) => setGlobalSeo((prev) => ({ ...prev, ogImage: event.target.value }))}
                placeholder="https://example.com/preview.png"
                className="font-mono"
              />
            </Field>
          </div>
        </div>
      </div>

      <div>
        <p className="key mb-3">Per page</p>

        {pages.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No pages yet. Metadata appears here once the project has HTML files.
          </p>
        ) : (
          <div className="space-y-px overflow-hidden rounded-lg border border-[var(--rule)]">
            {pages.map((page) => {
              const seo = getPageSeo(page.path);
              const description = seo.description || '';
              const inherited = !seo.title && !description;

              return (
                <details
                  key={page.path}
                  className="group bg-[var(--surface-1)] open:bg-[var(--surface-2)]"
                >
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--surface-2)]">
                    <span className="inline-block h-3 w-[3px] shrink-0 rounded-[1px] bg-[var(--rule-strong)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-sm">{page.path}</span>
                      <span className="block truncate text-xs text-[var(--muted-foreground)]">
                        {seo.title || 'No title set'}
                      </span>
                    </span>
                    {inherited ? (
                      <Badge tone="neutral">inherits</Badge>
                    ) : (
                      <Badge tone="live">set</Badge>
                    )}
                  </summary>

                  <div className="space-y-4 border-t border-[var(--rule)] px-3 py-4">
                    <Field
                      label="Title"
                      hint="Around 60 characters before search results truncate it."
                      aside={
                        <span
                          className={cn(
                            'tabular text-xs',
                            (seo.title || '').length > 60
                              ? 'text-[var(--warning-text)]'
                              : 'text-[var(--muted-foreground)]'
                          )}
                        >
                          {(seo.title || '').length}/60
                        </span>
                      }
                    >
                      <Input
                        value={seo.title || ''}
                        onChange={(event) => handleUpdateSeo(page.path, 'title', event.target.value)}
                        placeholder={globalSeo.siteName || projectName}
                      />
                    </Field>

                    <Field
                      label="Description"
                      aside={
                        <span
                          className={cn(
                            'tabular text-xs',
                            description.length > 160
                              ? 'text-[var(--warning-text)]'
                              : 'text-[var(--muted-foreground)]'
                          )}
                        >
                          {description.length}/160
                        </span>
                      }
                    >
                      <Textarea
                        value={description}
                        onChange={(event) =>
                          handleUpdateSeo(page.path, 'description', event.target.value)
                        }
                        placeholder={globalSeo.description || 'Falls back to the site description.'}
                        className="min-h-16"
                      />
                    </Field>

                    <Field label="Social image" optional>
                      <Input
                        value={seo.ogImage || ''}
                        onChange={(event) =>
                          handleUpdateSeo(page.path, 'ogImage', event.target.value)
                        }
                        placeholder={globalSeo.ogImage || 'https://example.com/preview.png'}
                        className="font-mono"
                      />
                    </Field>

                    {/* A real search preview, so the character counts above have
                        something to be about. */}
                    <div className="rounded-md border border-[var(--rule)] bg-[var(--background)] p-3">
                      <p className="key mb-2">How it will read</p>
                      <p className="truncate text-[15px] text-[var(--info-text)]">
                        {seo.title || globalSeo.siteName || projectName}
                      </p>
                      <p className="truncate font-mono text-xs text-[var(--success-text)]">
                        {page.path === 'index.html' ? '/' : `/${page.path.replace(/\.html$/, '')}`}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-[var(--muted-foreground)]">
                        {description || globalSeo.description || 'No description set.'}
                      </p>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3">
        {showStatus === 'success' && (
          <span className="text-sm text-[var(--success-text)]" role="status">
            Saved
          </span>
        )}
        {showStatus === 'error' && (
          <span className="text-sm text-[var(--destructive-text)]" role="alert">
            Could not save
          </span>
        )}
        <Button intent="primary" busy={isSaving} onClick={() => void save()}>
          Save metadata
        </Button>
      </div>
    </div>
  );
}
