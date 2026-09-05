import type { Metadata } from 'next'
import { ProsePage, ProseSection } from '@/components/shell/prose-page'
import { SpecTable } from '@/components/kit'

export const metadata: Metadata = {
  title: 'Documentation',
  description:
    'How a project is built, what a static site and an edge app each contain, and how deploying to Cloudflare works.',
}

const TOC = [
  { id: 'start', label: 'Getting started' },
  { id: 'targets', label: 'Static sites and edge apps' },
  { id: 'files', label: 'What is in a project' },
  { id: 'manifest', label: 'The manifest' },
  { id: 'migrations', label: 'Migrations' },
  { id: 'editing', label: 'Editing' },
  { id: 'deploy', label: 'Deploying' },
  { id: 'preview', label: 'Previews' },
  { id: 'export', label: 'Export and portability' },
  { id: 'models', label: 'Models and keys' },
  { id: 'shortcuts', label: 'Shortcuts' },
] as const

export default function DocsPage() {
  return (
    <ProsePage
      title="Documentation"
      subtitle="What the factory produces, where it runs, and what it will not do without asking you first."
      toc={TOC}
    >
      <ProseSection id="start" title="Getting started">
        <p>
          Describe the application on the home page and press Build. You land in the editor with the
          generated files, a preview, and a conversation you can keep going in.
        </p>
        <p>
          Signing in is only needed to keep a project. Deploying additionally needs a connected
          Cloudflare account.
        </p>
      </ProseSection>

      <ProseSection id="targets" title="Static sites and edge apps">
        <p>Every project is one of two shapes, and the shape is read off the files.</p>
        <div className="not-prose my-5">
          <SpecTable
            caption="Build targets"
            rows={[
              {
                key: 'static-what',
                label: 'Static site',
                value: 'Pages, styles, and browser scripts. No server, no database.',
              },
              {
                key: 'static-runs',
                label: 'Runs on',
                value: 'Cloudflare Pages, as a plain asset bundle',
              },
              {
                key: 'static-creates',
                label: 'Creates',
                value: 'Nothing billable',
                muted: true,
              },
              {
                key: 'edge-what',
                label: 'Edge app',
                value: 'The same assets plus a Worker and, usually, stored data.',
              },
              {
                key: 'edge-runs',
                label: 'Runs on',
                value: 'Cloudflare Pages and Workers, with D1, KV, R2, Queues as needed',
              },
              {
                key: 'edge-creates',
                label: 'Creates',
                value: 'The Worker and the bindings you approve. Nothing before that.',
              },
            ]}
          />
        </div>
        <p>
          A project becomes an edge app the moment it contains a <code>_worker.js</code>, a SQL
          migration, or a Cloudflare config file. You do not set a mode, and there is no mode to
          forget to change. The badge next to the project name in the editor shows which one you
          have.
        </p>
        <p>
          On the home page you can steer this: pick <strong>Static site</strong> to keep it to
          assets, pick <strong>Edge app</strong> to ask for a backend, or leave it on{' '}
          <strong>Decide for me</strong> and let the description settle it.
        </p>
      </ProseSection>

      <ProseSection id="files" title="What is in a project">
        <div className="not-prose my-5">
          <SpecTable
            dense
            caption="File kinds"
            rows={[
              { key: 'page', label: <code>*.html</code>, value: 'A route. index.html is the home page.', mono: true },
              { key: 'partial', label: 'partials', value: 'Reusable markup, included with an include comment.' },
              { key: 'style', label: <code>*.css</code>, value: 'Stylesheets. Editing one hot-swaps in the preview.', mono: true },
              { key: 'script', label: <code>*.js</code>, value: 'Browser JavaScript.', mono: true },
              { key: 'worker', label: <code>_worker.js</code>, value: 'The Worker entry point. Edge apps only.', mono: true },
              { key: 'migration', label: <code>migrations/*.sql</code>, value: 'Ordered D1 schema changes.', mono: true },
              { key: 'config', label: <code>cloudflare.manifest.json</code>, value: 'Declared bindings and runtime settings.', mono: true },
            ]}
          />
        </div>
      </ProseSection>

      <ProseSection id="manifest" title="The manifest">
        <p>
          An edge app declares what it needs in <code>cloudflare.manifest.json</code>, in the repo,
          in a file you can read and edit. It lists each binding, the name of the resource behind
          it, and the runtime settings for the Worker.
        </p>
        <p>
          Nothing in it exists until a deploy runs and you approve the plan. The plan shows every
          entry labelled <strong>create</strong> or <strong>reuse</strong>, and until you approve it,
          nothing is created and nothing bills.
        </p>
        <p>
          Bindings available: D1 for SQL, KV for cached reads, R2 for files, Queues for deferred
          work, Vectorize for embeddings, Durable Objects for coordination, plus Analytics Engine,
          service bindings, Workers AI, and Browser Rendering.
        </p>
      </ProseSection>

      <ProseSection id="migrations" title="Migrations">
        <p>
          Schema changes are numbered SQL files under <code>migrations/</code>, applied in order on
          deploy.
        </p>
        <p>
          Two rules are enforced rather than suggested. A migration that has already been applied
          cannot be edited afterwards; the deploy is refused and you are asked to add a new one
          instead. And a migration containing a destructive statement, such as dropping a table or
          truncating one, is refused outright and needs a person to handle it deliberately.
        </p>
      </ProseSection>

      <ProseSection id="editing" title="Editing">
        <p>
          The conversation has two modes. <strong>Build</strong> writes files, and every build turn
          lists the files it touched and is saved as a restorable version.{' '}
          <strong>Discuss</strong> answers questions and never writes anything.
        </p>
        <p>
          The crosshair in the preview lets you click an element and either jump to its line in the
          code or attach it to your next request, so &ldquo;make this smaller&rdquo; has something
          specific to refer to.
        </p>
        <p>
          You can edit any file by hand. Manual edits and generated edits share the same history and
          the same undo.
        </p>
      </ProseSection>

      <ProseSection id="deploy" title="Deploying">
        <p>
          <strong>Cloudflare</strong> is the default and the only surface that hosts both targets. A
          static site becomes a Pages project. An edge app becomes a Pages project with a Worker in
          front of it and the approved bindings attached. It goes into your own Cloudflare account.
        </p>
        <p>
          <strong>Factory preview</strong> serves a static project from this app at a{' '}
          <code>/results/</code> URL. No account needed, and no backend.
        </p>
        <p>
          <strong>GitHub mirror</strong> pushes the same bundle to a repository you own. It hosts
          nothing on its own; it is there so the code has somewhere to live.
        </p>
        <p>
          <strong>Netlify</strong> mirrors to GitHub and then hosts the assets. Static output only,
          since there is no Worker runtime on the other end.
        </p>
      </ProseSection>

      <ProseSection id="preview" title="Previews">
        <p>
          The editor preview renders the files in memory as you type. It is enough for anything
          static, and it is what the crosshair works against.
        </p>
        <p>
          An edge app can also run for real: <strong>Run the backend</strong> deploys a throwaway
          Cloudflare preview on its own subdomain with its own preview-suffixed resources, so
          nothing it does can reach your production data. It expires on its own and can be taken
          down from the same button.
        </p>
      </ProseSection>

      <ProseSection id="export" title="Export and portability">
        <p>
          Export produces a zip of every file plus a generated README. The same bundle can be pushed
          to a GitHub repository you own.
        </p>
        <p>
          The output is ordinary web files and standard Wrangler configuration. Nothing about it
          depends on this product, which is the point: you should be able to walk away with it and
          keep deploying with the normal Cloudflare tooling.
        </p>
      </ProseSection>

      <ProseSection id="models" title="Models and keys">
        <p>
          The model list is fetched live from the providers on each visit, so what you see in the
          picker is what is actually available. Leaving it on the default routes across whichever
          providers are up.
        </p>
        <p>
          You can bring your own key in Settings. It is stored against your account and used in
          place of the shared one.
        </p>
      </ProseSection>

      <ProseSection id="shortcuts" title="Shortcuts">
        <div className="not-prose my-5">
          <SpecTable
            dense
            caption="Keyboard shortcuts in the editor"
            rows={[
              { key: 'p', label: 'Ctrl P', value: 'Jump to a file', mono: false },
              { key: 's', label: 'Ctrl S', value: 'Save everything now' },
              { key: 'b', label: 'Ctrl B', value: 'Show or hide the file tree' },
              { key: 'i', label: 'Ctrl I', value: 'Show or hide the conversation' },
              { key: 'enter', label: 'Ctrl Enter', value: 'Send the request in the composer' },
            ]}
          />
        </div>
      </ProseSection>
    </ProsePage>
  )
}
