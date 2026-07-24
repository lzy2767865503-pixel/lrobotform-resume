# Deployment Guide

## 1. Cloudflare Resources

Create a dedicated D1 database and private R2 bucket. Update only these
placeholder values in `wrangler.jsonc`:

- D1 `database_name` and `database_id`;
- R2 `bucket_name`.

Apply the database migration:

```bash
npm run db:migrate:remote
```

## 2. Worker Secrets

Store these as Cloudflare Worker secrets, never as repository variables:

- `ADMIN_KEY`: long random owner API secret;
- `RUNNER_SECRET`: different long random AWS runner secret;
- `OPENAI_API_KEY`: server-side OpenAI credential.

Optional non-secret variables:

- `OPENAI_VISION_MODEL`;
- `OPENAI_IMAGE_DETAIL`;
- `MYR_CNY_RATE`.

Deploy with:

```bash
npm run deploy
```

## 3. AWS Runner

Copy `resume_runner.py`, `requirements.txt`, and the systemd service to
`/opt/lrobotform-runner`. Create a root-readable `.env` file:

```dotenv
LROBOTFORM_BASE_URL=https://your-worker.example.com
RUNNER_SECRET=the-same-runner-secret-used-by-cloudflare
OPENAI_API_KEY=server-side-openai-key
OPENAI_TEXT_MODEL=gpt-4.1-mini
POLL_SECONDS=8
RESUME_MAX_ATTEMPTS=3
RESUME_QUALITY_MIN=82
```

Set restrictive permissions:

```bash
sudo chown -R root:root /opt/lrobotform-runner
sudo chmod 700 /opt/lrobotform-runner
sudo chmod 600 /opt/lrobotform-runner/.env
```

Install dependencies and enable the service:

```bash
python3 -m pip install -r /opt/lrobotform-runner/requirements.txt
sudo cp /opt/lrobotform-runner/lrobotform-resume-runner.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lrobotform-resume-runner
```

## 4. Production Controls

- Configure Cloudflare WAF and provider-level rate limits.
- Keep R2 private and do not expose object keys through public listings.
- Rotate `ADMIN_KEY`, `RUNNER_SECRET`, and model credentials periodically.
- Keep owner and runner secrets different.
- Back up D1 before schema changes.
- Monitor queued and stale jobs, API failures, and abnormal proof reuse.
- Never add real receipts or customer resumes to tests or issue reports.
