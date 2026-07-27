# Security Policy

## Supported Version

Security fixes are applied to the latest commit on the default branch.

## Private Reporting

Report vulnerabilities through GitHub's
[private vulnerability reporting form](https://github.com/lzy2767865503-pixel/lrobotform-resume/security/advisories/new).
Do not open a public issue containing exploit details, customer data, payment
receipts, API keys, access codes, or other credentials.

If GitHub does not show the private form, contact
[@lzy2767865503-pixel](https://github.com/lzy2767865503-pixel) without including
sensitive details and request a private reporting channel. Acknowledgement or
remediation timing cannot be guaranteed, but good-faith reports will be
reviewed.

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
