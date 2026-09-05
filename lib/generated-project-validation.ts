import type { ProjectFile } from '@/lib/page-builder';
import { validateFileStructure } from '@/lib/page-builder';
import { parseCloudflareManifest } from '@/lib/cloudflare-manifest';

export type GeneratedProjectValidation = { valid: boolean; errors: string[]; warnings: string[] };

const secretPattern = /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"'\n]{12,}["']/i;
const destructiveSql = /\b(?:DROP\s+(?:TABLE|INDEX)|TRUNCATE|DELETE\s+FROM\s+\w+\s*;|ALTER\s+TABLE\s+\w+\s+DROP)\b/i;

export function validateGeneratedProject(files: ProjectFile[], projectName: string): GeneratedProjectValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const structure = validateFileStructure(files);
  errors.push(...structure.errors);

  const paths = new Set(files.map((file) => file.path));
  const wrangler = files.find((file) => file.path === 'wrangler.jsonc' || file.path === 'wrangler.json');
  const worker = files.find((file) => file.path === '_worker.js');
  if (wrangler) {
    try {
      parseCloudflareManifest(files, projectName);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Invalid Wrangler configuration');
    }
    if (!paths.has('package.json')) errors.push('Wrangler projects must include package.json');
    if (!paths.has('README.md')) warnings.push('Wrangler project should include README.md');
    if (!worker) errors.push('Wrangler project main Worker is missing');
  }

  if (worker) {
    if (!worker.content.includes('env.ASSETS.fetch(request)')) errors.push('_worker.js must fall through to env.ASSETS.fetch(request)');
    if (!worker.content.includes('/api/health')) errors.push('_worker.js must expose GET /api/health');
  }

  const packageFile = files.find((file) => file.path === 'package.json');
  if (packageFile) {
    try {
      const packageJson = JSON.parse(packageFile.content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const versions = [...Object.values(packageJson.dependencies || {}), ...Object.values(packageJson.devDependencies || {})];
      if (versions.some((version) => version === 'latest' || version === '*')) errors.push('Generated dependencies must use pinned versions');
    } catch {
      errors.push('package.json is not valid JSON');
    }
  }

  for (const file of files) {
    if (secretPattern.test(file.content) && file.path !== '.dev.vars.example') errors.push(`Possible embedded secret in ${file.path}`);
    if (file.fileType === 'migration' && destructiveSql.test(file.content)) errors.push(`Destructive SQL is not allowed in ${file.path}`);
  }

  if (worker) {
    const frontendRoutes = new Set<string>();
    for (const file of files.filter((candidate) => candidate.fileType === 'script' || candidate.fileType === 'page')) {
      for (const match of file.content.matchAll(/fetch\(\s*["'`]([^"'`?]+)["'`]/g)) {
        if (match[1].startsWith('/api/')) frontendRoutes.add(match[1]);
      }
    }
    for (const route of frontendRoutes) {
      if (!worker.content.includes(route)) errors.push(`Frontend calls missing Worker route: ${route}`);
    }
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export function findMigrationDrift(previous: ProjectFile[], next: ProjectFile[]) {
  const errors: string[] = [];
  const previousMigrations = previous.filter((file) => file.fileType === 'migration');
  for (const migration of previousMigrations) {
    const updated = next.find((file) => file.path === migration.path);
    if (!updated) errors.push(`Previously saved migration cannot be deleted: ${migration.path}`);
    else if (updated.content !== migration.content) errors.push(`Previously saved migration cannot be modified: ${migration.path}`);
  }
  return errors;
}
