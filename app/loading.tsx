import { Spinner } from '@/components/ui/spinner';

export default function Loading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner className="w-8 h-8" />
        <p
          className="text-xs font-mono uppercase tracking-widest"
          style={{ color: 'var(--muted-text)' }}
        >
          Loading…
        </p>
      </div>
    </div>
  );
}
