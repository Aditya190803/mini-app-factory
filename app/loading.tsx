/**
 * Rendered while Stack fetches the user, via React Suspense.
 *
 * A ruled top bar and a few row placeholders rather than a centred spinner, so
 * the shell lands in the same place the real page will occupy and nothing
 * jumps when it arrives.
 */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="min-h-dvh bg-[var(--background)]">
      <div className="h-[var(--bar-h)] border-b border-[var(--rule)]" />
      <div className="mx-auto w-full max-w-[84rem] px-4 py-8 sm:px-6">
        <div className="shimmer h-7 w-40 rounded-md" />
        <div className="shimmer mt-2 h-4 w-64 rounded-md" />
        <div className="mt-8 space-y-px overflow-hidden rounded-lg border border-[var(--rule)]">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 bg-[var(--surface-1)] px-4 py-3">
              <div className="shimmer size-2 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <div className="shimmer h-3.5 w-1/3 rounded" />
                <div className="shimmer h-3 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading</span>
    </div>
  )
}
