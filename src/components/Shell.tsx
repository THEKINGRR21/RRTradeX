"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useState, type ReactNode } from "react";
import { apiFetch, useApi } from "@/lib/client";
import { fmtTime } from "./ui";

type U = { email: string; role: "retail" | "trader" | "admin"; fullName: string; permissions: string[] };

const TRADE_NAV = [
  ["/dashboard", "Dashboard", "◧"], ["/markets", "Markets", "▤"], ["/portfolio", "Portfolio", "◐"], ["/orders", "Orders", "⇄"],
  ["/wallet", "Wallet", "▣"], ["/watchlists", "Watchlists", "☆"], ["/alerts", "Alerts", "◉"],
] as const;
const COMMON_NAV = [["/learn", "Learning Centre", "✎"], ["/assistant", "AI Assistant", "✦"], ["/profile", "Profile", "☺"]] as const;

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-black text-ink-950">RR</span>
      <span className="text-lg">RRTrade<span className="text-brand">X</span></span>
    </Link>
  );
}

export function PaperBanner() {
  return (
    <div className="flex items-center justify-center gap-2 bg-brand px-3 py-1 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-ink-950">
      <span>● Paper trading</span><span className="hidden sm:inline">· Virtual funds only · Simulated market data · No real orders are placed</span>
    </div>
  );
}

export default function Shell({ user, children }: { user: U; children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const { data: notif, reload } = useApi<{ notifications: any[] }>("/notifications", { refreshMs: 30_000 });
  const unread = notif?.notifications.filter((n) => !n.read_at).length ?? 0;
  const nav = [...(user.role === "admin" ? [["/admin", "Admin Console", "⚙"] as const] : TRADE_NAV), ...COMMON_NAV];

  async function logout() {
    await apiFetch("/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  async function openBell() {
    setBell((b) => !b);
    if (unread) { await apiFetch("/notifications", { method: "POST" }); setTimeout(reload, 1500); }
  }

  return (
    <div className="min-h-screen">
      <PaperBanner />
      <div className="flex">
        <aside className={clsx("fixed inset-y-0 left-0 z-40 mt-[26px] w-60 shrink-0 border-r border-ink-800 bg-ink-950 p-4 transition-transform lg:sticky lg:top-[26px] lg:mt-0 lg:h-[calc(100vh-26px)] lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
          <div className="mb-8 px-2"><Logo /></div>
          <nav className="space-y-0.5" aria-label="Main">
            {nav.map(([href, label, icon]) => {
              const active = path === href || (href !== "/dashboard" && path.startsWith(href + "/")) || path === href;
              return (
                <Link key={href} href={href} onClick={() => setOpen(false)}
                  className={clsx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition", active ? "bg-ink-800 font-semibold text-mist-100" : "text-mist-400 hover:bg-ink-900 hover:text-mist-100")}>
                  <span className={clsx("w-4 text-center", active && "text-brand")} aria-hidden>{icon}</span>{label}
                </Link>
              );
            })}
          </nav>
          <div className="absolute inset-x-4 bottom-4 rounded-lg border border-ink-800 bg-ink-900 p-3 text-xs">
            <div className="truncate font-semibold text-mist-100">{user.fullName || user.email}</div>
            <div className="mt-0.5 flex items-center justify-between text-mist-400">
              <span className="capitalize">{user.role === "retail" ? "Learner" : user.role}</span>
              <button onClick={logout} className="text-mist-300 hover:text-brand">Sign out</button>
            </div>
          </div>
        </aside>
        {open && <div className="fixed inset-0 z-30 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />}
        <div className="min-w-0 flex-1">
          <header className="sticky top-[26px] z-20 flex h-14 items-center justify-between border-b border-ink-800 bg-ink-950/90 px-4 backdrop-blur lg:px-8">
            <button className="btn-ghost px-2.5 py-1.5 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">☰</button>
            <div className="hidden text-xs text-mist-500 lg:block">Educational platform · not a broker · not investment advice</div>
            <div className="relative">
              <button onClick={openBell} className="btn-ghost relative px-2.5 py-1.5" aria-label={`Notifications (${unread} unread)`}>
                🔔{unread > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-loss px-1 text-[10px] font-bold text-white">{unread}</span>}
              </button>
              {bell && (
                <div className="card absolute right-0 top-11 z-50 max-h-96 w-80 overflow-y-auto shadow-2xl">
                  <div className="border-b border-ink-700 px-4 py-2.5 text-sm font-semibold">Notifications</div>
                  {notif?.notifications.length ? notif.notifications.map((n) => (
                    <div key={n.id} className={clsx("border-b border-ink-800 px-4 py-3 text-sm", !n.read_at && "bg-ink-850")}>
                      <div className="font-semibold text-mist-100">{n.title}</div>
                      <div className="mt-0.5 text-xs text-mist-300">{n.body}</div>
                      <div className="mt-1 text-[11px] text-mist-500">{fmtTime(n.created_at)}</div>
                    </div>
                  )) : <div className="px-4 py-6 text-center text-sm text-mist-400">No notifications yet</div>}
                </div>
              )}
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8" onClick={() => bell && setBell(false)}>{children}</main>
        </div>
      </div>
    </div>
  );
}
