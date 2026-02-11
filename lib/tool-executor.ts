import * as cheerio from 'cheerio';
import * as csstree from 'css-tree';
import path from 'path';
import { ProjectFile } from './page-builder';

export interface ToolResult {
  success: boolean;
  message: string;
  updatedFiles?: ProjectFile[];
  deletedPaths?: string[];
}

type ToolValidationResult =
  | { success: true; args: Record<string, unknown> }
  | { success: false; message: string };

const ALLOWED_TOOLS = new Set([
  'updateFile',
  'replaceContent',
  'replaceElement',
  'insertContent',
  'deleteContent',
  'createFile',
  'deleteFile',
  'renameFile',
  'updateStyle',
  'batchEdit',
]);

function normalizeToolPath(input: string): string | null {
  if (!input || typeof input !== 'string') return null;
  let sanitized = input.replace(/\\/g, '/').trim();
  if (!sanitized) return null;
  sanitized = sanitized.replace(/^\.\/+/, '');
  sanitized = sanitized.replace(/^\/+/, '');
  const normalized = path.posix.normalize(sanitized);
  if (normalized === '.' || normalized.startsWith('..') || normalized.includes('/../')) return null;
  return normalized;
}

export function validateToolCall(toolName: string, args: Record<string, unknown>): ToolValidationResult {
  if (!ALLOWED_TOOLS.has(toolName)) {
    return { success: false, message: `Tool not allowed: ${toolName}` };
  }

  const normalizedArgs: Record<string, unknown> = { ...args };

  const normalizeFileTypeValue = (value: unknown): ProjectFile['fileType'] | null => {
    const raw = String(value ?? '').toLowerCase();
    if (raw === 'html') return 'page';
    if (raw === 'css') return 'style';
    if (raw === 'js' || raw === 'javascript') return 'script';
    if (raw === 'page' || raw === 'partial' || raw === 'style' || raw === 'script') {
      return raw as ProjectFile['fileType'];
    }
    return null;
  };

  const normalizeField = (key: string) => {
    const value = normalizedArgs[key];
    if (typeof value !== 'string') return null;
    const normalized = normalizeToolPath(value);
    if (!normalized) return null;
    normalizedArgs[key] = normalized;
    return normalized;
  };

  switch (toolName) {
    case 'updateFile': {
      if (!normalizeField('file')) return { success: false, message: 'Invalid file path' };
      if (typeof normalizedArgs.content !== 'string') {
        return { success: false, message: 'Invalid content' };
      }
      return { success: true, args: normalizedArgs };
    }
    case 'replaceContent': {
      if (!normalizeField('file')) return { success: false, message: 'Invalid file path' };
      if (typeof normalizedArgs.selector !== 'string' || typeof normalizedArgs.newContent !== 'string') {
        return { success: false, message: 'Invalid selector or newContent' };
      }
      if (normalizedArgs.oldContent && typeof normalizedArgs.oldContent !== 'string') {
        return { success: false, message: 'Invalid oldContent' };
      }
      return { success: true, args: normalizedArgs };
    }
    case 'replaceElement': {
      if (!normalizeField('file')) return { success: false, message: 'Invalid file path' };
      if (typeof normalizedArgs.selector !== 'string' || typeof normalizedArgs.newContent !== 'string') {
        return { success: false, message: 'Invalid selector or newContent' };
      }
      return { success: true, args: normalizedArgs };
    }
    case 'insertContent': {
      if (!normalizeField('file')) return { success: false, message: 'Invalid file path' };
      if (typeof normalizedArgs.selector !== 'string' || typeof normalizedArgs.content !== 'string') {
        return { success: false, message: 'Invalid selector or content' };
      }
      if (!['before', 'after', 'prepend', 'append'].includes(String(normalizedArgs.position))) {
        return { success: false, message: 'Invalid position' };
      }
      return { success: true, args: normalizedArgs };
    }
    case 'deleteContent': {
      if (!normalizeField('file')) return { success: false, message: 'Invalid file path' };
      if (typeof normalizedArgs.selector !== 'string') {
        return { success: false, message: 'Invalid selector' };
      }
      return { success: true, args: normalizedArgs };
    }
    case 'createFile': {
      if (!normalizeField('path')) return { success: false, message: 'Invalid path' };
      if (typeof normalizedArgs.content !== 'string') return { success: false, message: 'Invalid content' };
      const normalizedFileType = normalizeFileTypeValue(normalizedArgs.fileType);
      if (!normalizedFileType) {
        return { success: false, message: 'Invalid fileType' };
      }
      normalizedArgs.fileType = normalizedFileType;
      return { success: true, args: normalizedArgs };
    }
    case 'deleteFile': {
      if (!normalizeField('path')) return { success: false, message: 'Invalid path' };
      return { success: true, args: normalizedArgs };
    }
    case 'renameFile': {
      if (!normalizeField('from') || !normalizeField('to')) return { success: false, message: 'Invalid rename paths' };
      return { success: true, args: normalizedArgs };
    }
    case 'updateStyle': {
      if (typeof normalizedArgs.selector !== 'string') return { success: false, message: 'Invalid selector' };
      if (typeof normalizedArgs.properties !== 'object' || !normalizedArgs.properties) {
        return { success: false, message: 'Invalid properties' };
      }
      for (const value of Object.values(normalizedArgs.properties as Record<string, unknown>)) {
        if (typeof value !== 'string') return { success: false, message: 'CSS properties must be strings' };
      }
      if (normalizedArgs.action && !['merge', 'replace'].includes(String(normalizedArgs.action))) {
        return { success: false, message: 'Invalid action' };
      }
      return { success: true, args: normalizedArgs };
    }
    case 'batchEdit': {
      if (!Array.isArray(normalizedArgs.operations)) {
        return { success: false, message: 'Invalid operations list' };
      }
      const normalizedOperations = [] as Array<{ name: string; arguments: Record<string, unknown> }>;
      for (const op of normalizedArgs.operations as Array<Record<string, unknown>>) {
        if (!op || typeof op.name !== 'string' || typeof op.arguments !== 'object' || !op.arguments) {
          return { success: false, message: 'Invalid batch operation structure' };
        }
        const validated = validateToolCall(op.name, op.arguments as Record<string, unknown>);
        if (!validated.success) return validated;
        normalizedOperations.push({ name: op.name, arguments: validated.args });
      }
      return { success: true, args: { operations: normalizedOperations } };
    }
    default:
      return { success: false, message: `Unknown tool: ${toolName}` };
  }
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  files: ProjectFile[]
): Promise<ToolResult> {
  const fileList = [...files];

  const validated = validateToolCall(toolName, args);
  if (!validated.success) {
    return { success: false, message: validated.message };
  }
  const safeArgs = validated.args;

  if (process.env.NODE_ENV === 'development') {
    const payloadPreview = JSON.stringify(safeArgs).slice(0, 400);
    const suffix = payloadPreview.length >= 400 ? '…' : '';
    console.log(`[Tool Executor] ${toolName} ${payloadPreview}${suffix}`);
  }

  switch (toolName) {
    case 'updateFile':
      return handleUpdateFile(safeArgs as Parameters<typeof handleUpdateFile>[0], fileList);
    case 'replaceContent':
      return handleReplaceContent(safeArgs as Parameters<typeof handleReplaceContent>[0], fileList);
    case 'replaceElement':
      return handleReplaceElement(safeArgs as Parameters<typeof handleReplaceElement>[0], fileList);
    case 'insertContent':
      return handleInsertContent(safeArgs as Parameters<typeof handleInsertContent>[0], fileList);
    case 'deleteContent':
      return handleDeleteContent(safeArgs as Parameters<typeof handleDeleteContent>[0], fileList);
    case 'createFile':
      return handleCreateFile(safeArgs as Parameters<typeof handleCreateFile>[0], fileList);
    case 'deleteFile':
      return handleDeleteFile(safeArgs as Parameters<typeof handleDeleteFile>[0], fileList);
    case 'renameFile':
      return handleRenameFile(safeArgs as Parameters<typeof handleRenameFile>[0], fileList);
    case 'updateStyle':
      return handleUpdateStyle(safeArgs as Parameters<typeof handleUpdateStyle>[0], fileList);
    case 'batchEdit':
      return handleBatchEdit(safeArgs as Parameters<typeof handleBatchEdit>[0], fileList);
    default:
      return { success: false, message: `Unknown tool: ${toolName}` };
  }
}

