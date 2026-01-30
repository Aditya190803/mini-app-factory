import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { describe, test, expect } from 'vitest';
import { parseAndSaveCodeBlocks, generateFallbackHtml } from '@/lib/site-builder';

describe('site-builder utilities', () => {
  test('parseAndSaveCodeBlocks saves index.html from fenced html block', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'site-builder-test-'));
    const out = "Here is a response:\n```html:index.html\n<!doctype html><html><body><h1>Hi</h1></body></html>\n```";

    const saved = await parseAndSaveCodeBlocks(out, tmp);
    expect(saved).toContain('index.html');

    const content = await fs.readFile(path.join(tmp, 'index.html'), 'utf8');
    expect(content).toContain('<h1>Hi</h1>');
  });

  test('generateFallbackHtml escapes description', () => {
    const html = generateFallbackHtml('<Bad & stuff>', 'job-1');
    expect(html).toContain('&lt;Bad &amp; stuff&gt;');
    expect(html).toContain('Site job-1');
  });
});
