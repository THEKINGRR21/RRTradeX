import { api } from "@/lib/api";
import { destroySession, getCurrentUser } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const POST = api({ auth: "public" }, async ({ ip, requestId }) => {
  const u = await getCurrentUser();
  await destroySession();
  if (u) await audit({ actor: u.userId, action: "auth.logout", targetType: "user", targetId: u.userId, ip, requestId });
  return { ok: true };
});