function handleUpdateFile(args: { file: string; content: string }, files: ProjectFile[]): ToolResult {
  const { file: path, content } = args;
  const existing = files.find(f => f.path === path);

  if (existing) {
    existing.content = content;
    return { success: true, message: 'File updated', updatedFiles: [existing] };
  }

  const language = path.endsWith('.html') ? 'html' :
    path.endsWith('.css') ? 'css' :
      path.endsWith('.js') ? 'javascript' : 'html';

  const fileType = path.endsWith('.css') ? 'style' : path.endsWith('.js') ? 'script' : 'page';
  const newFile: ProjectFile = { path, content, language, fileType };
  return { success: true, message: 'File created', updatedFiles: [newFile] };
}

function handleReplaceContent(args: { file: string; selector: string; oldContent?: string; newContent: string }, files: ProjectFile[]): ToolResult {
  const { file: path, selector, oldContent, newContent } = args;
  const file = files.find(f => f.path === path);
  if (!file) return { success: false, message: `File not found: ${path}` };

  if (file.language === 'html') {
    const isDocument = file.fileType === 'page';
    const $ = cheerio.load(file.content, null, isDocument);
    const element = $(selector);
    
    if (element.length === 0) {
      return { success: false, message: `Selector not found: ${selector}` };
    }

    const parseOpeningTag = (value: string) => {
      const match = value.trim().match(/^<([a-zA-Z][\w:-]*)([^>]*)>$/);
      if (!match) return null;
      const tag = match[1].toLowerCase();
      const attrsPart = match[2] || '';
      try {
        const fragment = cheerio.load(`<${tag}${attrsPart}></${tag}>`, null, false);
        const attrs = fragment(tag).first().attr() || {};
        return { tag, attrs };
      } catch {
        return null;
      }
    };

    const oldOpenTag = oldContent ? parseOpeningTag(oldContent) : null;
    const newOpenTag = parseOpeningTag(newContent);

    if (oldContent) {
      const normalizedOld = oldContent.trim();
      const hasMatch = element.toArray().some((node) => {
        const wrapped = $(node);
        const inner = (wrapped.html() || '').trim();
        const outer = $.html(wrapped).trim();
        const tagName = (node as { tagName?: string }).tagName?.toLowerCase();
        const openingTagMatches = !!(oldOpenTag && tagName === oldOpenTag.tag);
        return inner.includes(normalizedOld) || outer.includes(normalizedOld) || openingTagMatches;
      });
      if (!hasMatch) {
        return { success: false, message: `Old content mismatch for selector: ${selector}` };
      }
    }

    // Heuristic: if AI sends opening-tag replacement via replaceContent, treat it
    // as an attribute update on the selected elements to avoid nested-tag corruption.
    if (oldOpenTag && newOpenTag && oldOpenTag.tag === newOpenTag.tag) {
      const allMatchTag = element.toArray().every((node) => (node as { tagName?: string }).tagName?.toLowerCase() === newOpenTag.tag);
      if (allMatchTag) {
        element.each((_, node) => {
          const wrapped = $(node);
          Object.entries(newOpenTag.attrs).forEach(([attr, value]) => {
            if (value !== undefined) wrapped.attr(attr, value);
          });
        });
        file.content = $.html();
        return { success: true, message: 'Attributes updated', updatedFiles: [file] };
      }
    }

    element.html(newContent);
    file.content = $.html();
    return { success: true, message: 'Content replaced', updatedFiles: [file] };
  }

  if (file.language === 'css') {
    const ranges = findCssRuleRanges(file.content, selector);
    if (ranges.length === 0) {
      return { success: false, message: `Selector not found: ${selector}` };
    }

    if (oldContent) {
      const hasOldContent = ranges.some((range) => range.text.includes(oldContent));
      if (!hasOldContent) {
        return { success: false, message: `Old content mismatch for selector: ${selector}` };
      }
    }

    let replacementRule: string;
    try {
      replacementRule = buildCssReplacementRule(selector, newContent, true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, message: `CSS Parse error: ${message}` };
    }

    file.content = applyCssRangeReplacements(file.content, ranges, replacementRule);
    return { success: true, message: 'Content replaced', updatedFiles: [file] };
  }

  return { success: false, message: `Replacement not supported for ${file.language}` };
}

