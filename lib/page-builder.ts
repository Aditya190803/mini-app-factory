import * as cheerio from 'cheerio';

export interface ProjectFile {
  path: string;
  content: string;
  language: 'html' | 'css' | 'javascript';
  fileType: 'page' | 'partial' | 'style' | 'script';
}

/**
 * Resolves <!-- include:filename.html --> directives
 */
export function resolveIncludes(html: string, files: ProjectFile[], isPreview = false): string {
  const partials = files.filter(f => f.fileType === 'partial');
  
  return html.replace(/<!--\s*include:([a-zA-Z0-9._-]+)\s*-->/g, (match, fileName) => {
    const partial = partials.find(p => p.path === fileName);
    if (partial) {
      // Recursively resolve includes in partials
      const content = resolveIncludes(partial.content, files, isPreview);
      
      if (isPreview) {
        // Wrap in a marker for the visual selector
        // We use display: contents to avoid breaking layout while providing a target for the selector
        return `<div data-source-file="${fileName}" style="display: contents;">${content}</div>`;
      }
      return content;
    }
    return `<!-- Error: Partial ${fileName} not found -->`;
  });
}

/**
 * Assembles a full page by injecting partials, and inlining styles/scripts for the preview.
 */
export function assembleFullPage(
  pagePath: string, 
  files: ProjectFile[], 
  projectName?: string,
  metadata?: {
    favicon?: string,
    globalSeo?: { siteName?: string, description?: string, ogImage?: string },
    seoData?: Array<{ path: string, title?: string, description?: string, ogImage?: string }>
  },
  isEditorPreview = false
): string {
  const pageFile = files.find(f => f.path === pagePath);
  if (!pageFile) return '';

  let html = resolveIncludes(pageFile.content, files, isEditorPreview);
  const $ = cheerio.load(html);

  // Tag body with source file for visual selector
  if (isEditorPreview) {
    $('body').attr('data-source-file', pagePath);
    
    // Process the include comments to add data-source-file to elements
    // This is a bit tricky with cheerio but we can try to wrap contents
    // or just let the selector walk up to comments (though DOM doesn't easily walk to comments via parent)
    // For now, we'll manually tag the body. Recursive tagging for partials below.
  }

  // Set base href if projectName is provided to fix relative links in subfolders
  if (projectName) {
    const baseHref = `/results/${projectName}/`;
    if ($('head').length === 0 && $('body').length > 0) {
      $('body').before('<head></head>');
    }
    
    if ($('head').length > 0) {
      if ($('base').length === 0) {
        $('head').prepend(`<base href="${baseHref}">`);
      }
    } else {
      // Last resort fallback
      $.root().prepend(`<base href="${baseHref}">`);
    }
  }

  // Inject SEO Metadata
  const pageSeo = metadata?.seoData?.find(s => s.path === pagePath);
  const global = metadata?.globalSeo;

  // Title Logic: Page Title || (Site Name | Page Path) || Site Name
  let finalTitle = pageSeo?.title;
  if (!finalTitle && global?.siteName) {
    const displayPath = pagePath === 'index.html' ? '' : ` | ${pagePath.replace(/\.html$/, '')}`;
    finalTitle = `${global.siteName}${displayPath}`;
  }

  if (finalTitle) {
    if ($('title').length > 0) $('title').text(finalTitle);
    else if ($('head').length > 0) $('head').prepend(`<title>${finalTitle}</title>`);
    else $.root().prepend(`<title>${finalTitle}</title>`);
  }

  // Description Logic: Page Description || Global Description
  const finalDesc = pageSeo?.description || global?.description;
  if (finalDesc) {
    if ($('meta[name="description"]').length > 0) $('meta[name="description"]').attr('content', finalDesc);
    else if ($('head').length > 0) $('head').append(`<meta name="description" content="${finalDesc}">`);
  }

  // OG Image Logic: Page OG || Global OG
  const finalOg = pageSeo?.ogImage || global?.ogImage;
  if (finalOg) {
    if ($('meta[property="og:image"]').length > 0) $('meta[property="og:image"]').attr('content', finalOg);
    else if ($('head').length > 0) $('head').append(`<meta property="og:image" content="${finalOg}">`);
  }

  // Inject Favicon
  if (metadata?.favicon) {
    let faviconTag = '';
    const isEmoji = !metadata.favicon.startsWith('http') && !metadata.favicon.startsWith('/') && metadata.favicon.length < 8;
    
    if (isEmoji) {
      faviconTag = `<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${metadata.favicon}</text></svg>">`;
    } else {
      faviconTag = `<link rel="icon" href="${metadata.favicon}">`;
    }

    if ($('link[rel="icon"]').length > 0) $('link[rel="icon"]').replaceWith(faviconTag);
    else if ($('head').length > 0) $('head').append(faviconTag);
  }

  // Handle Styles: Inline them into the preview so they actually load in srcDoc
  const styleFiles = files.filter(f => f.fileType === 'style');
  styleFiles.forEach(styleFile => {
    const selector = `link[rel="stylesheet"][href="${styleFile.path}"]`;
    const styleElement = `<style data-file="${styleFile.path}">\n${styleFile.content}\n</style>`;
    
    if ($(selector).length > 0) {
      $(selector).replaceWith(styleElement);
    } else if (styleFile.path === 'styles.css') {
      if ($('head').length > 0) $('head').append(styleElement);
      else $.root().append(styleElement);
    }
  });

  // Handle Scripts: Inline them into the preview
  const scriptFiles = files.filter(f => f.fileType === 'script');
  scriptFiles.forEach(scriptFile => {
    const selector = `script[src="${scriptFile.path}"]`;
    const scriptElement = `<script data-file="${scriptFile.path}">\n${scriptFile.content}\n</script>`;

    if ($(selector).length > 0) {
      $(selector).replaceWith(scriptElement);
    } else if (scriptFile.path === 'script.js') {
      if ($('body').length > 0) $('body').append(scriptElement);
      else $.root().append(scriptElement);
    }
  });

  // Inject Bridge Script for HMR, Virtual FS, and Visual Selector
  if (isEditorPreview) {
    const bridgeScript = `
<script id="preview-bridge">
  (function() {
    // Simple Virtual FS for preview (memfs-like API)
    const vfsSubscribers = new Set();
    const vfs = {
      files: {},
      version: 0,
      readFile(path) {
        return this.files[path]?.content ?? null;
      },
      getFile(path) {
        return this.files[path] ?? null;
      },
      listFiles() {
        return Object.keys(this.files);
      },
      onChange(cb) {
        vfsSubscribers.add(cb);
        return () => vfsSubscribers.delete(cb);
      }
    };
    window.__VFS__ = vfs;

    const applyVfsUpdate = (incoming, version) => {
      if (incoming && typeof incoming === 'object') {
        Object.keys(incoming).forEach((path) => {
          vfs.files[path] = incoming[path];
        });
      }
      vfs.version = typeof version === 'number' ? version : (vfs.version + 1);
      vfsSubscribers.forEach((cb) => {
        try { cb(incoming, vfs.version); } catch {}
      });
    };

    // Navigation handling
    document.addEventListener('click', (e) => {
      if (window.__SELECTOR_ACTIVE__) return; // Handled by selector logic below

      const a = e.target.closest('a');
      if (a) {
        const href = a.getAttribute('href');
        if (href && href.startsWith('#')) {
          e.preventDefault();
          const target = document.querySelector(href);
          if (target) {
            target.scrollIntoView({ behavior: 'smooth' });
            history.pushState(null, null, href);
          }
        } else if (href && !href.startsWith('javascript:') && !href.startsWith('http') && !href.startsWith('mailto:')) {
          e.preventDefault();
          window.parent.postMessage({ type: 'navigate', path: href }, '*');
        } else if (href && href.startsWith('http')) {
          e.preventDefault();
          window.open(a.href, '_blank');
        }
      }
    });

    // Communication bridge
    window.addEventListener('message', (event) => {
      if (event.data.type === 'update-css') {
        const { file, content } = event.data;
        let style = document.querySelector(\`style[data-file="\${file}"]\`);
        if (!style) {
          style = document.createElement('style');
          style.setAttribute('data-file', file);
          document.head.appendChild(style);
        }
        style.textContent = content;
        console.log(\`[HMR] Updated \${file}\`);
      }

      if (event.data.type === 'init-vfs') {
        const { files, version } = event.data;
        applyVfsUpdate(files, version);
      }

      if (event.data.type === 'update-vfs') {
        const { files, version } = event.data;
        applyVfsUpdate(files, version);
      }
      
      if (event.data.type === 'toggle-selector') {
        window.__SELECTOR_ACTIVE__ = event.data.active;
        document.body.style.cursor = event.data.active ? 'crosshair' : 'default';
        if (!event.data.active) {
            document.querySelectorAll('*').forEach(el => {
                if (el instanceof HTMLElement) el.style.outline = '';
            });
        }
      }
    });

    const safeEscape = (value) => {
      if (typeof value !== 'string') return '';
      if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
      return value.replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
    };

    const buildSelectorPath = (el) => {
      if (!(el instanceof Element)) return null;
      const parts = [];
      let current = el;

      while (current && current.nodeType === 1 && current !== document.documentElement) {
        let part = current.tagName.toLowerCase();

        if (current.id) {
          part += \`#\${safeEscape(current.id)}\`;
          parts.unshift(part);
          break;
        }

        const classList = Array.from(current.classList || []).filter(Boolean).slice(0, 3);
        if (classList.length > 0) {
          part += '.' + classList.map(safeEscape).join('.');
        }

        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter((s) => s.tagName === current.tagName);
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            part += \`:nth-of-type(\${index})\`;
          }
        }

        parts.unshift(part);
        current = parent;
      }

      return parts.join(' > ');
    };

    // Visual Selector interaction
    document.addEventListener('click', (e) => {
      if (!window.__SELECTOR_ACTIVE__) return;
      
      e.preventDefault();
      e.stopPropagation();

      let target = e.target;
      let sourceFile = null;

      while (target && target !== document.documentElement) {
         if (target instanceof HTMLElement && target.hasAttribute('data-source-file')) {
           sourceFile = target.getAttribute('data-source-file');
           break;
         }
         target = target.parentElement;
      }
      
      if (!sourceFile) sourceFile = document.body.getAttribute('data-source-file');

      const selector = target instanceof HTMLElement ? buildSelectorPath(target) : null;

      window.parent.postMessage({
        type: 'element-selected',
        path: sourceFile,
        elementHtml: target instanceof HTMLElement ? target.outerHTML : null,
        elementText: target instanceof HTMLElement ? target.innerText : null,
        tagName: target instanceof HTMLElement ? target.tagName.toLowerCase() : null,
        selector,
        x: e.clientX,
        y: e.clientY
      }, '*');
    }, true);

    document.addEventListener('mouseover', (e) => {
      if (!window.__SELECTOR_ACTIVE__) return;
      if (e.target instanceof HTMLElement) {
        e.target.style.outline = '2px solid #3b82f6';
        e.target.style.outlineOffset = '-2px';
      }
    });
    document.addEventListener('mouseout', (e) => {
      if (!window.__SELECTOR_ACTIVE__) return;
      if (e.target instanceof HTMLElement) {
        e.target.style.outline = '';
      }
    });
  })();
</script>`;
    if ($('head').length > 0) $('head').append(bridgeScript);
    else if ($('body').length > 0) $('body').prepend(bridgeScript);
    else $.root().append(bridgeScript);
  }

  return $.html();
}

