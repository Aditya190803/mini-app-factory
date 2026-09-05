// Stack uses React Suspense, which renders this while user data is fetched.
// See: https://nextjs.org/docs/app/api-reference/file-conventions/loading
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading"
      className="flex min-h-dvh items-center justify-center bg-background"
    >
      <div className="size-5 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  )
}
