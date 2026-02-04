import { stackServerApp } from "@/stack/server";
import { getIntegrationStatus } from "@/lib/integrations";

export async function GET() {
  const user = await stackServerApp.getUser();
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = await getIntegrationStatus(user.id);
  return Response.json(status);
}
