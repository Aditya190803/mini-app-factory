import type { Metadata } from 'next'
import { ProsePage, ProseSection } from '@/components/shell/prose-page'

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What Mini App Factory stores, why, and how to get rid of it.',
}

const TOC = [
  { id: 'collect', label: 'What is stored' },
  { id: 'use', label: 'What it is used for' },
  { id: 'sharing', label: 'Who else sees it' },
  { id: 'cloudflare', label: 'Your Cloudflare account' },
  { id: 'retention', label: 'How long it is kept' },
  { id: 'choices', label: 'Removing it' },
  { id: 'contact', label: 'Contact' },
] as const

export default function PrivacyPage() {
  return (
    <ProsePage
      title="Privacy"
      subtitle="What this product stores about you and your projects, why it stores it, and how to remove it."
      updated="4 February 2026"
      toc={TOC}
    >
      <ProseSection id="collect" title="What is stored">
        <p>
          <strong>Account identity.</strong> Authentication runs through Stack. Your email and
          profile metadata are held by that provider; this product stores the identifier it returns
          so projects can be tied to you.
        </p>
        <p>
          <strong>Project data.</strong> Your prompts, the generated files, the conversation
          history, saved versions, metadata and SEO settings, and deployment records are stored in
          Convex so you can edit, restore, export, and redeploy.
        </p>
        <p>
          <strong>Integration tokens.</strong> Connecting Cloudflare, GitHub, Netlify, or Vercel
          stores an OAuth token so deployments can run on your behalf. Tokens are encrypted at rest
          and can be removed from Settings.
        </p>
        <p>
          <strong>Operational signals.</strong> Request errors and basic stability telemetry, used
          for diagnosis.
        </p>
      </ProseSection>

      <ProseSection id="use" title="What it is used for">
        <p>
          Running the product: generating projects, saving them, previewing them, and deploying
          them where you tell it to.
        </p>
        <p>
          Keeping accounts separated and preventing abuse, including verifying that a request for a
          project actually comes from someone with access to it.
        </p>
        <p>Finding and fixing failures.</p>
      </ProseSection>

      <ProseSection id="sharing" title="Who else sees it">
        <p>
          Infrastructure providers process data in order to run the service: hosting,
          authentication, the database, and the model providers that generate your project.
        </p>
        <p>
          Your prompt and relevant project files are sent to the model provider you have selected in
          order to produce a result. Which providers are available, and which one is in use, is
          shown in the model picker.
        </p>
        <p>
          When you deploy, the destination provider receives the files being published and whatever
          configuration that deployment requires.
        </p>
      </ProseSection>

      <ProseSection id="cloudflare" title="Your Cloudflare account">
        <p>
          Cloudflare deployments go into <strong>your</strong> account, not into one owned by this
          product. The authorization you grant is used to create the Pages project, upload the
          asset bundle, and, for an edge app, create the Worker and the bindings listed in the
          project&apos;s manifest.
        </p>
        <p>
          No resource that persists or bills is created without you approving the exact list first.
          Revoking the authorization from Settings, or from Cloudflare directly, stops all of it.
          Resources already created stay in your account and remain yours to keep or delete.
        </p>
      </ProseSection>

      <ProseSection id="retention" title="How long it is kept">
        <p>
          Project data is kept while your account is active, because that is what makes editing and
          redeploying possible. Deleting a project from the dashboard removes its stored files and
          history.
        </p>
        <p>
          Deleting a project here does not take down anything already deployed. That lives in your
          own hosting account and has to be removed there.
        </p>
      </ProseSection>

      <ProseSection id="choices" title="Removing it">
        <p>Disconnect any integration at any time from Settings, which deletes the stored token.</p>
        <p>Delete a project from the dashboard to remove its files, versions, and conversation.</p>
        <p>Export a project to a zip or a GitHub repo first if you want to keep a copy.</p>
      </ProseSection>

      <ProseSection id="contact" title="Contact">
        <p>
          For a privacy question or a data request, use the <a href="/support">support page</a>.
        </p>
      </ProseSection>
    </ProsePage>
  )
}
