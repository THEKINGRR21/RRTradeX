"use client";
import Link from "next/link";
import { useState } from "react";
import { useApi } from "@/lib/client";
import { Card, Empty, ErrorBox, PageHeader, Pct, QuoteMeta, Spinner, fmtINR, fmtNum } from "@/components/ui";

export default function Markets() {
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const qs = new URLSearchParams({ ...(q ? { q } : {}), ...(sector ? { sector } : {}) }).toString();
  const { data, error, loading } = useApi<any>(`/instruments${qs ? "?" + qs : ""}`, { refreshMs: 15_000 });
  const first = data?.instruments?.[0]?.quote;
  return (
    <>
      <PageHeader title="Markets" sub={<>NSE instrument catalogue · prices refresh every 15s · {first && <QuoteMeta q={first} />}</>} />
      <div className="mb-4 flex flex-wrap gap-3">
        <input className="input max-w-xs" placeholder="Search symbol or company…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search instruments" />
        <select className="input max-w-[220px]" value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Filter by sector">
          <option value="">All sectors</option>{data?.sectors?.map((s: string) => <option key={s}>{s}</option>)}
        </select>
      </div>
      <ErrorBox msg={error} />
      <Card pad={false}>
        {loading && !data ? <Spinner /> : data?.instruments.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Symbol</th><th className="hidden md:table-cell">Company</th><th className="hidden lg:table-cell">Sector</th><th className="text-right">LTP</th><th className="text-right">24h</th><th className="hidden text-right sm:table-cell">Volume</th><th className="hidden xl:table-cell">Data</th></tr></thead>
              <tbody>{data.instruments.map((i: any) => (
                <tr key={i.id} className="hover:bg-ink-850">
                  <td><Link href={`/markets/${i.symbol}`} className="font-semibold hover:text-brand">{i.symbol}</Link><div className="text-[11px] text-mist-500">{i.exchange}</div></td>
                  <td className="hidden text-mist-300 md:table-cell">{i.companyName}</td>
                  <td className="hidden text-xs text-mist-400 lg:table-cell">{i.sector}</td>
                  <td className="num text-right font-semibold">{fmtINR(i.quote?.lastPrice)}</td>
                  <td className="text-right"><Pct v={i.quote?.changePct} /></td>
                  <td className="num hidden text-right text-mist-400 sm:table-cell">{fmtNum(i.quote?.volume)}</td>
                  <td className="hidden xl:table-cell"><QuoteMeta q={i.quote} /></td>
                </tr>))}
              </tbody>
            </table>
          </div>
        ) : <Empty>No instruments match your search.</Empty>}
      </Card>
    </>
  );
}
