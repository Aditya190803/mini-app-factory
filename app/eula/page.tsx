import type { Metadata } from 'next'
import { ProsePage, ProseSection } from '@/components/shell/prose-page'

export const metadata: Metadata = {
  title: 'Terms',
  description: 'The terms that apply to using Mini App Factory.',
}

const TOC = [
  { id: 'license', label: 'What you may do' },
  { id: 'ownership', label: 'Who owns the output' },
  { id: 'responsibilities', label: 'Your responsibilities' },
  { id: 'costs', label: 'Cloud costs' },
  { id: 'third-party', label: 'Third-party services' },
  { id: 'availability', label: 'Availability' },
  { id: 'contact', label: 'Contact' },
] as const

export default function EulaPage() {
  return (
    <ProsePage
      title="Terms of use"
      subtitle="Using Mini App Factory means accepting the terms below."
      updated="4 February 2026"
      toc={TOC}
    >
      <ProseSection id="license" title="What you may do">
        <p>
          You get a limited, non-exclusive, revocable licence to use the product to create and
          manage projects.
        </p>
        <p>
          You may export what you generate and deploy it to your own infrastructure or to any
          provider you control, without further permission.
        </p>
      </ProseSection>

      <ProseSection id="ownership" title="Who owns the output">
        <p>
          The projects you generate are yours. The generated files are ordinary web files and
          standard Cloudflare configuration, deliberately, so that nothing you build here depends on
          this product continuing to exist.
        </p>
      </ProseSection>

      <ProseSection id="responsibilities" title="Your responsibilities">
        <p>You are responsible for what you generate, publish, and deploy.</p>
        <p>
          You must hold the rights to any asset, code, or data you upload or reference, including
          anything at a reference URL you point the generator at.
        </p>
        <p>
          Generated code is not reviewed by a person before it reaches you. Read it before you put
          it in front of anyone, particularly where it handles other people&apos;s data.
        </p>
      </ProseSection>

      <ProseSection id="costs" title="Cloud costs">
        <p>
          Deployments run in <strong>your</strong> cloud accounts, so any usage they incur is billed
          to you by those providers, not by this product.
        </p>
        <p>
          Every resource that can persist or bill is listed and confirmed by you before it is
          created. Watching what those resources then cost is on you, and your provider&apos;s
          dashboard is the authority on it.
        </p>
      </ProseSection>

      <ProseSection id="third-party" title="Third-party services">
        <p>
          Cloudflare, GitHub, Netlify, Vercel, the authentication provider, and the model providers
          each have their own terms, and your use of them is governed by those terms as well as
          these.
        </p>
      </ProseSection>

      <ProseSection id="availability" title="Availability">
        <p>
          The product is provided as is. It may change, break, or be discontinued. Keep an exported
          copy of anything you cannot afford to lose.
        </p>
        <p>These terms may be updated. Continuing to use the product accepts the update.</p>
      </ProseSection>

      <ProseSection id="contact" title="Contact">
        <p>
          Questions about these terms go through the <a href="/support">support page</a>.
        </p>
      </ProseSection>
    </ProsePage>
  )
}
