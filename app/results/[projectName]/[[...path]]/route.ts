import { getProject, getFile, getFiles } from '@/lib/projects';
import { assembleFullPage } from '@/lib/page-builder';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectName: string, path?: string[] }> }
) {
  const { projectName, path: segments } = await params;
  const project = await getProject(projectName);

  if (!project || !project.isPublished) {
    return new NextResponse('Project not found or not published', { status: 404 });
  }

  const filePath = segments ? segments.join('/') : 'index.html';
  let file = await getFile(projectName, filePath);

  if (!file) {
    // 1. Try directory routing: folder/ -> folder/index.html
    const indexInFolder = filePath.endsWith('/') 
      ? `${filePath}index.html` 
      : `${filePath}/index.html`;
    file = await getFile(projectName, indexInFolder);

    // 2. Try adding .html extension if not found and no extension provided
    if (!file && !filePath.includes('.')) {
      file = await getFile(projectName, `${filePath}.html`);
    }
  }

  if (!file) {
    // If it's the root and no index.html, fallback to project.html for legacy
    if (filePath === 'index.html' && project.html) {
      return new NextResponse(project.html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    return new NextResponse('File not found', { status: 404 });
  }

  let content = file.content;
  let contentType = 'text/plain';

  if (file.fileType === 'page' || file.path.endsWith('.html')) {
    const allFiles = await getFiles(projectName);
    // Map Convex files to ProjectFile interface
    const projectFiles = allFiles.map((f: { path: string; content: string; language: string; fileType: string }) => ({
      path: f.path,
      content: f.content,
      language: f.language as 'html' | 'css' | 'javascript',
      fileType: f.fileType as 'page' | 'partial' | 'style' | 'script'
    }));
    content = assembleFullPage(file.path, projectFiles, projectName, {
      favicon: project.favicon,
      globalSeo: project.globalSeo,
      seoData: project.seoData
    });
    contentType = 'text/html; charset=utf-8';
  } else if (file.fileType === 'style' || file.path.endsWith('.css')) {
    contentType = 'text/css; charset=utf-8';
  } else if (file.fileType === 'script' || file.path.endsWith('.js')) {
    contentType = 'application/javascript; charset=utf-8';
  }

  return new NextResponse(content, {
    headers: {
      'Content-Type': contentType,
    },
  });
}
