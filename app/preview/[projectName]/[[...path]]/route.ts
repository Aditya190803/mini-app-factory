import { NextRequest, NextResponse } from 'next/server';
import { stackServerApp } from '@/stack/server';
import { assembleFullPage } from '@/lib/page-builder';
import { assertCanAccessProject } from '@/lib/project-access';
import { getFile, getFiles, getProject } from '@/lib/projects';
import { userContentHeaders } from '@/lib/user-content-headers';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectName: string; path?: string[] }> }
) {
  const user = await stackServerApp.getUser();
  if (!user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const { projectName, path: segments } = await params;
  const projectRecord = await getProject(projectName);
  const access = assertCanAccessProject(projectRecord, user?.id);
  if (!access.ok) {
    const status = access.status === 404 ? 404 : access.status;
    return new NextResponse(access.message, { status });
  }
  const project = access.project;

  const filePath = segments ? segments.join('/') : 'index.html';
  let file = await getFile(projectName, filePath);

  if (!file) {
    const indexInFolder = filePath.endsWith('/')
      ? `${filePath}index.html`
      : `${filePath}/index.html`;
    file = await getFile(projectName, indexInFolder);

    if (!file && !filePath.includes('.')) {
      file = await getFile(projectName, `${filePath}.html`);
    }
  }

  if (!file) {
    if (filePath === 'index.html' && project.html) {
      return new NextResponse(project.html, {
        headers: userContentHeaders('text/html; charset=utf-8', { 'Cache-Control': 'no-store' }),
      });
    }
    return new NextResponse('File not found', { status: 404 });
  }

  let content = file.content;
  let contentType = 'text/plain';

  if (file.fileType === 'page' || file.path.endsWith('.html')) {
    const allFiles = await getFiles(projectName);
    const projectFiles = allFiles.map((f: { path: string; content: string; language: string; fileType: string }) => ({
      path: f.path,
      content: f.content,
      language: f.language as 'html' | 'css' | 'javascript',
      fileType: f.fileType as 'page' | 'partial' | 'style' | 'script',
    }));

    content = assembleFullPage(file.path, projectFiles, projectName, {
      favicon: project.favicon,
      globalSeo: project.globalSeo,
      seoData: project.seoData,
    });
    contentType = 'text/html; charset=utf-8';
  } else if (file.fileType === 'style' || file.path.endsWith('.css')) {
    contentType = 'text/css; charset=utf-8';
  } else if (file.fileType === 'script' || file.path.endsWith('.js')) {
    contentType = 'application/javascript; charset=utf-8';
  }

  return new NextResponse(content, {
    headers: userContentHeaders(contentType, { 'Cache-Control': 'no-store' }),
  });
}
