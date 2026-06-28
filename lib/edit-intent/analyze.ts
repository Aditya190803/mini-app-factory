import type { HtmlFileManifest, HtmlEditIntent, EditType } from './types';
import { EditType as ET } from './types';

type Pattern = {
  patterns: RegExp[];
  type: EditType;
  resolve: (prompt: string, m: HtmlFileManifest) => string[];
};

const UI_ELEMENTS = [
  'header', 'footer', 'nav', 'hero', 'banner', 'about', 'services', 'features',
  'testimonials', 'gallery', 'contact', 'team', 'pricing', 'button', 'card', 'modal',
];

function unique(paths: string[]): string[] {
  return [...new Set(paths.filter(Boolean))];
}

function extractSearchTerms(prompt: string): string[] {
  const quoted = (prompt.match(/["']([^"']+)["']/g) || []).map((s) => s.replace(/["']/g, ''));
  const action = prompt.match(/(?:remove|delete|hide|change|update)\s+(?:the\s+)?(.+?)(?:\s+button|\s+link|\s+text|\s+section|$)/i);
  if (action?.[1]) quoted.push(action[1].trim());
  return quoted.filter((t) => t.length > 1);
}

function findByPathKeyword(prompt: string, manifest: HtmlFileManifest): string[] {
  const lower = prompt.toLowerCase();
  const hits: string[] = [];

  for (const path of manifest.paths) {
    const base = path.split('/').pop()?.replace(/\.(html|css|js)$/i, '').toLowerCase() ?? '';
    if (base.length > 2 && lower.includes(base)) hits.push(path);
  }

  for (const el of UI_ELEMENTS) {
    if (!lower.includes(el)) continue;
    const partial = manifest.partialPaths.find((p) => p.toLowerCase().includes(el));
    if (partial) return [partial];
    const page = manifest.pagePaths.find((p) => p.toLowerCase().includes(el));
    if (page) return [page];
  }

  return hits.length ? [hits[0]] : [];
}

function findByContent(prompt: string, manifest: HtmlFileManifest): string[] {
  const terms = extractSearchTerms(prompt);
  if (terms.length === 0) return [];

  for (const path of [...manifest.pagePaths, ...manifest.partialPaths]) {
    const file = manifest.files[path];
    if (!file) continue;
    const content = file.content.toLowerCase();
    for (const term of terms) {
      if (content.includes(term.toLowerCase())) return [path];
    }
  }
  return [];
}

function findStyleTargets(_prompt: string, manifest: HtmlFileManifest): string[] {
  const css = manifest.stylePaths;
  if (css.length) return css;
  return manifest.pagePaths.filter((p) => manifest.files[p]?.content.includes('<style'));
}

function findNewPageTargets(prompt: string, manifest: HtmlFileManifest): string[] {
  const lower = prompt.toLowerCase();
  const targets = [manifest.entryPoint, ...manifest.partialPaths];
  if (lower.includes('page') || lower.includes('nav')) {
    targets.push(...manifest.pagePaths);
  }
  const loc = prompt.match(/(?:in|to|on|inside)\s+(?:the\s+)?([a-zA-Z0-9._-]+)/i);
  if (loc?.[1]) {
    const byKw = findByPathKeyword(loc[1], manifest);
    if (byKw.length) targets.push(...byKw);
  }
  return unique(targets);
}

const PATTERNS: Pattern[] = [
  {
    patterns: [
      /start\s+over/i, /recreate\s+everything/i, /rebuild\s+(the\s+)?(site|app)/i, /from\s+scratch/i,
    ],
    type: ET.FULL_REBUILD,
    resolve: (_p, m) => [m.entryPoint],
  },
  {
    patterns: [
      /change\s+(the\s+)?(color|theme|style|styling|css)/i,
      /update\s+(the\s+)?(color|theme|style|styling|css)/i,
      /make\s+it\s+(dark|light)/i,
      /style\s+(the\s+)?(\w+)/i,
    ],
    type: ET.UPDATE_STYLE,
    resolve: findStyleTargets,
  },
  {
    patterns: [
      /add\s+(a\s+)?new\s+(\w+)\s+(page|section)/i,
      /create\s+(a\s+)?(\w+)\s+(page|section)/i,
      /add\s+(?:a\s+)?(\w+)\s+(?:page|section)/i,
    ],
    type: ET.ADD_FEATURE,
    resolve: findNewPageTargets,
  },
  {
    patterns: [/fix\s+/i, /resolve\s+(the\s+)?error/i, /debug\s+/i, /broken/i, /not working/i],
    type: ET.FIX_ISSUE,
    resolve: (p, m) => unique([...findByPathKeyword(p, m), ...findByContent(p, m), m.entryPoint]),
  },
  {
    patterns: [/refactor/i, /clean\s+up/i, /reorganize/i],
    type: ET.REFACTOR,
    resolve: (p, m) => findByPathKeyword(p, m).length ? findByPathKeyword(p, m) : [m.entryPoint],
  },
  {
    patterns: [
      /update\s+(the\s+)?(\w+)/i,
      /change\s+(the\s+)?(\w+)/i,
      /modify\s+(the\s+)?(\w+)/i,
      /edit\s+(the\s+)?(\w+)/i,
      /remove\s+/i,
      /delete\s+/i,
    ],
    type: ET.UPDATE_COMPONENT,
    resolve: (p, m) => {
      const byContent = findByContent(p, m);
      if (byContent.length) return byContent;
      const byKw = findByPathKeyword(p, m);
      if (byKw.length) return byKw;
      return [m.entryPoint];
    },
  },
];

function describeIntent(type: EditType, targets: string[]): string {
  const names = targets.map((t) => t.split('/').pop()).join(', ');
  switch (type) {
    case ET.UPDATE_STYLE: return `Adjust styling (likely ${names})`;
    case ET.ADD_FEATURE: return `Add or extend site structure (focus: ${names})`;
    case ET.FULL_REBUILD: return 'Large-scale rebuild';
    case ET.FIX_ISSUE: return `Fix issue in ${names}`;
    default: return `Edit ${names}`;
  }
}

export function analyzeHtmlEditIntent(prompt: string, manifest: HtmlFileManifest): HtmlEditIntent {
  const trimmed = prompt.trim();
  if (!trimmed) {
    return {
      type: ET.UPDATE_COMPONENT,
      targetFiles: [manifest.entryPoint],
      confidence: 0.2,
      description: 'General update',
    };
  }

  for (const pattern of PATTERNS) {
    for (const regex of pattern.patterns) {
      if (!regex.test(trimmed)) continue;
      const targetFiles = pattern.resolve(trimmed, manifest);
      const primary = targetFiles.length ? targetFiles : [manifest.entryPoint];
      return {
        type: pattern.type,
        targetFiles: unique(primary),
        confidence: 0.75,
        description: describeIntent(pattern.type, primary),
      };
    }
  }

  return {
    type: ET.UPDATE_COMPONENT,
    targetFiles: [manifest.entryPoint],
    confidence: 0.35,
    description: describeIntent(ET.UPDATE_COMPONENT, [manifest.entryPoint]),
  };
}