import { xirr, buildPortfolioFlows } from "@/lib/xirr";

describe("xirr", () => {
  it("matches Excel XIRR reference example", () => {
    const rate = xirr([
      { date: "2008-01-01", amount: -10000 },
      { date: "2008-03-01", amount: 2750 },
      { date: "2008-10-30", amount: 4250 },
      { date: "2009-02-15", amount: 3250 },
      { date: "2009-04-01", amount: 2750 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(0.373362535, 4);
  });

  it("returns 0 for a flow that merely returns the investment one year later", () => {
    const rate = xirr([
      { date: "2026-01-01", amount: -100_000 },
      { date: "2027-01-01", amount: 100_000 },
    ]);
    expect(rate).not.toBeNull();
    expect(Math.abs(rate!)).toBeLessThan(0.01);
  });

  it("returns negative rate when the portfolio is worth less than invested", () => {
    const rate = xirr([
      { date: "2026-01-01", amount: -100_000 },
      { date: "2027-01-01", amount: 80_000 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(-0.2, 3);
  });

  it("returns null when there is no sign change", () => {
    expect(xirr([{ date: "2026-01-01", amount: 100 }])).toBeNull();
    expect(
      xirr([
        { date: "2026-01-01", amount: 100 },
        { date: "2026-02-01", amount: 200 },
      ]),
    ).toBeNull();
  });

  it("understands dates in the Sber report format DD.MM.YYYY", () => {
    const rate = xirr([
      { date: "02.10.2026", amount: -100_000 },
      { date: "01.10.2027", amount: 110_000 },
    ]);
    expect(rate).not.toBeNull();
    expect(rate!).toBeCloseTo(0.1, 2);
  });

  it("ignores flows with an unparsable date instead of throwing", () => {
    const rate = xirr([
      { date: "02.10.2026", amount: -100_000 },
      { date: "не дата", amount: 50_000 },
      { date: "01.10.2027", amount: 60_000 },
    ]);
    expect(rate).not.toBeNull();
  });

  it("builds flows with deposits negative and terminal value positive", () => {
    const flows = buildPortfolioFlows({
      deposits: [{ date: "2026-10-02", amount: 400_000 }],
      withdrawals: [{ date: "2026-10-10", amount: 5_000 }],
      terminalValue: 427_490.83,
      terminalDate: "2026-10-13",
    });
    expect(flows).toHaveLength(3);
    expect(flows[0]).toEqual({ date: "2026-10-02", amount: -400_000 });
    expect(flows[1]).toEqual({ date: "2026-10-10", amount: 5_000 });
    expect(flows[2]).toEqual({ date: "2026-10-13", amount: 427_490.83 });
  });
});
