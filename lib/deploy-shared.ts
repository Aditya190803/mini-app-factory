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

export function extractRepoFullNameFromUrl(url?: string | null) {
  if (!url) return undefined;
  const match = url.match(/github\.com\/([^/]+\/[^/]+)(?:\.git)?$/i);
  if (!match) return undefined;
  return match[1].replace(/\.git$/i, "");
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
