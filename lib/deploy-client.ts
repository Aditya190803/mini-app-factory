import { readStream, StreamEvent } from "./stream-utils";

export function normalizeDeployError(message: string) {
  if (/GitHub API error: 422/i.test(message)) {
    const details = message.replace(/GitHub API error: 422\s*/i, "").trim();
    if (details) {
      return `GitHub rejected the repo creation: ${details}`;
    }
    return "GitHub rejected the repo creation. A repo with this name may already exist.";
  }
  if (/GitHub API error: 403/i.test(message)) {
    return "GitHub permission denied. Ensure the OAuth app has repo access and org permissions.";
  }
  if (/GitHub connection required/i.test(message)) {
    return "Please connect GitHub before deploying.";
  }
  if (/Netlify connection required/i.test(message)) {
    return "Please connect Netlify before deploying.";
  }
  if (/Netlify API error: 422/i.test(message)) {
    return "Netlify rejected the site creation. Try a different site name.";
  }
  if (/Publish failed/i.test(message)) {
    return "Deploy with us failed. Please try again.";
  }
  return message;
}

export type DeployApiPayload = {
  projectName: string;
  prompt?: string;
  files?: Array<{ path: string; content: string }>;
  repoVisibility?: "private" | "public";
  githubOrg?: string | null;
  deployMode?: "github-netlify" | "github-only";
  repoName?: string;
  repoFullName?: string;
  netlifySiteName?: string;
};

export type DeployApiResult = {
  repo: string;
  repoUrl?: string;
  deploymentUrl?: string;
  netlifySiteName?: string;
};

type DeployStreamEvent = StreamEvent & {
  status: "progress" | "success" | "error";
  data?: DeployApiResult;
  message?: string;
};

export async function performDeploy(payload: DeployApiPayload, onStatus?: (status: string) => void): Promise<DeployApiResult> {
  const resp = await fetch("/api/deploy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    try {
      const errJson = JSON.parse(errText);
      throw new Error(errJson.error || "Deploy failed");
    } catch {
      throw new Error(errText || "Deploy failed");
    }
  }

  let result: DeployApiResult | null = null;
  
  await readStream(
    resp,
    () => {},
    (event: DeployStreamEvent) => {
      if (event.status === "progress" && event.message) {
        onStatus?.(event.message);
      } else if (event.status === "success" && event.data) {
        result = event.data;
      } else if (event.status === "error") {
        throw new Error(event.message || "Deploy failed");
      }
    }
  );

  if (!result) {
    throw new Error("Deployment failed to complete");
  }

  return result;
}
