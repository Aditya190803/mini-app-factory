import { stackServerApp } from "@/stack/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let provider: "github" | "vercel" | "netlify" | "all" = "all";
  try {
    const body = (await req.json()) as { provider?: string };
    if (body?.provider) {
      if (!["github", "vercel", "netlify", "all"].includes(body.provider)) {
        return Response.json({ error: "Invalid provider" }, { status: 400 });
      }
      provider = body.provider as typeof provider;
    }
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  await convex.mutation(api.integrations.clearIntegration, {
    userId: user.id,
    provider,
  });

  return Response.json({ success: true });
}
