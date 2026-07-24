# Security Policy

## Reporting

Please use the repository's private GitHub security advisory feature to report
a vulnerability. Do not include customer data, payment receipts, API keys, or
other credentials in a public issue.

## Security Boundaries

- Browser code never receives OpenAI, R2, runner, or administrator credentials.
- Payment proofs and generated resumes belong in private object storage.
- Public status and download requests require an unguessable per-order access
  code.
- AWS runner and owner endpoints use separate bearer secrets.
- A SHA-256 fingerprint prevents identical payment proofs from being reused.
- Two validated PDFs and a passing quality result are required before an order
  can become complete.

The in-memory request limiter is a secondary control. Production deployments
should also enable Cloudflare WAF and rate-limiting rules.
