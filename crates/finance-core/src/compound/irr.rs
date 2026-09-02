#![allow(clippy::ref_option, clippy::option_map_or_none, clippy::missing_errors_doc, clippy::assigning_clones, clippy::if_not_else, clippy::map_unwrap_or, clippy::needless_late_init, clippy::needless_pass_by_value, clippy::struct_excessive_bools, clippy::too_many_arguments)]
//! IRR helper mirroring `lib/compound-interest/irr.ts`.

/// Monthly IRR cash flows → annualized rate in percent.
/// Matches TypeScript sparse-array semantics: unset months become NaN in NPV.
pub fn annualized_irr(cash_flows: &[Option<f64>]) -> f64 {
    if cash_flows.len() < 2 {
        return 0.0;
    }

    let mut rate: f64 = 0.01;
    for _ in 0..64 {
        let mut npv = 0.0_f64;
        let mut derivative = 0.0_f64;
        for (t, flow) in cash_flows.iter().enumerate() {
            let flow = flow.unwrap_or(f64::NAN);
            let t = t as f64;
            let factor = (1.0_f64 + rate).powf(t);
            npv += flow / factor;
            if t > 0.0 {
                derivative -= (t * flow) / (1.0_f64 + rate).powf(t + 1.0);
            }
        }
        if derivative.abs() < 1e-12 {
            break;
        }
        let next = rate - npv / derivative;
        if !next.is_finite() {
            break;
        }
        if (next - rate).abs() < 1e-9 {
            rate = next;
            break;
        }
        rate = next;
    }

    if !rate.is_finite() {
        return 0.0;
    }
    ((1.0 + rate).powf(12.0) - 1.0) * 100.0
}
