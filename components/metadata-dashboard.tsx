'use client';

import React, { useState, useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { ProjectFile } from '@/lib/page-builder';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Globe, Info, Layout, Smile, AlertTriangle, Settings2, Box } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";

interface MetadataDashboardProps {
  projectId: any;
  projectName: string;
  files?: ProjectFile[];
  onClose?: () => void;
}

export default function MetadataDashboard({ projectId, projectName, files: initialFiles, onClose }: MetadataDashboardProps) {
  const project = useQuery(api.projects.getProject, { projectName });
  const updateMetadata = useMutation(api.projects.updateMetadata);
  
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
    try {
      await updateMetadata({
        projectId,
        favicon,
        globalSeo,
        seoData
      });
      alert('Project Configuration Synced!');
    } catch (err) {
      console.error(err);
      alert('Sync Failed');
    }
  };

  const getPageSeo = (path: string) => {
    return seoData.find(s => s.path === path) || { path };
  };

  return (
    <div className="flex flex-col h-[70vh] bg-[var(--background)] font-mono text-xs">
      <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
        <Tabs defaultValue="global" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-[var(--background-overlay)] border border-[var(--border)] h-12 p-1">
            <TabsTrigger value="global" className="data-[state=active]:bg-[var(--primary)] data-[state=active]:text-black font-black uppercase text-[10px]">
              <Settings2 className="w-4 h-4 mr-2" />
              Global Settings
            </TabsTrigger>
            <TabsTrigger value="pages" className="data-[state=active]:bg-[var(--primary)] data-[state=active]:text-black font-black uppercase text-[10px]">
              <Layout className="w-4 h-4 mr-2" />
              Page Overrides ({pages.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="global" className="mt-6 space-y-8 animate-in fade-in slide-in-from-bottom-2">
            <section className="space-y-4">
              <div className="flex items-center gap-2 text-[var(--primary)] font-black uppercase tracking-widest text-[10px]">
                <Smile className="w-3 h-3" />
                Browser Identity
              </div>
              <div className="flex items-center gap-4 bg-[var(--background-overlay)] p-4 border border-[var(--border)] rounded-sm">
                <div className="w-16 h-16 flex-shrink-0 flex items-center justify-center bg-[var(--background)] border border-[var(--border)] rounded text-3xl shadow-inner">
                  {favicon.startsWith('http') ? <img src={favicon} alt="favicon" className="w-10 h-10 object-contain" /> : favicon}
                </div>
                <div className="flex-1 space-y-2">
                  <p className="text-[9px] text-[var(--muted-text)] uppercase font-bold tracking-tighter">Project Favicon (Emoji or URL)</p>
                  <Input 
                    value={favicon}
                    onChange={(e) => setFavicon(e.target.value)}
                    placeholder="e.g. ⚡️ or https://cdn.com/icon.png"
                    className="bg-[var(--background)] border-[var(--border)] h-9 text-xs font-mono focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-[var(--primary)] font-black uppercase tracking-widest text-[10px]">
                <Globe className="w-3 h-3" />
                Default Meta Configuration
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[9px] uppercase text-[var(--muted-text)] font-bold">Base Site Name</label>
                  <Input 
                    value={globalSeo.siteName}
                    onChange={(e) => setGlobalSeo({...globalSeo, siteName: e.target.value})}
                    placeholder="e.g. Acme Corp"
                    className="bg-[var(--background-overlay)] border-[var(--border)] h-9 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] uppercase text-[var(--muted-text)] font-bold">Default OG Image</label>
                  <Input 
                    value={globalSeo.ogImage}
                    onChange={(e) => setGlobalSeo({...globalSeo, ogImage: e.target.value})}
                    placeholder="https://..."
                    className="bg-[var(--background-overlay)] border-[var(--border)] h-9 text-xs"
                  />
                </div>
                <div className="md:col-span-2 space-y-2">
                  <label className="text-[9px] uppercase text-[var(--muted-text)] font-bold">Global Description (Fallback)</label>
                  <Textarea 
                    value={globalSeo.description}
                    onChange={(e) => setGlobalSeo({...globalSeo, description: e.target.value})}
                    placeholder="Describe your site for search engines..."
                    className="bg-[var(--background-overlay)] border-[var(--border)] text-xs h-24 resize-none"
                  />
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="pages" className="mt-6 space-y-4 animate-in fade-in slide-in-from-bottom-2">
            {pages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 border border-dashed border-[var(--border)] bg-[var(--background-overlay)] rounded-sm">
                <AlertTriangle className="w-8 h-8 text-[var(--muted-text)] mb-2" />
                <p className="text-[var(--muted-text)] uppercase text-[10px]">No configurable pages detected</p>
              </div>
            ) : (
              pages.map(page => {
                const data = getPageSeo(page.path);
                const isMissing = !data.title || !data.description;
                
                return (
                  <div 
                    key={page.path} 
                    className={cn(
                      "p-4 border rounded-sm space-y-4 bg-[var(--background-overlay)] transition-colors",
                      isMissing ? "border-yellow-500/20" : "border-[var(--border)]"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Box className="w-3 h-3 text-[var(--primary)]" />
                        <span className="font-bold text-[var(--foreground)] text-[10px] tracking-tight">{page.path}</span>
                      </div>
                      {isMissing && (
                        <div className="flex items-center gap-1 text-yellow-500 uppercase text-[8px] font-black px-2 py-0.5 border border-yellow-500/30 bg-yellow-500/5 rounded-full">
                          Unoptimized
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-[9px] uppercase text-[var(--muted-text)]">Page Title</label>
                        <Input 
                          value={data.title || ''}
                          onChange={(e) => handleUpdateSeo(page.path, 'title', e.target.value)}
                          placeholder={globalSeo.siteName ? `${globalSeo.siteName} | ...` : "Title Override"}
                          className="bg-[var(--background)] border-[var(--border)] h-8 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] uppercase text-[var(--muted-text)]">OG Image URL</label>
                        <Input 
                          value={data.ogImage || ''}
                          onChange={(e) => handleUpdateSeo(page.path, 'ogImage', e.target.value)}
                          placeholder={globalSeo.ogImage || "https://..."}
                          className="bg-[var(--background)] border-[var(--border)] h-8 text-xs"
                        />
                      </div>
                      <div className="md:col-span-2 space-y-1">
                        <label className="text-[9px] uppercase text-[var(--muted-text)]">Meta Description</label>
                        <Textarea 
                          value={data.description || ''}
                          onChange={(e) => handleUpdateSeo(page.path, 'description', e.target.value)}
                          placeholder={globalSeo.description || "Description Override"}
                          className="bg-[var(--background)] border-[var(--border)] text-xs h-16 resize-none"
                        />
                        <div className="flex justify-end">
                          <span className={cn(
                            "text-[8px] font-black uppercase",
                            (data.description?.length || 0) > 160 ? "text-red-500" : "text-[var(--muted-text)]"
                          )}>
                            {(data.description?.length || 0)} / 160
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>
        </Tabs>
      </div>

      <div className="p-4 border-t border-[var(--border)] bg-[var(--background-overlay)] flex justify-between items-center">
        <div className="flex items-center gap-2 text-[var(--muted-text)] text-[9px] uppercase font-bold">
          <Info className="w-3 h-3" />
          Changes apply to production builds
        </div>
        <div className="flex gap-2">
          {onClose && (
            <Button 
              variant="ghost" 
              onClick={onClose}
              className="h-9 px-6 text-[10px] font-black uppercase text-[var(--muted-text)]"
            >
              Cancel
            </Button>
          )}
          <Button 
            onClick={save}
            className="h-9 px-8 bg-[var(--primary)] text-black font-black uppercase text-[10px] shadow-[4px_4px_0px_rgba(var(--primary-rgb),0.2)] hover:translate-y-[-1px] transition-transform"
          >
            Deploy Metadata
          </Button>
        </div>
      </div>
    </div>
  );
}
