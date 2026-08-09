import { describe, test, expect } from 'vitest';
import { parseMultiFileOutput } from '@/lib/file-parser';

describe('file-parser', () => {
  test('parseMultiFileOutput parses mixed language blocks with paths', () => {
    const output = `
Here is your site:

\`\`\`html:index.html
<!DOCTYPE html>
<html><body><h1>Home</h1></body></html>
\`\`\`

\`\`\`css:styles.css
body { background: white; }
\`\`\`

\`\`\`javascript:script.js
alert('hello');
\`\`\`

\`\`\`html:partials/header.html
<nav>Logo</nav>
\`\`\`
`;
    const files = parseMultiFileOutput(output);
    expect(files).toHaveLength(4);
    
    expect(files.find(f => f.path === 'index.html')).toMatchObject({
      language: 'html',
      fileType: 'page'
    });
    
    expect(files.find(f => f.path === 'styles.css')).toMatchObject({
      language: 'css',
      fileType: 'style'
    });

    expect(files.find(f => f.path === 'partials/header.html')).toMatchObject({
      language: 'html',
      fileType: 'partial'
    });
  });

  test('parses Cloudflare worker, manifest, and D1 migration files', () => {
    const files = parseMultiFileOutput(`
\`\`\`javascript:_worker.js
export default { fetch(request, env) { return env.ASSETS.fetch(request); } };
\`\`\`
\`\`\`json:cloudflare.json
{"version":1,"bindings":{}}
\`\`\`
\`\`\`sql:migrations/0001_init.sql
CREATE TABLE messages(id INTEGER PRIMARY KEY);
\`\`\`
`);
    expect(files).toEqual([
      expect.objectContaining({ path: '_worker.js', language: 'javascript', fileType: 'worker' }),
      expect.objectContaining({ path: 'cloudflare.json', language: 'json', fileType: 'config' }),
      expect.objectContaining({ path: 'migrations/0001_init.sql', language: 'sql', fileType: 'migration' }),
    ]);
  });

  test('parseMultiFileOutput handles missing paths with defaults', () => {
    const output = "\`\`\`html\n<h1>No path</h1>\n\`\`\`";
    const files = parseMultiFileOutput(output);
    expect(files[0].path).toBe('index.html');
  });
});
