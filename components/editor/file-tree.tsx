import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  File,
  Code,
  Palette,
  FileCode,
  Plus,
  FolderPlus,
  Trash2,
  Puzzle,
  Folder,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Edit2,
  Copy,
  CloudCog,
  Database,
  Braces,
} from 'lucide-react';
import { ProjectFile } from '@/lib/page-builder';
import { cn } from '@/lib/utils';
import { IconButton } from '@/components/kit';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/kit/context-menu';

interface FileTreeProps {
  files: ProjectFile[];
  activeFilePath: string;
  onFileSelect: (path: string) => void;
  onNewFile: (type: ProjectFile['fileType']) => void;
  onNewFolder?: () => void;
  onDeleteItem: (path: string, type: 'file' | 'folder') => void;
  onRenameItem?: (path: string) => void;
  onDuplicateItem?: (path: string) => void;
  onNewFileInFolder?: (folderPath: string, type: ProjectFile['fileType']) => void;
  onMoveItem: (sourcePath: string, destinationPath: string) => void;
  onMoveAndReorder: (sourcePath: string, destFolderPath: string, targetPath: string) => void;
  onReorderFiles: (sourcePath: string, destinationPath: string) => void;
}

type VisibleItem = {
  id: string;
  type: 'file' | 'folder';
  name: string;
  path: string;
  depth: number;
  file?: ProjectFile;
  isExpanded?: boolean;
};

const MENU_ITEM = 'focus:bg-[var(--surface-3)] focus:text-[var(--foreground)] px-2 py-1.5 text-xs';

function FileIcon({ file }: { file: ProjectFile }) {
  const muted = 'w-4 h-4 text-[var(--muted-foreground)]';
  const signal = 'w-4 h-4 text-[var(--signal-text)]';
  if (file.fileType === 'page') return <File className={muted} />;
  if (file.fileType === 'partial') return <Puzzle className={muted} />;
  if (file.fileType === 'style') return <Palette className={muted} />;
  if (file.fileType === 'script') return <Code className={muted} />;
  if (file.fileType === 'worker') return <CloudCog className={signal} />;
  if (file.fileType === 'migration') return <Database className={signal} />;
  if (file.fileType === 'config') return <Braces className={signal} />;
  return <FileCode className={muted} />;
}

/**
 * The project's file tree, following the WAI-ARIA tree pattern: one row is in the tab order, the
 * arrow keys move between rows and fold folders, Enter opens, F2 renames and Delete deletes. The
 * tree used to be mouse-only: rows were divs with click handlers, Enter did nothing, and the
 * action buttons were labelled only by `title`.
 */
