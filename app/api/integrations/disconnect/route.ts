import { stackServerApp } from "@/stack/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { z } from "zod";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
const disconnectSchema = z
  .object({
    provider: z.enum(["github", "vercel", "netlify", "all"]).optional(),
  })
  .strict();

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let provider: "github" | "vercel" | "netlify" | "all" = "all";
  try {
    const parsed = disconnectSchema.safeParse(await req.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid provider" }, { status: 400 });
    }
    if (parsed.data.provider) {
      provider = parsed.data.provider;
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
