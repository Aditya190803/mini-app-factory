export type RepoNameValidation = {
  normalized: string;
  valid: boolean;
  message?: string;
};

export function normalizeRepoName(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

export function slugifyRepoName(input: string) {
  return normalizeRepoName(input) || "mini-app-factory-site";
}

export function validateRepoName(input: string): RepoNameValidation {
  const trimmed = input.trim();
  const normalized = normalizeRepoName(trimmed);
  if (!trimmed) {
    return { normalized, valid: true };
  }
  if (trimmed.length > 100) {
    return { normalized, valid: false, message: "Repo name must be 100 characters or fewer." };
  }
  if (/[^a-zA-Z0-9-_]/.test(trimmed)) {
    return { normalized, valid: false, message: "Repo name can only include letters, numbers, hyphens, and underscores." };
  }
  return { normalized, valid: true };
}

export function normalizeNetlifySiteName(input: string) {
  return normalizeRepoName(input);
}

/** Cloudflare Pages caps project names at 58 characters, so project names use the same cap. */
export const MAX_PROJECT_NAME_LENGTH = 58;

/** A DNS label: lowercase letters, digits and single hyphens, not starting or ending with one. */
export const PROJECT_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,57}$/;

export function validateProjectName(name: string): string | null {
  if (!name) return "Enter a project name.";
  if (name.length > MAX_PROJECT_NAME_LENGTH) return `Project names can be at most ${MAX_PROJECT_NAME_LENGTH} characters.`;
  if (!PROJECT_NAME_PATTERN.test(name)) {
    return "Use lowercase letters, numbers, and single hyphens, starting and ending with a letter or number.";
  }
  return null;
}

/** FNV-1a, for a short stable suffix. */
function shortHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 6);
}

/**
 * A valid Pages project name for `input`. Names that are too long get a hash suffix rather than a
 * plain cut: cutting made two long names that shared a prefix collide, and could leave a
 * trailing hyphen Cloudflare rejects.
 */
export function normalizeCloudflareProjectName(input: string) {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (cleaned.length <= MAX_PROJECT_NAME_LENGTH) return cleaned;
  const head = cleaned.slice(0, MAX_PROJECT_NAME_LENGTH - 7).replace(/-+$/, "");
  return `${head}-${shortHash(cleaned)}`;
}

export function extractRepoFullNameFromUrl(url?: string | null) {
  if (!url) return undefined;
  const match = url.match(/github\.com\/([^/]+\/[^/]+)(?:\.git)?$/i);
  if (!match) return undefined;
  return match[1]!.replace(/\.git$/i, "");
}

export function extractRepoNameFromFullName(fullName?: string | null) {
  if (!fullName) return undefined;
  const parts = fullName.split("/");
  return parts[1];
}

export function extractNetlifySiteNameFromUrl(url?: string | null) {
  if (!url) return undefined;
  const match = url.match(/https?:\/\/([a-z0-9-]+)\.netlify\.app/i);
  return match?.[1];
}

export function getRepoLookupTargets(params: {
  preferredFullName?: string | null;
  ownerLogin: string;
  repoName: string;
}) {
  const targets = new Set<string>();
  if (params.preferredFullName) {
    targets.add(params.preferredFullName);
  }
  targets.add(`${params.ownerLogin}/${params.repoName}`);
  return Array.from(targets);
}
