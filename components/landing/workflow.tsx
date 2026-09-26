import { PlateFrame } from '@/components/kit'

const STEPS = [
  {
    verb: 'Describe',
    detail: 'A sentence is enough to start. The model reads it and writes the project.',
  },
  {
    verb: 'Read',
    detail: 'HTML, CSS, scripts, and for edge apps a Worker and SQL you can open.',
  },
  {
    verb: 'Approve',
    detail: 'Every Cloudflare resource is listed first. Nothing is created until you say so.',
  },
  {
    verb: 'Publish',
    detail: 'Into your own account. Deleting this one does not take the app down.',
  },
] as const

/**
 * The path from a sentence to a live app, as four verbs.
 *
 * Not a numbered stepper and not a row of identical cards. The first cell
 * carries the accent wash; the rest are paper. The verbs are the labels.
 */
export function Workflow({ className }: { className?: string }) {
  return (
    <PlateFrame className={className}>
      <div className="grid gap-px overflow-hidden rounded-xl border border-[var(--rule-strong)] bg-[var(--rule)] sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((step, index) => (
          <div
            key={step.verb}
            className={
              index === 0
                ? 'bg-[var(--signal-wash)] p-5 sm:p-6'
                : 'bg-[var(--surface-1)] p-5 sm:p-6'
            }
          >
            <p className="font-mono text-2xl tracking-[-0.05em]">{step.verb}</p>
            <p className="mt-2.5 max-w-[36ch] text-sm leading-relaxed text-[var(--muted-foreground)]">
              {step.detail}
            </p>
          </div>
        ))}
      </div>
    </PlateFrame>
  )
}