/**
 * Extracts inline style and script tags into separate files
 */
export function extractInlineAssets(html: string): { 
  cleanHtml: string, 
  styles: string, 
  scripts: string 
} {
  const $ = cheerio.load(html);
  let styles = '';
  let scripts = '';

  const styleTags = $('style');
  if (styleTags.length > 0) {
    styleTags.each((_, el) => {
      styles += $(el).text() + '\n';
      $(el).remove();
    });
    // Add reference to the new styles.css
    if ($('head').length > 0) {
      $('head').append('<link rel="stylesheet" href="styles.css">');
    } else {
      $.root().prepend('<link rel="stylesheet" href="styles.css">');
    }
  }

  const scriptTags = $('script');
  let extractedAnyScript = false;
  scriptTags.each((_, el) => {
    if (!$(el).attr('src')) {
      scripts += $(el).text() + '\n';
      $(el).remove();
      extractedAnyScript = true;
    }
  });

  if (extractedAnyScript) {
    // Add reference to the new script.js
    if ($('body').length > 0) {
      $('body').append('<script src="script.js" defer></script>');
    } else {
      $.root().append('<script src="script.js" defer></script>');
    }
  }

  return {
    cleanHtml: $.html(),
    styles: styles.trim(),
    scripts: scripts.trim()
  };
}

/**
 * Validates that basic required files exist
 */
export function validateFileStructure(files: ProjectFile[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!files.some(f => f.path === 'index.html')) {
    errors.push('Missing index.html');
  }
  return {
    valid: errors.length === 0,
    errors
  };
}
