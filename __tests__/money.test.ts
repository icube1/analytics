import {
  addMoney,
  interestMoney,
  moneyFromMajor,
  roundMoney,
} from "@/lib/money";

describe("exact money rounding", () => {
  it("stores RUB in kopecks with half-away-from-zero ties", () => {
    const amount = moneyFromMajor(10.125, "rub");
    expect(amount.currency).toBe("RUB");
    expect(amount.exponent).toBe(2);
    expect(amount.minor).toBe(1013);
    expect(amount.major).toBe(10.13);
  });

  it("uses banker rounding when requested", () => {
    expect(roundMoney({ major: 10.125, currency: "RUB", mode: "halfEven" }).minor).toBe(
      1012,
    );
  });

  it("adds minor units without floating drift", () => {
    const sum = addMoney({ leftMinor: 1013, rightMinor: 7, currency: "RUB" });
    expect(sum.minor).toBe(1020);
    expect(sum.major).toBe(10.2);
  });

  it("rounds simple interest after f64 accrual", () => {
    const interest = interestMoney({
      principalMinor: 100_000,
      annualRatePercent: 20,
      periodDays: 31,
      yearDays: 365,
      currency: "RUB",
    });
    expect(Number.isInteger(interest.minor)).toBe(true);
    expect(interest.minor).toBe(Math.sign(interest.minor) * Math.trunc(Math.abs(100000 * 0.2 * (31 / 365)) + 0.5));
  });
});
