// Payment status and aging for invoices (receivables) and purchases (payables).
import { dayNumber, type ISODate } from "./dates";

export type PaymentStatus = "paid" | "partial" | "pending" | "overdue" | "void";

export function paymentStatus(doc: { status: string; total: number; amountPaid: number; dueDate: ISODate }, asOf: ISODate): PaymentStatus {
  if (doc.status === "void") return "void";
  const balance = doc.total - doc.amountPaid;
  if (balance <= 0.009) return "paid";
  if (dayNumber(doc.dueDate) < dayNumber(asOf)) return "overdue";
  return doc.amountPaid > 0 ? "partial" : "pending";
}

export interface AgingBuckets {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
}

export function agingBuckets(docs: { dueDate: ISODate; balance: number }[], asOf: ISODate): AgingBuckets {
  const buckets: AgingBuckets = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 };
  for (const d of docs) {
    if (d.balance <= 0.009) continue;
    const late = dayNumber(asOf) - dayNumber(d.dueDate);
    if (late <= 0) buckets.current += d.balance;
    else if (late <= 30) buckets.days1to30 += d.balance;
    else if (late <= 60) buckets.days31to60 += d.balance;
    else if (late <= 90) buckets.days61to90 += d.balance;
    else buckets.over90 += d.balance;
    buckets.total += d.balance;
  }
  return buckets;
}
