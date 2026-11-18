"use client";
import Link from "next/link";
import { useApi } from "@/lib/client";
import { useMe } from "@/lib/session-client";
import { Card, Empty, ErrorBox, PageHeader, Pct, QuoteMeta, Signed, Spinner, Stat, fmtINR } from "@/components/ui";

export default function Dashboard() {
  const { data: me } = useMe();
  const { data: p, error } = useApi<any>("/portfolio", { refreshMs: 15_000 });
  const { data: mk } = useApi<any>("/instruments", { refreshMs: 15_000 });
  const { data: wl } = useApi<any>("/watchlists", { refreshMs: 15_000 });
  const { data: lr } = useApi<any>("/learning/content");
  const { data: od } = useApi<any>("/orders?limit=5", { refreshMs: 15_000 });
  if (error) return <ErrorBox msg={error} />;
  if (!p) return <Spinner />;
  const s = p.summary;
  const movers = [...(mk?.instruments ?? [])].sort((a, b) => Math.abs(Number(b.quote?.changePct)) - Math.abs(Number(a.quote?.changePct))).slice(0, 6);
  const lessons = lr?.contents ?? [];
  const done = lessons.filter((c: any) => c.completedAt).length;
  const next = lessons.find((c: any) => !c.completedAt);
  const isTrader = me?.user.role === "trader";
  return (
    <>
      <PageHeader title={`Welcome${me ? ", " + me.user.profile.fullName.split(" ")[0] : ""}`}
        sub={<>Your paper-trading overview · {isTrader ? "Trader account" : "Learner account"} · valued {new Date(p.valuation.asOf).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST</>}
        action={<Link href="/markets" className="btn-primary">Explore markets</Link>} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Portfolio value (virtual)" value={fmtINR(s.totalValue)} sub={<>Return <Signed v={s.totalReturn} /> (<Pct v={s.totalReturnPct} />)</>} />
        <Stat label="Virtual cash" value={fmtINR(s.cashBalance)} sub={`of ${fmtINR(s.startingBalance, true)} starting balance`} />
        <Stat label="Unrealised P&L" value={<Signed v={s.unrealizedPnl} />} sub={<>Holdings&apos; 24h price move <Signed v={s.dayChange} /></>} />
        <Stat label="Realised P&L" value={<Signed v={s.realizedPnl} />} sub="Booked on sells, after fees" />
      </div>
      {p.valuation.disclosures.length > 0 && <div className="mt-4 rounded-lg border border-orange-800 bg-orange-950/40 px-4 py-2 text-xs text-orange-300">⚠ {p.valuation.disclosures.join(" ")}</div>}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Holdings" action={<Link href="/portfolio" className="text-xs text-brand">View portfolio →</Link>} className="lg:col-span-2" pad={false}>
          {p.holdings.length ? (
            <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Symbol</th><th className="text-right">Qty</th><th className="text-right">LTP</th><th className="text-right">Value</th><th className="text-right">Unrealised</th></tr></thead>
              <tbody>{p.holdings.slice(0, 6).map((h: any) => (
                <tr key={h.symbol}><td><Link href={`/markets/${h.symbol}`} className="font-semibold hover:text-brand">{h.symbol}</Link></td>
                  <td className="num text-right">{Number(h.quantity)}</td><td className="num text-right">{fmtINR(h.lastPrice)}</td>
                  <td className="num text-right">{fmtINR(h.marketValue)}</td><td className="text-right"><Signed v={h.unrealizedPnl} /></td></tr>))}
              </tbody></table></div>
          ) : <Empty>No holdings yet. <Link href="/markets" className="text-brand">Place your first paper trade →</Link></Empty>}
        </Card>
        <Card title="Learning progress" action={<Link href="/learn" className="text-xs text-brand">Learning Centre →</Link>}>
          <div className="num text-3xl font-semibold">{done}<span className="text-lg text-mist-500">/{lessons.length}</span></div>
          <div className="mt-1 text-xs text-mist-400">lessons completed</div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-800"><div className="h-full bg-brand" style={{ width: `${lessons.length ? (done / lessons.length) * 100 : 0}%` }} /></div>
          {next && <Link href={`/learn/${next.id}`} className="mt-4 block rounded-lg border border-ink-700 p-3 hover:border-brand"><div className="label">Up next</div><div className="mt-1 text-sm font-semibold">{next.title}</div><div className="text-xs text-mist-400">{next.durationMin} min · {next.difficulty}</div></Link>}
        </Card>
        <Card title="Top movers (24h)" pad={false}>
          <ul>{movers.map((i: any) => (
            <li key={i.id} className="flex items-center justify-between border-b border-ink-800 px-5 py-2.5 last:border-0">
              <Link href={`/markets/${i.symbol}`} className="font-semibold hover:text-brand">{i.symbol}</Link>
              <span className="text-right"><span className="num mr-3 text-sm">{fmtINR(i.quote?.lastPrice)}</span><Pct v={i.quote?.changePct} className="text-sm" /></span>
            </li>))}</ul>
          {movers[0] && <div className="px-5 pb-3 pt-1"><QuoteMeta q={movers[0].quote} /></div>}
        </Card>
        <Card title={wl?.watchlists?.[0]?.name ?? "Watchlist"} action={<Link href="/watchlists" className="text-xs text-brand">Manage →</Link>} pad={false}>
          {wl?.watchlists?.[0]?.items.length ? (
            <ul>{wl.watchlists[0].items.slice(0, 6).map((i: any) => (
              <li key={i.instrumentId} className="flex items-center justify-between border-b border-ink-800 px-5 py-2.5 last:border-0">
                <Link href={`/markets/${i.symbol}`} className="font-semibold hover:text-brand">{i.symbol}</Link>
                <span><span className="num mr-3 text-sm">{fmtINR(i.quote?.lastPrice)}</span><Pct v={i.quote?.changePct} className="text-sm" /></span>
              </li>))}</ul>
          ) : <Empty>Add instruments with ☆ on any instrument page.</Empty>}
        </Card>
        <Card title="Recent orders" action={<Link href="/orders" className="text-xs text-brand">All orders →</Link>} pad={false}>
          {od?.orders?.length ? (
            <ul>{od.orders.map((o: any) => (
              <li key={o.id} className="flex items-center justify-between border-b border-ink-800 px-5 py-2.5 text-sm last:border-0">
                <span><span className={o.side === "buy" ? "text-gain" : "text-loss"}>{o.side.toUpperCase()}</span> {Number(o.quantity)} {o.symbol}</span>
                <span className="text-xs capitalize text-mist-400">{o.status.replace("_", " ")}</span>
              </li>))}</ul>
          ) : <Empty>No orders yet.</Empty>}
        </Card>
      </div>
    </>
  );
}
