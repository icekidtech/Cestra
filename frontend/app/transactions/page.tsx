"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/auth";
import { getTransactions, type Transaction } from "../lib/api";
import { formatUsd, formatTxDate } from "../lib/format";
import { MobileFrame } from "../components/mobile-frame";
import { ScreenHeader } from "../components/screen-header";

export default function TransactionsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push("/get-started");
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;
    getTransactions(1, 50)
      .then((res) => setTxs(res.data))
      .catch(() => setTxs([]))
      .finally(() => setLoading(false));
  }, [isAuthenticated]);

  return (
    <MobileFrame>
      <div className="flex h-full flex-col bg-white">
        <ScreenHeader title="Transaction History" onBack={() => router.push("/home")} />
        <div className="flex-1 overflow-y-auto px-4 pt-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="size-6 animate-spin rounded-full border-2 border-[#007a6e] border-t-transparent" />
            </div>
          ) : txs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <span className="text-3xl">📭</span>
              <p className="text-sm font-medium text-[#0d1b2a]">No transactions yet</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              {txs.map((tx) => {
                const { time, date } = formatTxDate(tx.created_at);
                const outgoing = tx.type === "sent";
                return (
                  <li key={tx.id} className="flex items-center gap-3 rounded-2xl bg-[#f7f2fa] p-3">
                    <span
                      className={`flex size-9 items-center justify-center rounded-full ${
                        outgoing ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-600"
                      }`}
                    >
                      {outgoing ? "↗" : "↓"}
                    </span>
                    <div className="flex flex-1 flex-col">
                      <span className="text-sm font-medium capitalize text-[#0d1b2a]">{tx.type}</span>
                      <span className="text-[11px] text-[#667085]">
                        {time} · {date}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={`text-sm font-semibold ${outgoing ? "text-[#0d1b2a]" : "text-emerald-600"}`}>
                        {outgoing ? "-" : "+"}
                        {formatUsd(tx.amount)}
                      </span>
                      <span className="text-[10px] capitalize text-[#667085]">{tx.status.toLowerCase()}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </MobileFrame>
  );
}
