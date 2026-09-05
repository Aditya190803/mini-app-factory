import type { Metadata } from 'next'
import { ProsePage, ProseSection } from '@/components/shell/prose-page'

export const metadata: Metadata = {
  title: 'Support',
  description: 'How to report a problem with Mini App Factory and what to include.',
}

const TOC = [
  { id: 'report', label: 'Reporting a problem' },
  { id: 'include', label: 'What to include' },
  { id: 'first', label: 'Worth checking first' },
] as const

export default function SupportPage() {
  return (
    <ProsePage
      title="Support"
      subtitle="Issues go through the repository, where they stay visible and can be linked to a fix."
      toc={TOC}
    >
      <ProseSection id="report" title="Reporting a problem">
        <p>
          Open an issue at{' '}
          <a
            href="https://github.com/Aditya190803/mini-app-factory/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            github.com/Aditya190803/mini-app-factory
          </a>
          .
        </p>
      </ProseSection>

      <ProseSection id="include" title="What to include">
        <p>
          The <strong>project name</strong>, which is the slug in the editor URL. It is the fastest
          way to find what happened.
        </p>
        <p>
          Whether the project is a <strong>static site or an edge app</strong>, shown as a badge next
          to the name in the editor.
        </p>
        <p>
          What you expected and what happened instead, and the steps that get there from a fresh
          page load.
        </p>
        <p>
          The exact error text if there was one. A deploy failure shows its message in the deploy
          dialog rather than only in the console.
        </p>
        <p>
          Never paste an API token, an OAuth token, or the contents of a secret. None of them are
          needed to reproduce anything.
        </p>
      </ProseSection>

      <ProseSection id="first" title="Worth checking first">
        <p>
          <strong>A deploy is refused.</strong> Check that Cloudflare is still connected in Settings.
          Authorizations expire and are revocable from the Cloudflare side.
        </p>
        <p>
          <strong>A migration is rejected.</strong> Migrations that already ran cannot be edited, and
          destructive ones are refused on purpose. Add a new migration instead.
        </p>
        <p>
          <strong>Changes will not save.</strong> If the editor says the project was saved elsewhere,
          someone else has written to it. The bar at the top offers both recovery paths, and your
          edits are still in the page until you pick one.
        </p>
      </ProseSection>
    </ProsePage>
  )
}
