# Deployment Guide

This guide describes a production-equivalent deployment. It requires your own
Cloudflare and OpenAI accounts plus an Ubuntu-compatible host. Never reuse
development secrets in production.

## 1. Cloudflare Resources

Authenticate Wrangler, create a dedicated D1 database and private R2 bucket,
then copy the returned D1 identifier into `wrangler.jsonc`:

```bash
npx wrangler login
npx wrangler d1 create lrobotform-resume
npx wrangler r2 bucket create lrobotform-resume-private
```

Update only these placeholder values in `wrangler.jsonc`:

- D1 `database_name` and `database_id`;
- R2 `bucket_name`.

Apply the database migration:

```bash
npm run db:migrate:remote
```

## 2. Worker Secrets

Generate two different high-entropy bearer secrets. Store the following with
`npx wrangler secret put NAME`; never place them in `wrangler.jsonc`:

- `ADMIN_KEY`: owner API secret;
- `RUNNER_SECRET`: separate runner API secret;
- `OPENAI_API_KEY`: server-side OpenAI credential.

Optional non-secret variables may be added under `vars` in `wrangler.jsonc`:

- `OPENAI_VISION_MODEL`;
- `OPENAI_IMAGE_DETAIL`;
- `MYR_CNY_RATE`.

Deploy with:

```bash
npm run deploy
```

Verify the returned Worker URL before configuring the runner:

```bash
curl --fail --silent --show-error https://your-worker.example.com/api/health
```

## 3. Ubuntu Runner

Run these commands from a clean repository clone. They create a non-login,
least-privilege service account and a root-owned directory readable by the
`lrobotform` group:

```bash
sudo useradd --system \
  --home-dir /opt/lrobotform-runner \
  --shell /usr/sbin/nologin \
  lrobotform 2>/dev/null || true
sudo install -d -o root -g lrobotform -m 0750 /opt/lrobotform-runner
sudo install -o root -g lrobotform -m 0640 \
  aws-runner/resume_runner.py \
  aws-runner/requirements.txt \
  /opt/lrobotform-runner/
sudo python3 -m venv /opt/lrobotform-runner/.venv
sudo /opt/lrobotform-runner/.venv/bin/python -m pip install \
  --requirement /opt/lrobotform-runner/requirements.txt
sudo chown -R root:lrobotform /opt/lrobotform-runner
sudo chmod 0750 /opt/lrobotform-runner
```

Create `/opt/lrobotform-runner/.env` with the same runner secret configured on
Cloudflare and a valid server-side OpenAI key:

```dotenv
LROBOTFORM_BASE_URL=https://your-worker.example.com
RUNNER_SECRET=the-same-runner-secret-used-by-cloudflare
OPENAI_API_KEY=server-side-openai-key
OPENAI_TEXT_MODEL=gpt-4.1-mini
POLL_SECONDS=8
RESUME_MAX_ATTEMPTS=3
RESUME_QUALITY_MIN=82
```

Protect the file while allowing the service group to read it:

```bash
sudo chown root:lrobotform /opt/lrobotform-runner/.env
sudo chmod 0640 /opt/lrobotform-runner/.env
sudo install -o root -g root -m 0644 \
  aws-runner/lrobotform-resume-runner.service \
  /etc/systemd/system/lrobotform-resume-runner.service
sudo systemctl daemon-reload
sudo systemctl enable --now lrobotform-resume-runner
sudo systemctl status --no-pager lrobotform-resume-runner
```

The unit runs as `lrobotform:lrobotform`; do not change the application
directory back to mode `0700 root:root`, because that would prevent the service
account from reading its code and environment.

## 4. Production Controls

- Configure Cloudflare WAF and provider-level rate limits.
- Keep R2 private and do not expose object keys through public listings.
- Rotate `ADMIN_KEY`, `RUNNER_SECRET`, and model credentials periodically.
- Keep owner and runner secrets different.
- Back up D1 before schema changes.
- Monitor queued and stale jobs, API failures, and abnormal proof reuse.
- Never add real receipts or customer resumes to tests or issue reports.
- Run `npm ci && npm test` before each deployment.
