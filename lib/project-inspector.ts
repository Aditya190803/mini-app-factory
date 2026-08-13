import type { ProjectFile } from '@/lib/page-builder';
import { parseCloudflareManifest } from '@/lib/cloudflare-manifest';

export type ProjectRoute = { method: string; path: string; source: string };

export function inspectProject(files: ProjectFile[], projectName: string) {
  const routes: ProjectRoute[] = [];
  const routePattern = /(?:request\.method\s*===?\s*['"](GET|POST|PUT|PATCH|DELETE|OPTIONS)['"][\s\S]{0,240}?(?:url\.pathname|pathname)\s*===?\s*['"]([^'"]+)['"]|(?:url\.pathname|pathname)\s*===?\s*['"]([^'"]+)['"][\s\S]{0,240}?request\.method\s*===?\s*['"](GET|POST|PUT|PATCH|DELETE|OPTIONS)['"])/g;
  for (const file of files.filter((candidate) => candidate.fileType === 'worker')) {
    for (const match of file.content.matchAll(routePattern)) {
      routes.push({ method: match[1] || match[4], path: match[2] || match[3], source: file.path });
    }
  }
  let manifest: ReturnType<typeof parseCloudflareManifest> = null;
  try { manifest = parseCloudflareManifest(files, projectName); } catch { manifest = null; }
  const resources = manifest ? Object.entries(manifest.bindings).flatMap(([kind, entries]) => entries.map((entry) => ({ kind, binding: entry.binding, name: 'name' in entry ? entry.name : 'dataset' in entry ? entry.dataset : entry.binding }))) : [];
  const schedules = manifest?.workers.flatMap((worker) => worker.crons.map((cron) => ({ worker: worker.name, cron }))) || [];
  const queues = manifest?.workers.flatMap((worker) => worker.queueConsumers.map((consumer) => ({ worker: worker.name, queue: consumer.queue }))) || [];
  const envExample = files.find((file) => file.path === '.dev.vars.example')?.content || '';
  const environmentNames = [...envExample.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]);
  return { routes, resources, schedules, queues, environmentNames };
}
