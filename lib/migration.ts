import { extractInlineAssets } from './page-builder';
import { ProjectFile } from './page-builder';

/**
 * Migrates a single-file project to the new multi-file structure.
 * Extracts inline CSS and JS into standalone files.
 */
export function migrateProject(legacyHtml: string): ProjectFile[] {
  const { cleanHtml, styles, scripts } = extractInlineAssets(legacyHtml);
  
  const files: ProjectFile[] = [
    {
      path: 'index.html',
      content: cleanHtml,
      language: 'html',
      fileType: 'page'
    }
  ];

  if (styles) {
    files.push({
      path: 'styles.css',
      content: styles,
      language: 'css',
      fileType: 'style'
    });
  }

  if (scripts) {
    files.push({
      path: 'script.js',
      content: scripts,
      language: 'javascript',
      fileType: 'script'
    });
  }

  return files;
}
