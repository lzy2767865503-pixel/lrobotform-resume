# Lrobotform Resume

> Created and owned by **LAI ZEYU**
> Copyright (c) 2026 LAI ZEYU. Released under the MIT License.

Lrobotform Resume is a bilingual, privacy-aware resume workflow that converts
verified source material into two deliverables:

- an ATS-ready, single-column PDF with selectable text;
- a visual PDF designed for direct human review.

The system combines a commercial frontend, Cloudflare Worker API, D1 order
state, private R2 file storage, OpenAI-assisted payment and content processing,
and a continuously running AWS job runner. An order is never marked complete
until both PDFs exist and the content quality gate passes.

![Lrobotform Resume product interface](docs/product-preview.png)

## Portfolio Scope

This repository contains **only the Lrobotform Resume product**. The separate
Google Form project is intentionally excluded.

The public version also excludes all production credentials, bank details,
payment QR codes, customer records, uploaded receipts, and generated customer
resumes. Configuration examples contain placeholders only.

## What I Designed

LAI ZEYU defined the product requirements, workflow, quality standards,
architecture decisions, privacy boundaries, and final acceptance criteria.
Implementation was developed under LAI ZEYU's direction with AI-assisted
engineering tools.

Key product and engineering decisions include:

- two purpose-specific PDFs from one source submission;
- factuality checks that prohibit invented schools, employers, dates, awards,
  metrics, and qualifications;
- private payment-proof storage and strict file-signature validation;
- SHA-256 duplicate-proof blocking across all Resume orders;
- unguessable per-order access codes for status and downloads;
- separate administrator and AWS runner credentials;
- atomic job claiming, stale-job recovery, and automatic service restart;
- a hard completion gate requiring two valid PDFs and a passing quality report;
- bilingual Chinese and English interface text.

## Architecture

```mermaid
flowchart LR
    U["Customer browser"] --> W["Cloudflare Worker"]
    W --> D["D1 order and job state"]
    W --> R["Private R2 files"]
    W --> V["OpenAI payment vision"]
    A["AWS Resume Runner"] -->|authenticated polling| W
    A --> T["OpenAI resume drafting and audit"]
    A --> P["ATS PDF plus visual PDF"]
    P -->|validated upload| W
    W --> U
```

## Repository Layout

```text
public/          Product interface and bilingual client workflow
src/             Resume-only Cloudflare Worker API
migrations/      D1 schema for orders, jobs, events, and proof fingerprints
aws-runner/      AWS polling worker, PDF generation, and systemd service
docs/            Architecture and deployment documentation
.github/         CODEOWNERS and automated validation
```

## Security Model

1. The browser submits directly to the same-origin Worker.
2. Uploaded files are size-limited, MIME-checked, and signature-checked.
3. The proof is fingerprinted before storage; an existing hash is rejected.
4. OpenAI vision may approve a coherent receipt or route ambiguity to review.
5. Payment files and output PDFs remain private in R2.
6. Public status and download routes require a random per-order access code.
7. AWS and owner APIs use independent bearer secrets.
8. A job cannot become complete without two structurally valid PDFs and a
   passing quality result.

See [SECURITY.md](SECURITY.md) for reporting and production boundaries.

## Local Validation

Requirements:

- Node.js 22 or later
- npm 10 or later
- Python 3.10 or later

```bash
git clone https://github.com/lzy2767865503-pixel/lrobotform-resume.git
cd lrobotform-resume
./scripts/verify.sh
```

The verifier installs the locked Node and Python dependencies, performs a
Worker dry-run, applies the D1 migration locally, and runs Worker and runner
behavior tests without contacting OpenAI or using Cloudflare credentials.
See [docs/REPRODUCIBILITY.md](docs/REPRODUCIBILITY.md) for the tested boundary
and expected results.

For local API development, copy `.dev.vars.example` to `.dev.vars`, create a
local D1 database, and apply the migration:

```bash
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Replace or remove placeholder API credentials before testing integrations. With
no OpenAI key, payment evidence is routed to manual review rather than uploaded
to a model.

Never commit `.dev.vars`, `.env`, API keys, customer materials, or payment
proofs. The ignore rules block these common secret and data paths.

## Deployment

Deployment needs a Cloudflare Worker, D1 database, private R2 bucket, and an
Ubuntu server for the Resume runner. Replace the placeholder resource IDs in
`wrangler.jsonc`, configure secrets through the provider dashboards or secret
stores, then follow [docs/deployment.md](docs/deployment.md).

Local validation is fully credential-free. A production-equivalent deployment
requires accounts and credentials supplied by the reproducer for Cloudflare,
OpenAI, and an Ubuntu-compatible host; none are included in this repository.

## Ownership

Repository metadata, commit authorship, package metadata, CODEOWNERS,
`CITATION.cff`, and the visible product footer identify **LAI ZEYU** as the
project owner and creator. See [PROJECT_OWNERSHIP.md](PROJECT_OWNERSHIP.md).

The software is available under the [MIT License](LICENSE), which permits
independent reproduction while retaining the copyright and license notice. The
license does not transfer authorship, the Lrobotform name, logos, project
identity, or third-party trademark rights.
