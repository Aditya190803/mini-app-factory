import { describe, expect, test, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { inspectProject } from '@/lib/project-inspector';

describe('project inspector', () => {
  test('discovers API routes, resources, workflows, and environment requirements', () => {
    const result = inspectProject([
      { path: '_worker.js', fileType: 'worker', language: 'javascript', content: `export default { fetch(request) { const url = new URL(request.url); if (request.method === 'GET' && url.pathname === '/api/tasks') return Response.json([]); } }` },
      { path: '.dev.vars.example', fileType: 'config', language: 'json', content: 'STRIPE_KEY=\n# comment\nMAIL_TOKEN=' },
      { path: 'wrangler.jsonc', fileType: 'config', language: 'json', content: '{"name":"demo","main":"_worker.js","d1_databases":[{"binding":"DB","database_name":"demo-db"}]}' },
    ], 'demo');
    expect(result.routes).toContainEqual(expect.objectContaining({ method: 'GET', path: '/api/tasks' }));
    expect(result.resources).toContainEqual(expect.objectContaining({ kind: 'd1', binding: 'DB' }));
    expect(result.environmentNames).toEqual(['STRIPE_KEY', 'MAIL_TOKEN']);
  });
});
