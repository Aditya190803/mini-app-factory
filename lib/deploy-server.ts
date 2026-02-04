export function normalizePath(input: string) {
  return input.replace(/^\/+/, "");
}

export function toBase64(input: string) {
  return Buffer.from(input, "utf8").toString("base64");
}

export function buildGitHubContentPayload(params: {
  path: string;
  content: string;
  branch: string;
  existingSha?: string;
}) {
  return {
    message: `${params.existingSha ? "Update" : "Add"} ${params.path}`,
    content: toBase64(params.content),
    branch: params.branch,
    ...(params.existingSha ? { sha: params.existingSha } : {}),
  };
}
