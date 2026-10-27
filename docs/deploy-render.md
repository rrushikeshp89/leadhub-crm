# Deploying to Render + Turso (free)

LeadHub runs as a **free Render web service** built from the repository's `Dockerfile`. Its data lives in a **free Turso database**: hosted SQLite, so the schema and queries are the same as in local development. Both plans need no credit card.

| | |
| --- | --- |
| App | Render free web service, Singapore, defined in [`render.yaml`](../render.yaml) |
| Database | Turso free plan: 5 GB, 500 million row reads and 10 million row writes a month, 1-day point-in-time restore |
| Deploys | Automatic from `main`, only after GitHub CI passes |
| Cost | ₹0 |

**What "free" means here:**
- Render puts a free service to sleep after **15 minutes without visitors**. The next visit wakes it in about **a minute**; after that it is fast again. Upgrading the service to a paid instance later removes the sleep, with no code changes.
- 750 free instance-hours a month is enough for this one service to run all month.
- The data is safe while the app sleeps: it lives in Turso, not on Render's disk.

## 1. Create the Turso database

1. Sign up at [turso.tech](https://turso.tech) (GitHub sign-in works) and stay on the **Free** plan.
2. **Create database**: name it `leadhub` and pick the location **closest to Singapore**, where the app runs.
3. Open the database and copy its **URL**, which looks like `libsql://leadhub-<your-org>.turso.io`.
4. **Generate token** with read and write access. Copy it now: it is shown only once. Keep it in your password manager.

LeadHub creates its tables itself on first start.

## 2. Create the Render service from the Blueprint

1. Sign up at [render.com](https://render.com) with GitHub and allow access to **only** `rrushikeshp89/leadhub-crm`.
2. **New → Blueprint**, pick the repository. Render reads `render.yaml` and shows one web service, `leadhub`, on the free plan in Singapore.
3. Render asks for the four secret values:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | the Turso URL from step 1 |
   | `DATABASE_AUTH_TOKEN` | the Turso token from step 1 |
   | `SEED_ADMIN_EMAIL` | the email you will sign in with |
   | `SEED_ADMIN_PASSWORD` | a new password from your password manager, at least 12 characters |

4. **Apply**. Render builds the Docker image (a few minutes the first time). The deploy log ends with:
   ```
   LeadHub listening on port <port> (production); database: leadhub-<your-org>.turso.io
   ```
5. Your URL is at the top of the service page: `https://leadhub-xxxx.onrender.com`.

## 3. First sign-in

1. Open the URL and sign in with `SEED_ADMIN_EMAIL` and the password from step 2.
2. Change the password in **Profile**.
3. In Render, open the service's **Environment** tab and delete `SEED_ADMIN_PASSWORD`. It is only read while the database is empty, so there is no reason to keep it.

## Operations

- **Logs**: Render's **Logs** tab shows one JSON line per request (method, path, status, duration; no query strings, bodies or cookies).
- **Backups**: Turso keeps a point-in-time restore for 1 day on the free plan. For longer history, copy the database regularly from the Turso dashboard or CLI. The app's own file snapshots only run for local database files.
- **Redeploys**: every merge to `main` deploys once CI passes. Render sends SIGTERM to the old instance, and the app finishes open requests before exiting.
- **Rolling back**: in Render's **Events** tab, pick an earlier deploy → **Rollback**.
- **Health**: `GET /api/health` returns `{"ok":true}` when the app can reach its database.
- **AI assistant (optional)**: add `ANTHROPIC_API_KEY` in the **Environment** tab; the service restarts with AI turned on.
