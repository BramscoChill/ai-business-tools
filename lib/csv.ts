import type { Invoice } from "./schema";

function esc(v: string | number | null): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize the (possibly edited) invoice: one CSV row per line item,
 *  with invoice-level fields repeated so the file is self-contained. */
export function invoiceToCsv(inv: Invoice): string {
  const header = [
    "vendor",
    "invoice_number",
    "date",
    "currency",
    "line_description",
    "quantity",
    "unit_price",
    "amount",
    "subtotal",
    "tax",
    "total",
  ];
  const rows = inv.line_items.map((li) =>
    [
      inv.vendor,
      inv.invoice_number,
      inv.date,
      inv.currency,
      li.description,
      li.quantity,
      li.unit_price,
      li.amount,
      inv.subtotal,
      inv.tax,
      inv.total,
    ]
      .map(esc)
      .join(","),
  );
  return [header.join(","), ...rows].join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
