import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import Shell from "@/components/Shell";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return <Shell user={{ email: u.email, role: u.role, fullName: u.fullName, permissions: u.permissions }}>{children}</Shell>;
}
