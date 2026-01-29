'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface PreviewPanelProps {
  html: string;
}

export default function PreviewPanel({ html }: PreviewPanelProps) {
  const [showCode, setShowCode] = useState(false);

  const downloadHTML = () => {
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/html;charset=utf-8,' + encodeURIComponent(html));
    element.setAttribute('download', 'website.html');
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div 
      className="w-full md:w-1/2 flex flex-col border-l"
      style={{
        backgroundColor: 'var(--background)',
        borderColor: 'var(--border)',
      }}
    >
      <div 
        className="border-b flex items-center justify-between px-8 py-4 backdrop-blur-sm"
        style={{
          backgroundColor: 'var(--background-overlay)',
          borderColor: 'var(--border)',
        }}
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCode(false)}
            className="px-4 py-2 text-sm font-mono uppercase font-semibold transition-all duration-200 border"
            style={{
              backgroundColor: !showCode ? 'var(--primary)' : 'transparent',
              color: !showCode ? 'var(--primary-foreground)' : 'var(--secondary-text)',
              borderColor: !showCode ? 'var(--primary)' : 'var(--border)',
            }}
          >
            PREVIEW
          </button>
          <button
            onClick={() => setShowCode(true)}
            className="px-4 py-2 text-sm font-mono uppercase font-semibold transition-all duration-200 border"
            style={{
              backgroundColor: showCode ? 'var(--secondary)' : 'transparent',
              color: showCode ? 'var(--secondary-foreground)' : 'var(--secondary-text)',
              borderColor: showCode ? 'var(--secondary)' : 'var(--border)',
            }}
          >
            CODE
          </button>
        </div>
        {html && (
          <button
            onClick={downloadHTML}
            className="px-4 py-2 text-sm font-mono uppercase font-semibold transition-all duration-200 border hover:-translate-y-0.5"
            style={{
              backgroundColor: 'transparent',
              color: 'var(--secondary-text)',
              borderColor: 'var(--border)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--primary)';
              e.currentTarget.style.borderColor = 'var(--primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--secondary-text)';
              e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            DOWNLOAD
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {html ? (
          showCode ? (
            <CodeView html={html} />
          ) : (
            <IframePreview html={html} />
          )
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center flex-col gap-6 p-12">
      <div 
        className="w-20 h-20 flex items-center justify-center border text-4xl"
        style={{
          backgroundColor: 'var(--background-overlay)',
          borderColor: 'var(--border)',
          color: 'var(--primary)',
        }}
      >
        ⚡
      </div>
      <div className="text-center">
        <h3 
          className="text-base font-display font-black uppercase tracking-tight mb-2"
          style={{ color: 'var(--foreground)' }}
        >
          Ready to Fabricate
        </h3>
        <p 
          className="text-sm max-w-xs leading-relaxed font-sans"
          style={{ color: 'var(--secondary-text)' }}
        >
          Describe your website on the left panel and click Generate to see your fabricated design here.
        </p>
      </div>
    </div>
  );
}

function IframePreview({ html }: { html: string }) {
  return (
    <div className="w-full h-full bg-white">
      <iframe
        srcDoc={html}
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin allow-forms"
        title="Website Preview"
      />
    </div>
  );
}

function CodeView({ html }: { html: string }) {
  return (
    <div 
      className="w-full h-full overflow-auto p-6"
      style={{
        backgroundColor: 'var(--background-overlay)',
      }}
    >
      <pre 
        className="text-xs font-mono whitespace-pre-wrap break-words leading-relaxed"
        style={{
          color: 'var(--secondary-text)',
        }}
      >
        <code>{html}</code>
      </pre>
    </div>
  );
}