export default function FileTree({
  files,
  activeFilePath,
  onFileSelect,
  onNewFile,
  onNewFolder,
  onDeleteItem,
  onRenameItem,
  onDuplicateItem,
  onNewFileInFolder,
  onMoveItem,
  onMoveAndReorder,
  onReorderFiles,
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    assets: true,
    partials: true,
  });
  const [focusedPath, setFocusedPath] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const visibleItems = useMemo(() => {
    const items: VisibleItem[] = [];
    const folders = new Set<string>();

    files.forEach((f) => {
      const parts = f.path.split('/');
      for (let i = 0; i < parts.length - 1; i++) {
        folders.add(parts.slice(0, i + 1).join('/'));
      }
    });

    const processFolder = (currentPath: string, depth: number) => {
      const folderPaths = Array.from(folders)
        .filter((p) => p.split('/').slice(0, -1).join('/') === currentPath)
        .sort();

      const filesInFolder = files.filter((f) => {
        const parts = f.path.split('/');
        return parts.slice(0, -1).join('/') === currentPath && parts[parts.length - 1] !== '.keep';
      });

      folderPaths.forEach((p) => {
        const name = p.split('/').pop()!;
        const isExpanded = expandedFolders[p];
        items.push({ id: p, type: 'folder', name, path: p, depth, isExpanded });
        if (isExpanded) processFolder(p, depth + 1);
      });

      filesInFolder.forEach((f) => {
        items.push({ id: f.path, type: 'file', name: f.path.split('/').pop()!, path: f.path, depth, file: f });
      });
    };

    processFolder('', 0);
    return items;
  }, [files, expandedFolders]);

  const tabStop = visibleItems.some((item) => item.path === focusedPath)
    ? focusedPath
    : visibleItems.find((item) => item.path === activeFilePath)?.path ?? visibleItems[0]?.path ?? null;

  // A rename or move can take the focused row away; fall back to the default tab stop.
  useEffect(() => {
    if (focusedPath && !visibleItems.some((item) => item.path === focusedPath)) setFocusedPath(null);
  }, [focusedPath, visibleItems]);

  const focusRow = (path: string | undefined) => {
    if (!path) return;
    setFocusedPath(path);
    rowRefs.current.get(path)?.focus();
  };

  const onRowKeyDown = (event: React.KeyboardEvent, item: VisibleItem, index: number) => {
    const parentPath = item.path.split('/').slice(0, -1).join('/');
    switch (event.key) {
      case 'ArrowDown':
        focusRow(visibleItems[index + 1]?.path);
        break;
      case 'ArrowUp':
        focusRow(visibleItems[index - 1]?.path);
        break;
      case 'Home':
        focusRow(visibleItems[0]?.path);
        break;
      case 'End':
        focusRow(visibleItems[visibleItems.length - 1]?.path);
        break;
      case 'ArrowRight':
        if (item.type !== 'folder') return;
        if (!item.isExpanded) toggleFolder(item.path);
        else if (visibleItems[index + 1]?.depth === item.depth + 1) focusRow(visibleItems[index + 1]?.path);
        break;
      case 'ArrowLeft':
        if (item.type === 'folder' && item.isExpanded) toggleFolder(item.path);
        else if (parentPath) focusRow(parentPath);
        break;
      case 'Enter':
        if (item.type === 'folder') toggleFolder(item.path);
        else onFileSelect(item.path);
        break;
      case 'F2':
        if (item.path !== 'index.html') onRenameItem?.(item.path);
        break;
      case 'Delete':
        if (item.path !== 'index.html') onDeleteItem(item.path, item.type);
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const onDragEnd = (result: DropResult) => {
    // Dropped onto another item.
    if (result.combine) {
      const sourceItem = visibleItems.find((i) => i.id === result.draggableId);
      const destItem = visibleItems.find((i) => i.id === result.combine!.draggableId);
      if (sourceItem && destItem && destItem.type === 'folder') onMoveItem(sourceItem.path, destItem.path);
      return;
    }

    if (!result.destination) return;
    const sourceItem = visibleItems[result.source.index];
    const destItem = visibleItems[result.destination.index];
    if (!sourceItem || !destItem) return;

    const destParentPath = destItem.type === 'folder' ? destItem.path : destItem.path.split('/').slice(0, -1).join('/');
    const sourceParentPath = sourceItem.path.split('/').slice(0, -1).join('/');

    if (sourceParentPath !== destParentPath) {
      onMoveAndReorder(sourceItem.path, destParentPath, destItem.path);
      return;
    }
    if (sourceItem.path !== destItem.path) onReorderFiles(sourceItem.path, destItem.path);
  };

  return (
    <div className="flex h-full w-full select-none flex-col border-r border-[var(--rule)] bg-[var(--sidebar)]">
      <div className="flex items-center justify-between border-b border-[var(--rule)] p-3">
        <h3 id="file-tree-heading" className="key flex items-center gap-2">
          Explorer
        </h3>
        <div className="flex gap-1">
          <IconButton size="sm" label="New page" onClick={() => onNewFile('page')}>
            <Plus className="h-4 w-4" />
          </IconButton>
          <IconButton size="sm" label="New partial" onClick={() => onNewFile('partial')}>
            <Puzzle className="h-4 w-4" />
          </IconButton>
          <IconButton size="sm" label="New Cloudflare Worker" onClick={() => onNewFile('worker')}>
            <CloudCog className="h-4 w-4" />
          </IconButton>
          <IconButton size="sm" label="New D1 migration" onClick={() => onNewFile('migration')}>
            <Database className="h-4 w-4" />
          </IconButton>
          <IconButton size="sm" label="New Wrangler config" onClick={() => onNewFile('config')}>
            <Braces className="h-4 w-4" />
          </IconButton>
          <IconButton size="sm" label="New folder" onClick={() => onNewFolder?.()}>
            <FolderPlus className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="explorer-tree" isCombineEnabled>
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef} role="tree" aria-labelledby="file-tree-heading">
                {visibleItems.map((item, index) => (
                  <Draggable key={item.id} draggableId={item.id} index={index}>
                    {(provided, snapshot) => (
                      <ContextMenu>
                        <ContextMenuTrigger>
                          <div
                            ref={(node) => {
                              provided.innerRef(node);
                              if (node) rowRefs.current.set(item.path, node);
                              else rowRefs.current.delete(item.path);
                            }}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            // After the drag-handle props, so the tree's semantics and roving
                            // tabindex win over the library's role="button" and tabIndex={0}.
                            role="treeitem"
                            aria-level={item.depth + 1}
                            aria-expanded={item.type === 'folder' ? Boolean(item.isExpanded) : undefined}
                            aria-selected={item.type === 'file' ? activeFilePath === item.path : undefined}
                            aria-label={item.type === 'folder' ? `${item.name} folder` : item.name}
                            tabIndex={tabStop === item.path ? 0 : -1}
                            onFocus={() => setFocusedPath(item.path)}
                            onKeyDown={(event) => onRowKeyDown(event, item, index)}
                            onClick={() => (item.type === 'folder' ? toggleFolder(item.path) : onFileSelect(item.path))}
                            className={cn(
                              'group flex cursor-pointer items-center py-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--ring)]',
                              item.type === 'folder'
                                ? 'text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]'
                                : activeFilePath === item.path
                                  ? 'row-selected font-medium'
                                  : 'text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]',
                              snapshot.isDragging && 'z-50 bg-[var(--surface-3)] opacity-80 shadow-[var(--shadow-lg)]',
                              snapshot.combineWith && 'bg-[var(--signal-wash)] ring-2 ring-[var(--ring)]'
                            )}
                            style={{ ...provided.draggableProps.style, paddingLeft: `${item.depth * 12 + 12}px` }}
                          >
                            {item.type === 'folder' && (
                              <span className="mr-1" aria-hidden>
                                {item.isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                              </span>
                            )}
                            <span className="mr-2" aria-hidden>
                              {item.type === 'folder' ? (
                                item.isExpanded ? (
                                  <FolderOpen className="h-4 w-4 text-[var(--muted-foreground)]" />
                                ) : (
                                  <Folder className="h-4 w-4 text-[var(--muted-foreground)]" />
                                )
                              ) : (
                                <FileIcon file={item.file!} />
                              )}
                            </span>
                            <span className={cn('flex-1 truncate', item.type === 'folder' && 'font-medium')}>{item.name}</span>
                            {/* Revealed on hover and keyboard focus. Out of the tab order: F2 and
                                Delete do the same from the row itself. */}
                            {item.path !== 'index.html' && (
                              <div className="flex items-center gap-1 pr-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100">
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  className="p-1 transition-colors hover:text-[var(--foreground)]"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onRenameItem?.(item.path);
                                  }}
                                  aria-label={`Rename ${item.name}`}
                                  title="Rename (F2)"
                                >
                                  <Edit2 aria-hidden className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  tabIndex={-1}
                                  className="p-1 transition-colors hover:text-[var(--destructive-text)]"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onDeleteItem(item.path, item.type);
                                  }}
                                  aria-label={`Delete ${item.name}`}
                                  title="Delete (Del)"
                                >
                                  <Trash2 aria-hidden className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="min-w-[160px] border-[var(--rule)] bg-[var(--popover)] text-[var(--popover-foreground)]">
                          {item.type === 'folder' && (
                            <>
                              <ContextMenuSub>
                                <ContextMenuSubTrigger className={MENU_ITEM}>
                                  <Plus className="mr-2 h-3.5 w-3.5" />
                                  <span>New file in folder</span>
                                </ContextMenuSubTrigger>
                                <ContextMenuSubContent className="border-[var(--rule)] bg-[var(--popover)] text-[var(--popover-foreground)]">
                                  <ContextMenuItem className={MENU_ITEM} onClick={() => onNewFileInFolder?.(item.path, 'page')}>
                                    <File className="mr-2 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                                    <span>New page</span>
                                  </ContextMenuItem>
                                  <ContextMenuItem className={MENU_ITEM} onClick={() => onNewFileInFolder?.(item.path, 'partial')}>
                                    <Puzzle className="mr-2 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                                    <span>New partial</span>
                                  </ContextMenuItem>
                                  <ContextMenuItem className={MENU_ITEM} onClick={() => onNewFileInFolder?.(item.path, 'style')}>
                                    <Palette className="mr-2 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                                    <span>New stylesheet</span>
                                  </ContextMenuItem>
                                  <ContextMenuItem className={MENU_ITEM} onClick={() => onNewFileInFolder?.(item.path, 'script')}>
                                    <Code className="mr-2 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                                    <span>New script</span>
                                  </ContextMenuItem>
                                  <ContextMenuItem className={MENU_ITEM} onClick={() => onNewFileInFolder?.(item.path, 'migration')}>
                                    <Database className="mr-2 h-3.5 w-3.5 text-[var(--signal-text)]" />
                                    <span>New D1 migration</span>
                                  </ContextMenuItem>
                                </ContextMenuSubContent>
                              </ContextMenuSub>
                              <ContextMenuSeparator className="bg-[var(--rule)]" />
                            </>
                          )}

                          {item.path !== 'index.html' && (
                            <ContextMenuItem className={MENU_ITEM} onClick={() => onRenameItem?.(item.path)}>
                              <Edit2 className="mr-2 h-3.5 w-3.5" />
                              <span>Rename</span>
                            </ContextMenuItem>
                          )}

                          {item.type === 'file' && (
                            <ContextMenuItem className={MENU_ITEM} onClick={() => onDuplicateItem?.(item.path)}>
                              <Copy className="mr-2 h-3.5 w-3.5" />
                              <span>Duplicate</span>
                            </ContextMenuItem>
                          )}

                          {item.path !== 'index.html' && (
                            <>
                              <ContextMenuSeparator className="bg-[var(--rule)]" />
                              <ContextMenuItem
                                className="px-2 py-1.5 text-xs text-[var(--destructive-text)] focus:bg-[var(--surface-3)] focus:text-[var(--destructive-text)]"
                                onClick={() => onDeleteItem(item.path, item.type)}
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />
                                <span>Delete</span>
                              </ContextMenuItem>
                            </>
                          )}
                        </ContextMenuContent>
                      </ContextMenu>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      </div>
    </div>
  );
}
