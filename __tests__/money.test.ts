import {
  addMoney,
  amortizeMoney,
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
    expect(interest.minor).toBe(
      Math.sign(interest.minor) *
        Math.trunc(Math.abs(100000 * 0.2 * (31 / 365)) + 0.5),
    );
  });

  it("amortizes a RUB payment after rounding interest to kopecks", () => {
    const result = amortizeMoney({
      balanceMinor: 10_000_000,
      paymentMinor: 250_000,
      annualRatePercent: 20,
      periodDays: 31,
      yearDays: 365,
      currency: "RUB",
    });
    expect(result.interestMinor).toBe(169_863);
    expect(result.principalMinor).toBe(80_137);
    expect(result.interestMinor + result.principalMinor).toBe(250_000);
    expect(result.balanceMinor + result.principalMinor).toBe(10_000_000);
  });

  it("does not reduce principal when accrued interest exceeds the payment", () => {
    const result = amortizeMoney({
      balanceMinor: 10_000_000,
      paymentMinor: 150_000,
      annualRatePercent: 20,
      periodDays: 31,
      yearDays: 365,
      currency: "RUB",
    });
    expect(result.interestMinor).toBe(169_863);
    expect(result.principalMinor).toBe(0);
    expect(result.balanceMinor).toBe(10_000_000);
  });
});
