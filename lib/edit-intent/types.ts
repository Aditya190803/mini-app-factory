import type { ProjectFile } from '@/lib/page-builder';

export enum EditType {
  UPDATE_COMPONENT = 'UPDATE_COMPONENT',
  ADD_FEATURE = 'ADD_FEATURE',
  FIX_ISSUE = 'FIX_ISSUE',
  REFACTOR = 'REFACTOR',
  FULL_REBUILD = 'FULL_REBUILD',
  UPDATE_STYLE = 'UPDATE_STYLE',
}

export interface HtmlEditIntent {
  type: EditType;
  targetFiles: string[];
  confidence: number;
  description: string;
}

export interface HtmlFileManifest {
  entryPoint: string;
  paths: string[];
  files: Record<string, ProjectFile>;
  stylePaths: string[];
  partialPaths: string[];
  pagePaths: string[];
}

export interface HtmlFileSelection {
  primaryFiles: string[];
  contextFiles: string[];
  editIntent: HtmlEditIntent;
  /** Resolved focus path (active tab, target element, or intent primary). */
  focusPath: string;
}