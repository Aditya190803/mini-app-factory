import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import { Button, EmptyState } from '@/components/kit'

export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-6"
    >
      <div className="w-full max-w-md">
        <EmptyState
          title="Nothing at this address"
          icon={<FileQuestion className="size-5" />}
          action={
            <div className="flex gap-2">
              <Button intent="primary" asChild>
                <Link href="/">Back to the composer</Link>
              </Button>
              <Button asChild>
                <Link href="/dashboard">Your projects</Link>
              </Button>
            </div>
          }
        >
          <p>The page does not exist, or the project it belonged to was deleted.</p>
        </EmptyState>
      </div>
    </main>
  )
}
