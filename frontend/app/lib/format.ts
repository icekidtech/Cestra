/** Shared formatting helpers for the Cestra UI. */

/** Format a number as a USD currency string, e.g. 84000.56 → "$84,000.56". */
export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Split a USD amount into the integer part (with thousands separators) and the
 *  two-digit fractional part — used by the dashboard balance display. */
export function splitUsd(amount: number): { whole: string; fraction: string } {
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, fraction] = fixed.split(".");
  const grouped = Number(whole).toLocaleString("en-US");
  return { whole: grouped, fraction };
}

/** Shorten a Sui address: 0x1234…abcd. */
export function shortenAddress(address: string | null | undefined): string {
  if (!address) return "—";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Relative-ish time label for a transaction timestamp. */
export function formatTxDate(iso: string): { time: string; date: string } {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
  return { time, date };
}
