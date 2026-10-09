import { describe, expect, it } from "vitest";
import { agingBuckets, paymentStatus } from "../receivables";
import { addDays, dayNumber, startOfWeek } from "../dates";

describe("paymentStatus", () => {
  const asOf = "2026-09-30";
  it.each([
    [{ status: "void", total: 100, amountPaid: 0, dueDate: asOf }, "void"],
    [{ status: "issued", total: 100, amountPaid: 100, dueDate: "2026-01-01" }, "paid"],
    [{ status: "issued", total: 100, amountPaid: 0, dueDate: "2026-09-29" }, "overdue"],
    [{ status: "issued", total: 100, amountPaid: 40, dueDate: "2026-10-30" }, "partial"],
    [{ status: "issued", total: 100, amountPaid: 0, dueDate: asOf }, "pending"],
  ])("%o -> %s", (doc, expected) => {
    expect(paymentStatus(doc, asOf)).toBe(expected);
  });
});

describe("agingBuckets", () => {
  it("groups balances by days overdue", () => {
    const b = agingBuckets(
      [
        { dueDate: "2026-10-10", balance: 100 },
        { dueDate: "2026-09-20", balance: 200 },
        { dueDate: "2026-08-20", balance: 300 },
        { dueDate: "2026-07-20", balance: 400 },
        { dueDate: "2026-01-01", balance: 500 },
        { dueDate: "2026-01-01", balance: 0 },
      ],
      "2026-09-30"
    );
    expect(b).toEqual({ current: 100, days1to30: 200, days31to60: 300, days61to90: 400, over90: 500, total: 1500 });
  });
});

describe("dates", () => {
  it("handles week starts and month arithmetic across boundaries", () => {
    expect(startOfWeek("2026-10-04")).toBe("2026-09-28"); // Sunday -> Monday
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(dayNumber("2026-03-01T23:00:00Z") - dayNumber("2026-02-28")).toBe(1);
  });
});
