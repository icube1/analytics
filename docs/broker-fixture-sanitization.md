# Broker fixture sanitization

Tracked broker HTML fixtures (`public/portfolio.html`, `__tests__/fixtures/sber-t1-report.html`) are sanitized copies of Sber brokerage reports. They keep securities tables, dates, quantities, and monetary values needed by `parsePortfolioHtml`, but replace customer identity and embedded media with deterministic placeholders.

## Running the sanitizer

```bash
npm run sanitize:broker-fixtures
```

The script is idempotent: running it again on already-sanitized files leaves them unchanged. Tests in `__tests__/broker-fixture-privacy.test.ts` enforce this.

## What gets replaced

| Category | Placeholder |
|----------|-------------|
| Investor name | `Тестовый Инвестор` |
| Contract ID | `SANITIZED-CONTRACT` |
| Account numbers (labelled fields only) | `SANITIZED-ACCOUNT` |
| Email / phone / address | `[SANITIZED-EMAIL]`, `[SANITIZED-PHONE]`, `SANITIZED-ADDRESS` |
| Signature rows, `<img>`, `data:image/*`, `<meta>`, HTML comments | removed |

ISINs, trade IDs, tickers, and arithmetic columns are intentionally preserved.

## Residual git history risk

**Sanitizing current files does not erase earlier commits.** If personal data was ever committed, it may still exist in:

- prior commits on `master` and feature branches
- forks, clones, and CI artifact caches created before sanitization
- GitHub pull-request diffs and review comments that captured the old blob content

This change deliberately avoids rewriting history (`git filter-repo`, force-push). That keeps collaboration safe but means anyone with an old clone can still inspect pre-sanitization blobs via `git log -p` or `git show <old-commit>:public/portfolio.html`.

To fully remove leaked PII from a remote, a repository maintainer must run an approved history-rewrite workflow (for example `git filter-repo` or BFG), coordinate force-pushes with all collaborators, and invalidate cached forks/artifacts. Until then, treat historical SHAs as potentially containing customer data even though `HEAD` is clean.