function handleReplaceElement(args: { file: string; selector: string; newContent: string }, files: ProjectFile[]): ToolResult {
  const { file: path, selector, newContent } = args;
  const file = files.find(f => f.path === path);
  if (!file) return { success: false, message: `File not found: ${path}` };

  if (file.language === 'html') {
    const isDocument = file.fileType === 'page';
    const $ = cheerio.load(file.content, null, isDocument);
    const element = $(selector);
    
    if (element.length === 0) {
      return { success: false, message: `Selector not found: ${selector}` };
    }

    element.replaceWith(newContent);
    file.content = $.html();
    return { success: true, message: 'Element replaced', updatedFiles: [file] };
  }

  if (file.language === 'css') {
    const ranges = findCssRuleRanges(file.content, selector);
    if (ranges.length === 0) {
      return { success: false, message: `Selector not found: ${selector}` };
    }

    let replacementRule: string;
    try {
      replacementRule = buildCssReplacementRule(selector, newContent, false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, message: `CSS Parse error: ${message}` };
    }

    file.content = applyCssRangeReplacements(file.content, ranges, replacementRule);
    return { success: true, message: 'Element replaced', updatedFiles: [file] };
  }

  return { success: false, message: `Replacement not supported for ${file.language}` };
}

function handleInsertContent(args: { file: string; position: 'before' | 'after' | 'prepend' | 'append', selector: string, content: string }, files: ProjectFile[]): ToolResult {
  const { file: path, position, selector, content } = args;
  const file = files.find(f => f.path === path);
  if (!file) return { success: false, message: `File not found: ${path}` };

  if (file.language === 'html') {
    const isDocument = file.fileType === 'page';
    const $ = cheerio.load(file.content, null, isDocument);
    const element = $(selector);

    if (element.length === 0) {
      return { success: false, message: `Selector not found: ${selector}` };
    }

    switch (position) {
      case 'before': element.before(content); break;
      case 'after': element.after(content); break;
      case 'prepend': element.prepend(content); break;
      case 'append': element.append(content); break;
      default: return { success: false, message: `Unknown position: ${position}` };
    }

    file.content = $.html();
    return { success: true, message: 'Content inserted', updatedFiles: [file] };
  }

  if (file.language === 'css') {
    const ranges = findCssRuleRanges(file.content, selector);
    if (ranges.length === 0) {
      return { success: false, message: `Selector not found: ${selector}` };
    }

    if (position !== 'before' && position !== 'after') {
      return { success: false, message: `Position ${position} is not supported for css` };
    }

    const ascending = [...ranges].sort((a, b) => a.start - b.start);
    const anchor = ascending[0];
    const insertion = content.endsWith('\n') ? content : `${content}\n`;

    if (position === 'before') {
      file.content = `${file.content.slice(0, anchor.start)}${insertion}${file.content.slice(anchor.start)}`;
    } else {
      file.content = `${file.content.slice(0, anchor.end)}\n${insertion}${file.content.slice(anchor.end)}`;
    }

    return { success: true, message: 'Content inserted', updatedFiles: [file] };
  }

  return { success: false, message: `Insertion not supported for ${file.language}` };
}

