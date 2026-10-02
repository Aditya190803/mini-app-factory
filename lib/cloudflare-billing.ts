/**
 * Plain-language billing notes per Cloudflare resource kind, for the resource plan and the
 * settings list. Deliberately qualitative: Cloudflare's exact quotas change, and a wrong number
 * here would be worse than none. Each note says whether the free plan covers the resource.
 */
export type BillingNote = { tone: 'free' | 'may-bill' | 'paid'; label: string; detail: string };

const NOTES: Record<string, BillingNote> = {
  d1: { tone: 'may-bill', label: 'free tier', detail: 'D1 has a free daily allowance; storage and reads beyond it bill on paid plans.' },
  kv: { tone: 'may-bill', label: 'free tier', detail: 'KV has a free daily allowance; reads and writes beyond it bill on paid plans.' },
  r2: { tone: 'may-bill', label: 'may bill', detail: 'R2 bills stored data and operations beyond its free allowance. Egress is free.' },
  queue: { tone: 'paid', label: 'paid plan', detail: 'Queues need the Workers Paid plan.' },
  vectorize: { tone: 'may-bill', label: 'may bill', detail: 'Vectorize bills stored and queried dimensions beyond its free allowance.' },
  worker: { tone: 'free', label: 'free tier', detail: 'Workers include a free daily request allowance.' },
  durableObject: { tone: 'may-bill', label: 'may bill', detail: 'Durable Objects bill requests and duration beyond the free allowance.' },
  external: { tone: 'free', label: 'existing', detail: 'Binds something that already exists; nothing new is created.' },
};

export function billingNote(kind: string): BillingNote {
  return NOTES[kind] ?? { tone: 'may-bill', label: 'may bill', detail: 'Check Cloudflare pricing for this resource.' };
}
