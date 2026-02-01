import * as cheerio from 'cheerio';
import * as csstree from 'css-tree';
import { ProjectFile } from './page-builder';

export interface ToolResult {
  success: boolean;
  message: string;
  updatedFiles?: ProjectFile[];
  deletedPaths?: string[];
}

export async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  files: ProjectFile[]
): Promise<ToolResult> {
  const fileList = [...files];

  switch (toolName) {
    case 'replaceContent':
      return handleReplaceContent(args as Parameters<typeof handleReplaceContent>[0], fileList);
    case 'replaceElement':
      return handleReplaceElement(args as Parameters<typeof handleReplaceElement>[0], fileList);
    case 'insertContent':
      return handleInsertContent(args as Parameters<typeof handleInsertContent>[0], fileList);
    case 'deleteContent':
      return handleDeleteContent(args as Parameters<typeof handleDeleteContent>[0], fileList);
    case 'createFile':
      return handleCreateFile(args as Parameters<typeof handleCreateFile>[0], fileList);
    case 'deleteFile':
      return handleDeleteFile(args as Parameters<typeof handleDeleteFile>[0], fileList);
    case 'renameFile':
      return handleRenameFile(args as Parameters<typeof handleRenameFile>[0], fileList);
    case 'updateStyle':
      return handleUpdateStyle(args as Parameters<typeof handleUpdateStyle>[0], fileList);
    case 'batchEdit':
      return handleBatchEdit(args as Parameters<typeof handleBatchEdit>[0], fileList);
    default:
      return { success: false, message: `Unknown tool: ${toolName}` };
  }
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

    if (oldContent && !element.html()?.includes(oldContent)) {
      return { success: false, message: `Old content mismatch for selector: ${selector}` };
    }

    element.html(newContent);
    file.content = $.html();
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

  return { success: false, message: `Deletion not supported for ${file.language}` };
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
    const ast = csstree.parse(file.content);
    let ruleFound = false;

    csstree.walk(ast, {
      visit: 'Rule',
      enter(node) {
        if (csstree.generate(node.prelude) === selector) {
          ruleFound = true;
          if (action === 'replace') {
            // @ts-ignore
            node.block.children.clear();
          }
          
          Object.entries(properties).forEach(([prop, value]) => {
            // This is a simplified CSS property update
            // A more robust implementation would use csstree to parse and replace declarations
            const decl = csstree.parse(`${prop}: ${value}`, { context: 'declaration' });
            // @ts-ignore
            node.block.children.appendData(decl);
          });
        }
      }
    });

    if (!ruleFound) {
      // Create new rule
      const decls = Object.entries(properties).map(([p, v]) => `${p}: ${v};`).join(' ');
      const newRule = csstree.parse(`${selector} { ${decls} }`, { context: 'rule' });
      // @ts-ignore
      ast.children.push(newRule);
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
