'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Search, 
  Menu, 
  ArrowLeft, 
  Zap, 
  Eye, 
  Copy, 
  AlertTriangle, 
  Check
} from 'lucide-react';
import Link from 'next/link';
import { FactoryIcon } from "@/components/ui/factory-icon";

const SidebarItem = ({ title, active, onClick }: { title: string, active?: boolean, onClick?: () => void }) => (
  <li>
    <button 
      onClick={onClick}
      className={`sidebar-item w-full text-left px-3 py-2 text-xs font-medium rounded-md ${active ? 'active' : ''}`}
    >
      {title}
    </button>
  </li>
);

const CodeBlock = ({ filename, code }: { filename: string, code: string }) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-block-container group my-6 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2">
        <span className="tech-label">{filename}</span>
        <button
          onClick={copyToClipboard}
          aria-label={copied ? 'Copied to clipboard' : `Copy ${filename}`}
          className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
      </div>
      <pre className="overflow-x-auto bg-muted/30 p-6 font-mono text-sm text-foreground">
        <code>{code}</code>
      </pre>
    </div>
  );
};

export default function DocsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [activeId, setActiveId] = useState('introduction');

  const sidebarSections = useMemo(() => ([
    {
      id: '01',
      title: 'Getting started',
      items: [
        { id: 'introduction', label: 'Introduction' },
        { id: 'quick-start', label: 'Quick Start Guide' },
        { id: 'architecture', label: 'Architecture Specs' }
      ]
    },
    {
      id: '02',
      title: 'Command reference',
      items: [
        { id: 'cmd-generate', label: '/generate' },
        { id: 'cmd-transform', label: '/transform' },
        { id: 'cmd-polish', label: '/polish' },
        { id: 'tool-schema', label: 'Tool Call Schema' }
      ]
    },
    {
      id: '03',
      title: 'Build and deploy',
      items: [
        { id: 'model-selection', label: 'Model Selection' },
        { id: 'editor-preview', label: 'Editor & Preview' },
        { id: 'publish-export', label: 'Export' },
        { id: 'deploy', label: 'Deploy' },
        { id: 'project-settings', label: 'Project Settings' }
      ]
    }
  ]), []);

  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sidebarSections;
    return sidebarSections
      .map(section => ({
        ...section,
        items: section.items.filter(item => item.label.toLowerCase().includes(q))
      }))
      .filter(section => section.items.length > 0);
  }, [searchQuery, sidebarSections]);

  const visibleItemIds = useMemo(() => {
    return new Set(filteredSections.flatMap(section => section.items.map(item => item.id)));
  }, [filteredSections]);

  const scrollToId = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', `#${id}`);
      setActiveId(id);
      setIsSidebarOpen(false);
    }
  };

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      setActiveId(hash);
    }
  }, []);

  useEffect(() => {
    const ids = sidebarSections.flatMap(section => section.items.map(item => item.id));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target?.id) {
          setActiveId(visible.target.id);
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: [0, 0.1, 0.5, 1] }
    );

    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sidebarSections]);

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <nav className="fixed top-0 z-50 w-full border-b border-border bg-background/80 backdrop-blur-md">
        <div className="px-6 py-3 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                aria-label="Toggle docs navigation"
                className="inline-flex items-center rounded-lg p-2 text-sm text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:hidden"
              >
                <Menu className="w-5 h-5" />
              </button>
              <Link href="/" className="flex items-center gap-2.5 rounded-md">
                <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <FactoryIcon size={18} />
                </span>
                <span className="text-[15px] font-semibold tracking-tight">Mini App Factory</span>
                <span className="tech-label hidden opacity-60 sm:inline">Docs</span>
              </Link>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/" className="inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <ArrowLeft className="size-3.5" />
                Back to home
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <aside
        className={`fixed left-0 top-0 z-40 h-screen w-72 border-r border-border bg-background pt-20 transition-transform sm:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="h-full px-4 pb-4 overflow-y-auto custom-scrollbar">
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search docs…"
              aria-label="Search docs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
            />
          </div>

          <ul className="space-y-6">
            {filteredSections.map((section) => (
              <li key={section.id}>
                <span className="tech-label mb-3 block px-3">{section.id} · {section.title}</span>
                <ul className="space-y-1">
                  {section.items.map((item) => (
                    <SidebarItem 
                      key={item.id} 
                      title={item.label} 
                      active={activeId === item.id} 
                      onClick={() => scrollToId(item.id)}
                    />
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Main Content */}
      <div className="p-4 sm:ml-72 pt-24 pb-20">
        <div className="max-w-3xl mx-auto px-4 lg:px-8">
          <motion.article 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="mb-10">
              <span className="tech-label text-primary">Documentation</span>
              <h1 className="mb-6 mt-2 text-4xl font-semibold tracking-tight">System documentation</h1>
              <p className="text-lg leading-relaxed text-muted-foreground">
                This documentation reflects what is currently implemented and working in Mini App Factory.
              </p>
            </div>

            <div className="my-12 h-px w-full bg-border" />

            {visibleItemIds.has('introduction') && (
              <section id="introduction" className="space-y-6 scroll-mt-24">
                <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                  <span className="w-6 h-6 rounded flex items-center justify-center bg-primary/10 text-primary text-xs font-mono">01</span>
                  Introduction
                </h2>
                <p className="text-muted-foreground">
                  Mini App Factory generates multi-file static websites from a single prompt, then lets you iterate with AI transforms, manual code edits, and a live preview.
                </p>
                <div className="grid gap-4">
                  <div className="p-6 technical-border rounded-xl bg-card space-y-4">
                    <div className="flex items-start gap-4">
                      <Zap className="w-5 h-5 text-primary shrink-0 mt-1" />
                      <div>
                        <h4 className="text-sm font-semibold">Generate</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Create a project from a prompt. The system outputs multiple HTML files with shared partials when appropriate.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="p-6 technical-border rounded-xl bg-card space-y-4">
                    <div className="flex items-start gap-4">
                      <Eye className="w-5 h-5 text-primary shrink-0 mt-1" />
                      <div>
                        <h4 className="text-sm font-semibold">Iterate</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Use transform prompts, targeted element edits, and polish passes to refine the output.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {visibleItemIds.has('quick-start') && (
              <section id="quick-start" className="space-y-6 mt-12 scroll-mt-24">
                <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                  <span className="w-6 h-6 rounded flex items-center justify-center bg-primary/10 text-primary text-xs font-mono">02</span>
                  Quick Start Guide
                </h2>
                <p className="text-muted-foreground">
                  Create a project, wait for the generation pipeline, then iterate in the editor.
                </p>
                <CodeBlock 
                  filename="Example_Prompt.txt"
                  code={`A minimalist dashboard for a satellite telemetry system.
Use a dark palette with neon cyan accents.
Include a real-time clock and status indicators in the header.
Add data visualization cards in the main grid.`}
                />
                <div className="p-6 border-l-2 border-primary bg-primary/5 rounded-r-xl">
                  <div className="flex items-center gap-3 mb-2">
                    <AlertTriangle className="w-4 h-4 text-primary" />
                    <span className="tech-label text-primary">Tip</span>
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Include layout, tone, and content constraints to get consistent structure and better first-pass output.
                  </p>
                </div>
              </section>
            )}

            {visibleItemIds.has('architecture') && (
              <section id="architecture" className="space-y-6 mt-12 scroll-mt-24">
                <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                  <span className="w-6 h-6 rounded flex items-center justify-center bg-primary/10 text-primary text-xs font-mono">03</span>
                  Architecture Specs
                </h2>
                <p className="text-muted-foreground">
                  The pipeline is: prompt → design spec → multi-file HTML output → editor transforms → polish → publish or export.
                </p>
                <div className="grid gap-4">
                  <div className="p-6 technical-border rounded-xl bg-card space-y-3">
                    <h4 className="text-sm font-semibold">Storage</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Projects and files are stored in Convex. Editor changes sync automatically while you work.
                    </p>
                  </div>
                  <div className="p-6 technical-border rounded-xl bg-card space-y-3">
                    <h4 className="text-sm font-semibold">Multi-file Output</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Generated sites can include shared partials like `partials/header.html` and `partials/footer.html`.
                    </p>
                  </div>
                </div>
              </section>
            )}

            {visibleItemIds.has('cmd-generate') && (
              <section id="cmd-generate" className="space-y-6 mt-12 scroll-mt-24">
                <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                  <span className="w-6 h-6 rounded flex items-center justify-center bg-primary/10 text-primary text-xs font-mono">04</span>
                  /generate
                </h2>
                <p className="text-muted-foreground">
                  Generates a project from a prompt. Returns multiple files as code blocks which are parsed into the editor.
                </p>
                <CodeBlock 
                  filename="Request_Payload.json"
                  code={`{
  "prompt": "Build a retro-futurist landing page for a robotics lab",
  "projectName": "robotics-lab"
}`}
                />
              </section>
            )}

            {visibleItemIds.has('cmd-transform') && (
              <section id="cmd-transform" className="space-y-6 mt-12 scroll-mt-24">
                <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                  <span className="w-6 h-6 rounded flex items-center justify-center bg-primary/10 text-primary text-xs font-mono">05</span>
                  /transform
                </h2>
                <p className="text-muted-foreground">
                  Applies targeted edits to the current project files. You can optionally include the active file and a selected element.
                </p>
                <CodeBlock 
                  filename="Request_Payload.json"
                  code={`{
  "files": [/* full project file list */],
  "prompt": "Make the hero headline tighter and add a gradient underline",
  "activeFile": "index.html"
}`}
                />
              </section>
            )}

            {visibleItemIds.has('cmd-polish') && (
              <section id="cmd-polish" className="space-y-6 mt-12 scroll-mt-24">
                <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                  <span className="w-6 h-6 rounded flex items-center justify-center bg-primary/10 text-primary text-xs font-mono">06</span>
                  /polish
                </h2>
                <p className="text-muted-foreground">
                  Runs a structured refinement pass for typography, motion, and responsive layout using the transform engine.
                </p>
                <CodeBlock 
                  filename="Request_Payload.json"
                  code={`{
  "files": [/* full project file list */],
  "polishDescription": "improve typography hierarchy, add subtle animations, refine mobile spacing"
}`}
                />
              </section>
            )}

            {visibleItemIds.has('tool-schema') && (
              <section id="tool-schema" className="space-y-6 mt-12 scroll-mt-24">
                <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                  <span className="w-6 h-6 rounded flex items-center justify-center bg-primary/10 text-primary text-xs font-mono">07</span>
                  Tool Call Schema
                </h2>
                <p className="text-muted-foreground">
                  Transform operations are executed through structured tool calls. Each call must be a JSON object with a tool name and args.
                </p>
                <CodeBlock
                  filename="Tool_Call_Example.json"
                  code={`[
  { "tool": "replaceContent", "args": { "file": "index.html", "selector": "h1", "newContent": "Hello" } },
  { "tool": "updateStyle", "args": { "selector": ".hero", "properties": { "gap": "24px" }, "action": "merge" } }
]`}
                />
                <div className="space-y-2 text-muted-foreground text-sm">
                  <div className="font-semibold text-foreground">Constraints</div>
                  <ul className="list-disc pl-6">
                    <li>File paths must be relative (no leading slash, no <code className="font-mono">..</code> segments).</li>
                    <li>Supported file types: <code className="font-mono">.html</code>, <code className="font-mono">.css</code>, <code className="font-mono">.js</code>.</li>
                    <li>Use partials for shared layout: <code className="font-mono">header.html</code> and <code className="font-mono">footer.html</code>.</li>
                    <li>Selectors should be specific (IDs/classes over tag names).</li>
                  </ul>
                </div>
              </section>
            )}

            {visibleItemIds.has('model-selection') && (
              <section id="model-selection" className="space-y-6 mt-12 scroll-mt-24">
                <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                  <span className="w-6 h-6 rounded flex items-center justify-center bg-primary/10 text-primary text-xs font-mono">08</span>
                  Model Selection
                </h2>
                <p className="text-muted-foreground">
                  The editor lets you choose the provider and model for transforms. Vision-capable models are tagged in the selector.
                </p>
              </section>
            )}

            {visibleItemIds.has('editor-preview') && (
              <section id="editor-preview" className="space-y-6 mt-12 scroll-mt-24">
                <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                  <span className="w-6 h-6 rounded flex items-center justify-center bg-primary/10 text-primary text-xs font-mono">09</span>
                  Editor & Preview
                </h2>
                <p className="text-muted-foreground">
                  Edit files directly, switch between preview/code/split views, and preview multi-page navigation.
                </p>
                <p className="text-muted-foreground text-sm">
                  Undo/redo, quick open, and file tree navigation are available in the editor.
                </p>
              </section>
            )}

            {visibleItemIds.has('publish-export') && (
              <section id="publish-export" className="space-y-6 mt-12 scroll-mt-24">
                <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                  <span className="w-6 h-6 rounded flex items-center justify-center bg-primary/10 text-primary text-xs font-mono">10</span>
                  Export ZIP
                </h2>
                <p className="text-muted-foreground">
                  Export your project as a ZIP with all files and a generated README.
                </p>
              </section>
            )}

            {visibleItemIds.has('deploy') && (
              <section id="deploy" className="space-y-6 mt-12 scroll-mt-24">
                <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                  <span className="w-6 h-6 rounded flex items-center justify-center bg-primary/10 text-primary text-xs font-mono">11</span>
                  Deploy
                </h2>
                <p className="text-muted-foreground">
                  Deployment lets you publish a live URL directly from the editor. Choose the deploy option that fits your workflow, then follow the prompts to connect any required accounts and confirm your publish settings.
                </p>
                <p className="text-muted-foreground text-sm">
                  After a successful deploy, the editor displays the live URL and repository link (when applicable) so you can share or continue iterating.
                </p>
                <p className="text-muted-foreground text-sm">
                  Use the dashboard to redeploy or export at any time without re-opening the editor.
                </p>
              </section>
            )}

            {visibleItemIds.has('project-settings') && (
              <section id="project-settings" className="space-y-6 mt-12 scroll-mt-24">
                <h2 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
                  <span className="w-6 h-6 rounded flex items-center justify-center bg-primary/10 text-primary text-xs font-mono">12</span>
                  Project Settings
                </h2>
                <p className="text-muted-foreground">
                  Project settings live at <code className="font-mono">/edit/[projectName]/settings</code>, including deployment info and metadata/SEO controls.
                </p>
              </section>
            )}

          </motion.article>
        </div>
      </div>

    </div>
  );
}
