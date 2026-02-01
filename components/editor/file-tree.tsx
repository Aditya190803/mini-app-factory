import React from 'react';
import { 
  File, 
  Files, 
  Code, 
  Palette, 
  FileCode, 
  Plus, 
  FolderPlus,
  Trash2,
  GripVertical
} from 'lucide-react';
import { ProjectFile } from '@/lib/page-builder';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

interface FileTreeProps {
  files: ProjectFile[];
  activeFilePath: string;
  onFileSelect: (path: string) => void;
  onNewFile: (type: ProjectFile['fileType']) => void;
  onDeleteFile: (path: string) => void;
  onReorderFiles: (startIndex: number, endIndex: number) => void;
}

export default function FileTree({ 
  files, 
  activeFilePath, 
  onFileSelect,
  onNewFile,
  onDeleteFile,
  onReorderFiles
}: FileTreeProps) {
  const getIcon = (file: ProjectFile) => {
    if (file.fileType === 'page') return <File className="w-4 h-4 text-blue-400" />;
    if (file.fileType === 'partial') return <Files className="w-4 h-4 text-purple-400" />;
    if (file.fileType === 'style') return <Palette className="w-4 h-4 text-pink-400" />;
    if (file.fileType === 'script') return <Code className="w-4 h-4 text-yellow-400" />;
    return <FileCode className="w-4 h-4 text-gray-400" />;
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    onReorderFiles(result.source.index, result.destination.index);
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] border-r border-[#2d2d2d] w-64 select-none">
      <div className="p-3 flex items-center justify-between border-b border-[#2d2d2d]">
        <h3 className="text-xs font-semibold uppercase text-gray-500 tracking-wider">Explorer</h3>
        <div className="flex gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 hover:bg-[#2d2d2d]"
            onClick={() => onNewFile('page')}
            title="New Page"
          >
            <Plus className="w-4 h-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-6 w-6 hover:bg-[#2d2d2d]"
            onClick={() => onNewFile('partial')}
            title="New Partial"
          >
            <FolderPlus className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto py-2">
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="files-list">
            {(provided) => (
              <div {...provided.droppableProps} ref={provided.innerRef}>
                {files.map((file, index) => (
                  <Draggable key={file.path} draggableId={file.path} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        className={cn(
                          "group flex items-center px-2 py-1.5 cursor-pointer text-sm transition-colors",
                          activeFilePath === file.path 
                            ? "bg-[#2d2d2d] text-white" 
                            : "text-gray-400 hover:bg-[#252525] hover:text-gray-200",
                          snapshot.isDragging && "bg-[#363636] shadow-xl z-50",
                          activeFilePath === file.path && !snapshot.isDragging && "border-l-2 border-blue-500"
                        )}
                        onClick={() => onFileSelect(file.path)}
                      >
                        <div {...provided.dragHandleProps} className="mr-1 opacity-0 group-hover:opacity-40 hover:opacity-100 transition-opacity">
                          <GripVertical className="w-3.5 h-3.5" />
                        </div>
                        <span className="mr-2 opacity-80 shrink-0">{getIcon(file)}</span>
                        <span className="flex-1 truncate">{file.path}</span>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {file.path !== 'index.html' && (
                            <button
                              className="p-1 hover:text-red-400 transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteFile(file.path);
                              }}
                              title="Delete File"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      </div>
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
