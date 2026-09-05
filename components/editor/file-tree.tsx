import React, { useState, useMemo } from 'react';
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
  onReorderFiles
}: FileTreeProps) {
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'assets': true,
    'partials': true
  });

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const getIcon = (file: ProjectFile) => {
    if (file.fileType === 'page') return <File className="w-4 h-4 text-[var(--muted-foreground)]" />;
    if (file.fileType === 'partial') return <Puzzle className="w-4 h-4 text-[var(--muted-foreground)]" />;
    if (file.fileType === 'style') return <Palette className="w-4 h-4 text-[var(--muted-foreground)]" />;
    if (file.fileType === 'script') return <Code className="w-4 h-4 text-[var(--muted-foreground)]" />;
    if (file.fileType === 'worker') return <CloudCog className="w-4 h-4 text-[var(--signal-text)]" />;
    if (file.fileType === 'migration') return <Database className="w-4 h-4 text-[var(--signal-text)]" />;
    if (file.fileType === 'config') return <Braces className="w-4 h-4 text-[var(--signal-text)]" />;
    return <FileCode className="w-4 h-4 text-[var(--muted-foreground)]" />;
  };

  const visibleItems = useMemo(() => {
    const items: VisibleItem[] = [];
    const folders = new Set<string>();
    
    // Identify all folders first
    files.forEach(f => {
      const parts = f.path.split('/');
      for (let i = 0; i < parts.length - 1; i++) {
        folders.add(parts.slice(0, i + 1).join('/'));
      }
    });

    const processFolder = (currentPath: string, depth: number) => {
      const folderPaths = Array.from(folders)
        .filter(p => {
          const parts = p.split('/');
          const parentPath = parts.slice(0, -1).join('/');
          return parentPath === currentPath;
        })
        .sort();

      const filesInFolder = files
        .filter(f => {
          const parts = f.path.split('/');
          const parentPath = parts.slice(0, -1).join('/');
          return parentPath === currentPath && parts[parts.length - 1] !== '.keep';
        });

      folderPaths.forEach(p => {
        const name = p.split('/').pop()!;
        const isExpanded = expandedFolders[p];
        items.push({ id: p, type: 'folder', name, path: p, depth, isExpanded });
        if (isExpanded) processFolder(p, depth + 1);
      });

      filesInFolder.forEach(f => {
        const name = f.path.split('/').pop()!;
        items.push({ id: f.path, type: 'file', name, path: f.path, depth, file: f });
      });
    };

    processFolder('', 0);
    return items;
  }, [files, expandedFolders]);

  const onDragEnd = (result: DropResult) => {
    // Handle drop on another item (Combine)
    if (result.combine) {
      const sourceItem = visibleItems.find(i => i.id === result.draggableId);
      const destItem = visibleItems.find(i => i.id === result.combine!.draggableId);
      
      if (sourceItem && destItem && destItem.type === 'folder') {
        onMoveItem(sourceItem.path, destItem.path);
      }
      return;
    }

    if (!result.destination) return;
    
    const sourceItem = visibleItems[result.source.index];
    const destItem = visibleItems[result.destination.index];
    
    // Check if we're moving an item to a different folder
    const destParentPath = destItem.type === 'folder' 
      ? destItem.path 
      : destItem.path.split('/').slice(0, -1).join('/');
    
    const sourceParentPath = sourceItem.path.split('/').slice(0, -1).join('/');

    // If moved to a different folder (either file or folder)
    if (sourceParentPath !== destParentPath) {
      // Prevent moving a folder into itself
      if (sourceItem.type === 'folder' && (destParentPath === sourceItem.path || destParentPath.startsWith(`${sourceItem.path}/`))) {
        return;
      }
      onMoveAndReorder(sourceItem.path, destParentPath, destItem.path);
      return;
    }

    // Reorder globally (same folder)
    if (sourceItem.path !== destItem.path) {
      onReorderFiles(sourceItem.path, destItem.path);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--sidebar)] border-r border-[var(--rule)] w-full select-none">
      <div className="p-3 flex items-center justify-between border-b border-[var(--rule)]">
        <h3 className="key flex items-center gap-2">
          Explorer
        </h3>
        <div className="flex gap-1">
          <IconButton
            size="sm"
            label="New Page"
            onClick={() => onNewFile('page')}
          >
            <Plus className="w-4 h-4" />
          </IconButton>
          <IconButton
            size="sm"
            label="New Partial"
            onClick={() => onNewFile('partial')}
          >
            <Puzzle className="w-4 h-4" />
          </IconButton>
          <IconButton
            size="sm"
            label="New Cloudflare Worker"
            onClick={() => onNewFile('worker')}
          >
            <CloudCog className="w-4 h-4" />
          </IconButton>
          <IconButton
            size="sm"
            label="New D1 Migration"
            onClick={() => onNewFile('migration')}
          >
            <Database className="w-4 h-4" />
          </IconButton>
          <IconButton
            size="sm"
            label="New Cloudflare Config"
            onClick={() => onNewFile('config')}
          >
            <Braces className="w-4 h-4" />
          </IconButton>
          <IconButton
            size="sm"
            label="New Folder"
            onClick={() => onNewFolder?.()}
          >
            <FolderPlus className="w-4 h-4" />
          </IconButton>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto py-2">
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="explorer-tree" isCombineEnabled>
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef}>
                {visibleItems.map((item, index) => (
                  <Draggable key={item.id} draggableId={item.id} index={index}>
                    {(provided, snapshot) => (
                      <ContextMenu>
                        <ContextMenuTrigger>
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={cn(
                              "group flex items-center py-1 cursor-pointer text-xs transition-colors",
                              item.type === 'folder' 
                                ? "hover:bg-[var(--surface-2)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                : activeFilePath === item.path 
                                  ? "row-selected font-medium" 
                                  : "text-[var(--muted-foreground)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]",
                              snapshot.isDragging && "bg-[var(--surface-3)] shadow-xl z-50 opacity-80",
                              snapshot.combineWith && "bg-[var(--signal-wash)] ring-2 ring-[var(--ring)]"
                            )}
                            style={{ 
                              ...provided.draggableProps.style,
                              paddingLeft: `${item.depth * 12 + 12}px` 
                            }}
                            onClick={() => item.type === 'folder' ? toggleFolder(item.path) : onFileSelect(item.path)}
                          >
                            {item.type === 'folder' && (
                              <span className="mr-1">
                                {item.isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              </span>
                            )}
                            <span className="mr-2">
                              {item.type === 'folder' 
                                ? (item.isExpanded ? <FolderOpen className="w-4 h-4 text-[var(--muted-foreground)]" /> : <Folder className="w-4 h-4 text-[var(--muted-foreground)]" />)
                                : getIcon(item.file!)
                              }
                            </span>
                            <span className={cn("flex-1 truncate", item.type === 'folder' && "font-medium")}>
                              {item.name}
                            </span>
                            {/* Also revealed on keyboard focus — hover alone
                                strands keyboard and touch users. */}
                            <div className="flex items-center gap-1 pr-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                              {item.path !== 'index.html' && (
                                <button
                                  className="p-1 hover:text-[var(--foreground)] transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onRenameItem?.(item.path);
                                  }}
                                  title="Rename"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                              )}
                              {item.path !== 'index.html' && (
                                <button
                                  className="p-1 hover:text-[var(--destructive-text)] transition-colors"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteItem(item.path, item.type);
                                  }}
                                  title={item.type === 'folder' ? "Delete Folder" : "Delete File"}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="bg-[var(--popover)] border-[var(--rule)] text-[var(--popover-foreground)] min-w-[160px]">
                          {item.type === 'folder' && (
                            <>
                              <ContextMenuSub>
                                <ContextMenuSubTrigger className="focus:bg-[var(--surface-3)] focus:text-[var(--foreground)] px-2 py-1.5 text-xs">
                                  <Plus className="mr-2 h-3.5 w-3.5" />
                                  <span>New File in folder</span>
                                </ContextMenuSubTrigger>
                                <ContextMenuSubContent className="bg-[var(--popover)] border-[var(--rule)] text-[var(--popover-foreground)]">
                                  <ContextMenuItem 
                                    className="focus:bg-[var(--surface-3)] focus:text-[var(--foreground)] px-2 py-1.5 text-xs"
                                    onClick={() => onNewFileInFolder?.(item.path, 'page')}
                                  >
                                    <File className="mr-2 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                                    <span>New Page</span>
                                  </ContextMenuItem>
                                  <ContextMenuItem 
                                    className="focus:bg-[var(--surface-3)] focus:text-[var(--foreground)] px-2 py-1.5 text-xs"
                                    onClick={() => onNewFileInFolder?.(item.path, 'partial')}
                                  >
                                    <Puzzle className="mr-2 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                                    <span>New Partial</span>
                                  </ContextMenuItem>
                                  <ContextMenuItem 
                                    className="focus:bg-[var(--surface-3)] focus:text-[var(--foreground)] px-2 py-1.5 text-xs"
                                    onClick={() => onNewFileInFolder?.(item.path, 'style')}
                                  >
                                    <Palette className="mr-2 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                                    <span>New Stylesheet</span>
                                  </ContextMenuItem>
                                  <ContextMenuItem 
                                    className="focus:bg-[var(--surface-3)] focus:text-[var(--foreground)] px-2 py-1.5 text-xs"
                                    onClick={() => onNewFileInFolder?.(item.path, 'script')}
                                  >
                                    <Code className="mr-2 h-3.5 w-3.5 text-[var(--muted-foreground)]" />
                                    <span>New Script</span>
                                  </ContextMenuItem>
                                  <ContextMenuItem
                                    className="focus:bg-[var(--surface-3)] focus:text-[var(--foreground)] px-2 py-1.5 text-xs"
                                    onClick={() => onNewFileInFolder?.(item.path, 'migration')}
                                  >
                                    <Database className="mr-2 h-3.5 w-3.5 text-[var(--signal-text)]" />
                                    <span>New D1 Migration</span>
                                  </ContextMenuItem>
                                </ContextMenuSubContent>
                              </ContextMenuSub>
                              <ContextMenuSeparator className="bg-[#333]" />
                            </>
                          )}
                          
                          {item.path !== 'index.html' && (
                            <ContextMenuItem 
                              className="focus:bg-[var(--surface-3)] focus:text-[var(--foreground)] px-2 py-1.5 text-xs"
                              onClick={() => onRenameItem?.(item.path)}
                            >
                              <Edit2 className="mr-2 h-3.5 w-3.5" />
                              <span>Rename</span>
                            </ContextMenuItem>
                          )}
                          
                          {item.type === 'file' && (
                            <ContextMenuItem 
                              className="focus:bg-[var(--surface-3)] focus:text-[var(--foreground)] px-2 py-1.5 text-xs"
                              onClick={() => onDuplicateItem?.(item.path)}
                            >
                              <Copy className="mr-2 h-3.5 w-3.5" />
                              <span>Duplicate</span>
                            </ContextMenuItem>
                          )}
                          
                          {item.path !== 'index.html' && (
                            <>
                              <ContextMenuSeparator className="bg-[#333]" />
                              <ContextMenuItem 
                                className="focus:bg-red-900/40 focus:text-red-200 px-2 py-1.5 text-xs text-red-500"
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