function handleDeleteContent(args: { file: string; selector: string }, files: ProjectFile[]): ToolResult {
  const { file: path, selector } = args;
  const file = files.find(f => f.path === path);
  if (!file) return { success: false, message: `File not found: ${path}` };

  if (file.language === 'html') {
    const isDocument = file.fileType === 'page';
    const $ = cheerio.load(file.content, null, isDocument);
    const element = $(selector);

    if (element.length === 0) {
      return { success: false, message: `Selector not found: ${selector}` };
    }

    element.remove();
    file.content = $.html();
    return { success: true, message: 'Content deleted', updatedFiles: [file] };
  }

  if (file.language === 'css') {
    const ranges = findCssRuleRanges(file.content, selector);
    if (ranges.length === 0) {
      return { success: false, message: `Selector not found: ${selector}` };
    }

    file.content = applyCssRangeReplacements(file.content, ranges, '');
    return { success: true, message: 'Content deleted', updatedFiles: [file] };
  }

  return { success: false, message: `Deletion not supported for ${file.language}` };
}

type CssRuleRange = {
  start: number;
  end: number;
  text: string;
};

function findCssRuleRanges(content: string, selector: string): CssRuleRange[] {
  const ranges: CssRuleRange[] = [];
  const normalizedSelector = selector.trim();
  const ast = csstree.parse(content, { context: 'stylesheet', positions: true }) as csstree.StyleSheet;

  csstree.walk(ast, {
    visit: 'Rule',
    enter(node) {
      const rule = node as csstree.Rule;
      const prelude = csstree.generate(rule.prelude).trim();
      if (prelude !== normalizedSelector) return;

      const loc = (rule as unknown as { loc?: { start?: { offset?: number }, end?: { offset?: number } } }).loc;
      const start = loc?.start?.offset;
      const end = loc?.end?.offset;
      if (typeof start === 'number' && typeof end === 'number' && end > start) {
        ranges.push({ start, end, text: content.slice(start, end) });
      }
    },
  });

  return ranges.sort((a, b) => b.start - a.start);
}

