# Deploying to Railway

> Railway paused new sign-ups in October 2026 after a security incident. The free setup LeadHub uses is [Render + Turso](deploy-render.md); this guide stays for hosts that offer a persistent disk.

LeadHub runs on Railway as **one service** built from the repository's `Dockerfile`, with a **volume** at `/data` for the SQLite database and its backups. Railway's edge terminates HTTPS, so the app gets secure cookies and HSTS automatically.

| | |
| --- | --- |
| Plan | **Hobby** ($5/month, includes $5 of usage; one small service normally fits inside it, and volumes bill only for the space used, about $0.15 per GB per month). The free Trial works for a test run. |
| Region | **Asia Southeast (Singapore)**, the closest Railway region to India |
| Instances | **Exactly 1.** Railway does not allow replicas on a service with a volume, and SQLite needs a single writer anyway |
| Deploys | Automatic from `main`, after GitHub CI passes ("Wait for CI") |

## 1. Create the service (empty first)

Creating an empty service first lets you set variables and the volume before the first build, so the first deployment succeeds instead of failing for lack of an admin password.

1. Sign in at [railway.com](https://railway.com) and pick the Hobby plan.
2. **New Project → Empty Project**, rename it `leadhub`.
3. **Create → Empty Service**, rename it `leadhub`.
4. Service **Settings → Deploy → Regions**: choose **Asia Southeast**. Do this *before* adding the volume, because a volume stays in the region it was created in.

## 2. Variables

Service **Variables → Raw Editor**, paste and fill in:

```env
NODE_ENV=production
PORT=4000
DB_PATH=/data/crm.db
TRUST_PROXY=1
SEED_ADMIN_EMAIL=you@yourcompany.com
SEED_ADMIN_PASSWORD=
```

- `SEED_ADMIN_PASSWORD`: generate one in your password manager (at least 12 characters; 20+ is better). After saving, open the variable's **⋯ menu → Seal** so it can never be read back from the dashboard or API.
- `TRUST_PROXY=1`: Railway's edge is one proxy hop in front of the app, so the login rate limit sees each visitor's real address.
- Everything else (HTTPS-only cookies, no demo data, daily backups, request logs) is already the production default. See the README's configuration table.
- Optional, later: `ANTHROPIC_API_KEY` turns on the AI assistant. Seal it too.

The two `SEED_ADMIN_*` values are used **only while the database is empty**, to create the first admin.

## 3. Volume

On the project canvas, right-click the service → **Attach Volume**, mount path **`/data`**.

The container starts as root only long enough to give `/data` to the unprivileged `node` user, then runs the app as that user (`docker-entrypoint.sh`). You do **not** need `RAILWAY_RUN_UID`.

## 4. Deploy settings

Service **Settings → Deploy**:

| Setting | Value |
| --- | --- |
| Healthcheck path | `/api/health` |
| Restart policy | On failure |
| Custom start command | leave empty (the image runs `node dist-server/index.js` directly, so the app receives SIGTERM) |

## 5. Connect GitHub (this triggers the first deploy)

1. Service **Settings → Source → Connect Repo**: `rrushikeshp89/leadhub-crm`, branch `main`. When GitHub asks, give the Railway app access to **only this repository**.
2. Turn on **Wait for CI**: Railway then waits until the GitHub `CI` workflow (tests, build and the Docker image check) passes before deploying a commit.
3. Railway detects the `Dockerfile` and builds it. In the deploy logs you should see:
   ```
   LeadHub listening on port 4000 (production)
   [backup] wrote /data/backups/crm-YYYYMMDD-HHMMSS.db
   ```

## 6. Public URL

Service **Settings → Networking → Generate Domain**, target port **4000**. You get `https://<name>.up.railway.app`. A custom domain comes in Phase 6.

## 7. First sign-in

1. Open the URL, sign in with `SEED_ADMIN_EMAIL` and the password from step 2.
2. Change the password in **Profile**.
3. Delete the `SEED_ADMIN_PASSWORD` variable; it is not used once the database has users, so there is no reason to keep it around.

## Operations

- **Logs**: one JSON line per request (method, path, status, duration; no query strings, bodies or cookies).
- **Backups**: a snapshot every 24 hours in `/data/backups`, newest 7 kept. They live on the same volume, so also copy them off Railway regularly. For example, download from the volume with the Railway CLI's `railway volume files download`. Railway's volume backups (manual or scheduled, see Railway's *Backups* docs) add another layer.
- **Redeploys**: Railway never runs two deployments on one volume at once, so expect a few seconds of downtime per deploy. The app finishes open requests and closes the database on SIGTERM.
- **Rolling back**: in **Deployments**, pick an earlier deployment → **Redeploy**.
- **Health**: `GET /api/health` returns `{"ok":true}` when the app can read its database.
