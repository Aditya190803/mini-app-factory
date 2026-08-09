import { ProjectFile } from './page-builder';

/**
 * Parses a string containing multiple code blocks into ProjectFile objects.
 * Supports the format:
 * ```html:index.html
 * ...
 * ```
 */
export function parseMultiFileOutput(output: string): ProjectFile[] {
  const files: ProjectFile[] = [];
  // More flexible regex that handles missing filenames or different casing
  const regex = /```(html|css|javascript|js|sql)(?::([^\n]+))?\n([\s\S]*?)```/gi;
  let match;

  while ((match = regex.exec(output)) !== null) {
    const lang = match[1].toLowerCase();
    let path = match[2]?.trim() || '';
    const content = match[3].trim();
    
    // Default paths if missing
    if (!path) {
      if (lang === 'html') path = 'index.html';
      else if (lang === 'css') path = 'styles.css';
      else if (lang === 'javascript' || lang === 'js') path = 'script.js';
      else if (lang === 'sql') path = `migrations/${String(files.length + 1).padStart(4, '0')}_migration.sql`;
      else path = `file-${files.length + 1}.${lang}`;
    }

    let language: ProjectFile['language'] = 'html';
    if (lang === 'css') language = 'css';
    if (lang === 'javascript' || lang === 'js') language = 'javascript';
    if (lang === 'sql') language = 'sql';

    let fileType: ProjectFile['fileType'] = 'page';
    if (path === '_worker.js') fileType = 'worker';
    else if (path.startsWith('migrations/') && path.endsWith('.sql')) fileType = 'migration';
    else if (path.endsWith('.css')) fileType = 'style';
    else if (path.endsWith('.js')) fileType = 'script';
    else if (path.includes('partial') || path.startsWith('header') || path.startsWith('footer')) fileType = 'partial';
    else fileType = 'page';

    // Prevent duplicates by path
    if (!files.some(f => f.path === path)) {
      files.push({
        path,
        content,
        language,
        fileType
      });
    }
  }

  return files;
}

/**
 * A generator that parses a stream of text and yields completed files as they appear.
 */
export async function* parseStreamingOutput(stream: AsyncIterable<string>) {
  let buffer = '';
  const processedPaths = new Set<string>();

  for await (const chunk of stream) {
    buffer += chunk;
    const files = parseMultiFileOutput(buffer);
    
    for (const file of files) {
      if (!processedPaths.has(file.path)) {
        // This is a simple version; in reality we might want to yield partial updates
        // But for now, let's yield when a file is "likely" complete (next one starts or stream ends)
        // For simplicity, we just yield all found so far and let the consumer handle it
      }
    }
    yield files;
  }
}