function buildCssReplacementRule(selector: string, newContent: string, keepSelector: boolean): string {
  const trimmed = newContent.trim();
  if (!trimmed) {
    throw new Error('CSS content cannot be empty');
  }

  if (trimmed.includes('{')) {
    const parsed = csstree.parse(trimmed, { context: 'rule' }) as csstree.Rule;
    if (!keepSelector) return csstree.generate(parsed);
    const block = csstree.generate(parsed.block);
    const rebuilt = csstree.parse(`${selector} ${block}`, { context: 'rule' });
    return csstree.generate(rebuilt);
  }

  const parsed = csstree.parse(`${selector} { ${trimmed} }`, { context: 'rule' });
  return csstree.generate(parsed);
}

function applyCssRangeReplacements(content: string, ranges: CssRuleRange[], replacement: string): string {
  let nextContent = content;
  for (const range of ranges) {
    nextContent = `${nextContent.slice(0, range.start)}${replacement}${nextContent.slice(range.end)}`;
  }
  return nextContent;
}

function handleCreateFile(args: { path: string; content: string; fileType: ProjectFile['fileType'] }, files: ProjectFile[]): ToolResult {
  const { path, content, fileType } = args;
  const existing = files.find(f => f.path === path);
  if (existing) return { success: false, message: `File already exists: ${path}` };

  const language = path.endsWith('.html') ? 'html' : 
                   path.endsWith('.css') ? 'css' : 
                   path.endsWith('.js') ? 'javascript' : 'html';

  const newFile: ProjectFile = { path, content, language: language as ProjectFile['language'], fileType };
  return { success: true, message: 'File created', updatedFiles: [newFile] };
}

