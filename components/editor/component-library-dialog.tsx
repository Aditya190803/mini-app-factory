'use client'

import * as React from 'react'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { Library, Plus, Trash2 } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import type { ProjectFile } from '@/lib/page-builder'
import {
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  Modal,
  ModalContent,
  Row,
  RowList,
  Skeleton,
} from '@/components/kit'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  activeFile?: ProjectFile
  files: ProjectFile[]
  onInsert: (file: ProjectFile) => void
}

/**
 * Saved components.
 *
 * Insert never overwrites: if the saved path collides with a file already in
 * the project, the new one gets a numbered suffix and the toast says where it
 * actually landed.
 */
export default function ComponentLibraryDialog({
  open,
  onOpenChange,
  activeFile,
  files,
  onInsert,
}: Props) {
  const components = useQuery(api.components.list, open ? {} : 'skip')
  const save = useMutation(api.components.save)
  const remove = useMutation(api.components.remove)
  const [name, setName] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const saveActive = async () => {
    if (!activeFile || !name.trim()) return
    setBusy(true)
    try {
      await save({
        name,
        path: activeFile.path,
        content: activeFile.content,
        language: activeFile.language,
        fileType: activeFile.fileType,
      })
      setName('')
      toast.success('Saved to your library')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save that component')
    } finally {
      setBusy(false)
    }
  }

  const insert = (component: NonNullable<typeof components>[number]) => {
    const parts = component.path.split('/')
    const basename = parts.pop() || 'component.html'
    const dot = basename.lastIndexOf('.')
    const stem = dot > 0 ? basename.slice(0, dot) : basename
    const extension = dot > 0 ? basename.slice(dot) : ''

    let path = component.path
    let counter = 2
    while (files.some((file) => file.path === path)) {
      path = [...parts, `${stem}-${counter++}${extension}`].filter(Boolean).join('/')
    }

    onInsert({
      path,
      content: component.content,
      language: component.language,
      fileType: component.fileType,
    })
    onOpenChange(false)
    toast.success(`Inserted ${component.name}`, { description: `Written to ${path}` })
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        title="Component library"
        description="Save a file once and reuse it in any project. Components are yours alone."
      >
        <Field
          label="Save the current file"
          hint={
            activeFile
              ? `Saves ${activeFile.path} as it is right now.`
              : 'Open a file in the editor first.'
          }
        >
          <div className="flex gap-2">
            <Input
              value={name}
              maxLength={80}
              disabled={!activeFile || busy}
              placeholder={activeFile ? 'Name it, for example Pricing table' : 'No file open'}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void saveActive()
              }}
            />
            <Button
              onClick={() => void saveActive()}
              busy={busy}
              disabled={!activeFile || !name.trim()}
            >
              Save
            </Button>
          </div>
        </Field>

        <div className="mt-5">
          <p className="key mb-2">Your components</p>

          {components === undefined && (
            <div className="space-y-px overflow-hidden rounded-lg border border-[var(--rule)]">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 bg-[var(--surface-1)] px-4 py-3">
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {components?.length === 0 && (
            <EmptyState title="Nothing saved yet" icon={<Library className="size-5" />}>
              <p>Save the file you have open above, then insert it into any project later.</p>
            </EmptyState>
          )}

          {components && components.length > 0 && (
            <RowList>
              {components.map((component) => (
                <Row key={component._id}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{component.name}</p>
                    <p className="truncate font-mono text-[11px] text-[var(--muted-foreground)]">
                      {component.path} · {component.fileType}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => insert(component)}>
                    <Plus className="size-3.5" />
                    Insert
                  </Button>
                  <IconButton
                    label={`Delete ${component.name}`}
                    size="sm"
                    intent="danger"
                    onClick={async () => {
                      await remove({ componentId: component._id })
                      toast.success('Component removed')
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                </Row>
              ))}
            </RowList>
          )}
        </div>
      </ModalContent>
    </Modal>
  )
}
