# Reproducibility Guide

## What A Clean Clone Can Verify

The public repository supports a credential-free verification path for:

- deterministic dependency installation from `package-lock.json`;
- Cloudflare Worker packaging and binding validation;
- local D1 schema migration;
- same-origin, authorization, file-signature, and delivery-gate behavior;
- runner normalization, content-quality, PDF rendering, and PDF validation;
- static frontend and `/api/health` startup.

No test sends data to OpenAI, writes to a remote D1/R2 resource, or needs a
production payment proof.

## Reference Environment

- Node.js 22
- npm 10 or later
- Python 3.10 or later
- ReportLab 4.5.1, pinned in `aws-runner/requirements.txt`

The `.nvmrc` and `.node-version` files select Node 22 for common version
managers. CI uses Node 22 and Python 3.12.

## Clean-Clone Verification

```bash
git clone https://github.com/lzy2767865503-pixel/lrobotform-resume.git
cd lrobotform-resume
chmod +x scripts/verify.sh
./scripts/verify.sh
```

Expected results:

- Wrangler dry-run exits successfully;
- Worker behavior tests pass without credentials;
- runner behavior tests generate and validate both PDF variants;
- the local migration executes all statements successfully.

The verifier creates an ignored `.venv`, installs the exact runner dependency
versions, uses `npm ci`, and then runs the same `npm test` gate used in CI.

To inspect the local interface and health endpoint:

```bash
cp .dev.vars.example .dev.vars
npm run dev
```

Open `http://127.0.0.1:8787` and
`http://127.0.0.1:8787/api/health`. Placeholder credentials must be removed or
replaced before integration testing. `MYR_CNY_RATE` in the example prevents a
network dependency during local order intake.

## Production-Equivalent Boundary

A complete production pipeline cannot be reproduced from source code alone. The
reproducer must supply and pay for, where applicable:

1. a Cloudflare account with Workers, D1, and private R2;
2. an OpenAI API project and server-side key with access to the configured
   models;
3. an Ubuntu-compatible host for the continuously running runner;
4. independently generated `ADMIN_KEY` and `RUNNER_SECRET` values;
5. provider-side WAF, rate limits, monitoring, backups, and secret rotation.

These resources and credentials are intentionally absent from GitHub. Follow
[deployment.md](deployment.md) after the credential-free checks pass.

## Data Boundary

Only synthetic fixtures may be used in public tests. Do not commit real names,
contact details, resumes, payment proofs, order records, access codes, generated
customer PDFs, or provider credentials. Local `.dev.vars`, `.env`, D1 state,
R2 state, and generated outputs are ignored by Git.