function handleDeleteFile(args: { path: string }, files: ProjectFile[]): ToolResult {
  const { path } = args;
  const exists = files.some(f => f.path === path);
  if (!exists) return { success: false, message: `File not found: ${path}` };

  return { success: true, message: 'File deleted', deletedPaths: [path] };
}

function handleRenameFile(args: { from: string; to: string }, files: ProjectFile[]): ToolResult {
  const { from, to } = args;
  const file = files.find(f => f.path === from);
  if (!file) return { success: false, message: `File not found: ${from}` };
  if (files.some(f => f.path === to)) return { success: false, message: `Destination already exists: ${to}` };

  file.path = to;
  return { success: true, message: 'File renamed', updatedFiles: [file] };
}

function handleUpdateStyle(args: { selector: string; properties: Record<string, string>; action?: 'merge' | 'replace' }, files: ProjectFile[]): ToolResult {
  const { selector, properties, action = 'merge' } = args;
  // Assume styles.css for now, or search for style files
  const file = files.find(f => f.path === 'styles.css' || f.fileType === 'style');
  if (!file) return { success: false, message: 'Style file not found (create styles.css first)' };

  try {
    const ast = csstree.parse(file.content, { context: 'stylesheet' }) as csstree.StyleSheet;
    let ruleFound = false;

    csstree.walk(ast, {
      visit: 'Rule',
      enter(node) {
        const rule = node as csstree.Rule;
        if (csstree.generate(rule.prelude) === selector) {
          ruleFound = true;
          const children = rule.block.children as csstree.List<csstree.CssNode>;
          
          if (action === 'replace') {
            children.clear();
          } else {
            // For merge action, filter out existing properties that we're about to update
            const propsToUpdate = new Set(Object.keys(properties));
            const filtered = children.filter((child) => {
              return !(child.type === 'Declaration' && propsToUpdate.has(child.property));
            });
            children.clear();
            filtered.forEach((node) => children.appendData(node));
          }
          
          Object.entries(properties).forEach(([prop, value]) => {
            const decl = csstree.parse(`${prop}: ${value}`, { context: 'declaration' });
            children.appendData(decl as csstree.CssNode);
          });
        }
      }
    });

    if (!ruleFound) {
      // Create new rule
      const decls = Object.entries(properties).map(([p, v]) => `${p}: ${v};`).join(' ');
      const newRule = csstree.parse(`${selector} { ${decls} }`, { context: 'rule' });
      ast.children.appendData(newRule as csstree.CssNode);
    }

    file.content = csstree.generate(ast);
    return { success: true, message: 'Styles updated', updatedFiles: [file] };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, message: `CSS Parse error: ${message}` };
  }
}

async function handleBatchEdit(args: { operations: Array<{ name: string, arguments: Record<string, unknown> }> }, files: ProjectFile[]): Promise<ToolResult> {
  const { operations } = args;
  const results: ToolResult[] = [];
  let currentFiles = [...files];

  for (const op of operations) {
    const res = await executeTool(op.name, op.arguments, currentFiles);
    if (!res.success) return res; // Stop on first error
    
    if (res.updatedFiles) {
      res.updatedFiles.forEach(uf => {
        const idx = currentFiles.findIndex(f => f.path === uf.path);
        if (idx >= 0) currentFiles[idx] = uf;
        else currentFiles.push(uf);
      });
    }
    if (res.deletedPaths) {
      currentFiles = currentFiles.filter(f => !res.deletedPaths?.includes(f.path));
    }
    results.push(res);
  }

  return { success: true, message: 'Batch edits applied', updatedFiles: currentFiles };
}
