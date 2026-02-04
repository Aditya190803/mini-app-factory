import { stackServerApp } from "@/stack/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as { provider?: "github" | "vercel" | "netlify" | "all" };
  const provider = body?.provider ?? "all";

  await convex.mutation(api.integrations.clearIntegration, {
    userId: user.id,
    provider,
  });

  return Response.json({ success: true });
}
