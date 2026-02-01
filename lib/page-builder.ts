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
export function resolveIncludes(html: string, files: ProjectFile[]): string {
  const partials = files.filter(f => f.fileType === 'partial');
  
  return html.replace(/<!--\s*include:([a-zA-Z0-9._-]+)\s*-->/g, (match, fileName) => {
    const partial = partials.find(p => p.path === fileName);
    if (partial) {
      // Recursively resolve includes in partials
      return resolveIncludes(partial.content, files);
    }
    return `<!-- Error: Partial ${fileName} not found -->`;
  });
}

/**
 * Assembles a full page by injecting partials, and inlining styles/scripts for the preview.
 */
export function assembleFullPage(pagePath: string, files: ProjectFile[], projectName?: string): string {
  const pageFile = files.find(f => f.path === pagePath);
  if (!pageFile) return '';

  let html = resolveIncludes(pageFile.content, files);
  const $ = cheerio.load(html);

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
