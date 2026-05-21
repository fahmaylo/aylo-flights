# Aylo Flight Alert — Claude Code Handoff

> **Paste this entire file into Claude Code as your first message.**
> It contains all the context, decisions, and step-by-step instructions to take Aylo Flight Alert from this state to a fully deployed production service.

---

## 1. What Aylo is

A simple, focused product: **nonstop flight price alerts.**

- User enters a route (e.g. SFO → CDG), trip length (5–7 nights), travel window (next 6 months), target price, and email.
- Once a day, we check Google Flights data. If a nonstop flight on that route matches their criteria at or below their target price, we email them with the dates and a link to book on Google Flights.
- We never charge a fee. We never sell their email. Alerts expire automatically after 3 months.

This is being shipped first to **a single user (the founder)** to validate the concept. The architecture is built for that scale but scales cleanly with adoption.

---

## 2. Key product decisions (already made — don't re-litigate)

- **Nonstop only.** Multi-stop pricing introduces too much UX and data complexity for v1. UI tells users this clearly.
- **Email only.** No SMS. SMS was considered and ruled out (cost, complexity, TCPA compliance burden).
- **No price suppression logic.** If the price is below target on a given day, we email. Period. If the user gets annoyed by repeat emails, they cancel and set a new alert. Simpler than tracking last-notified prices and trying to be clever about it.
- **3-month auto-expiry on every alert.** Stale alerts produce noise.
- **No accounts.** Each alert has a unique UUID. The cancel link in emails (and on the LP) is the auth mechanism. Anyone with the URL can cancel — fine for MVP.
- **Polling at 9 AM UTC, once per day.**
- **Route-level batching.** If 50 users have alerts on SFO → CDG, we do not make 50× the API calls. We poll the route once per day and apply each user's filter to the cached results. This is the key cost optimization.

---

## 3. Tech stack

| Layer | Tech | Hosting |
|---|---|---|
| Frontend | Static HTML/CSS/JS (no build step) | Vercel (free) |
| Backend API | Node.js + Express | Railway |
| Database | Postgres | Railway plugin |
| Cron | node-cron (runs in the backend process) | Railway |
| Flight data | SearchAPI `google_flights_calendar` | SaaS, ~$40/mo Developer plan |
| Email | SendGrid | SaaS, free tier covers 100/day |
| Domain | `ayloai.com` (already owned) | DNS-only |

**Routing plan:**
- `ayloai.com/flights` → frontend (Vercel)
- `ayloai.com/flights/alert/{id}` → alert landing page
- `ayloai.com/flights/manage/{id}` → manage alert page
- `api.ayloai.com` → backend API (Railway)

---

## 4. What's in this repo

```
aylo-flights/
  HANDOFF.md             ← this file
  .gitignore

  frontend/
    vercel.json          ← rewrites for /alert/:id and /manage/:id
    flights/
      index.html         ← main app (search form → set alert) [WIRED to backend]
      alert.html         ← landing page from email when price hits [needs minor work]
      manage.html        ← manage page linked from confirmation email [needs minor work]

  backend/
    src/
      index.js           ← entry point (starts server + cron)
      server.js          ← Express API (POST /alerts, GET /alerts/:id, DELETE /alerts/:id)
      poller.js          ← daily cron job, route-grouped polling
      search.js          ← SearchAPI Calendar integration
      email.js           ← SendGrid templates (confirmation + alert)
      db.js              ← Postgres connection
    schema.sql           ← database schema
    package.json
    .env.example
    backend-README.md    ← deeper docs on the backend
    email-reference.html ← static reference for what the confirmation email looks like
```

---

## 5. State of each file: what's done, what isn't

### Backend — DONE
All backend files are written, syntax-checked, and unit-tested with mock data. No changes needed before deployment. Just need real env vars and a Postgres database.

### Frontend — `index.html` — DONE
Complete MVP form. Wired to call the backend's `POST /alerts` endpoint. Has validation, error states, success state. Configures `API_URL` from `localhost` for dev and `https://api.ayloai.com` for production. **This file does not need code changes before deployment** — only the `API_URL` constant may need adjusting if you use a different domain.

### Frontend — `alert.html` — NEEDS MINOR WORK
The page UI is built (you can preview it as-is — it has placeholder data for SFO→Paris). I added a `<script>` block at the bottom that:
1. Parses the alert ID from the URL (`/alert/{id}`)
2. Fetches `GET /alerts/:id` from the backend
3. Populates elements with `data-aylo="..."` attributes
4. Sends `DELETE /alerts/:id` when the user clicks cancel

**What needs doing:** add `data-aylo="..."` attributes to the existing HTML elements so the script can target them. The hardcoded values (e.g. "SFO → Paris", "$687", "Sun Sep 14 — Sun Sep 21") need to be replaced with elements like `<span data-aylo="route"></span>`. The script references these attributes:
- `data-aylo="route"` → "San Francisco → Paris"
- `data-aylo="target"` → "$700"
- `data-aylo="trip-length"` → "5–7 nights"
- `data-aylo="window"` → "Next 6 months"
- `data-aylo="expires"` → "August 18, 2026"
- `data-aylo="last-best-price"` → "$687" or "no flights tracked yet"
- `data-aylo="last-best-dates"` → "Sun Sep 14 — Sun Sep 21"
- `data-aylo="last-best-nights"` → "7 nights · Nonstop"
- `data-aylo="last-polled"` → "Last checked Mar 12, 9:41 AM"

This is ~10 minutes of careful HTML editing.

### Frontend — `manage.html` — NEEDS MINOR WORK
Same situation as `alert.html`. Script is wired, needs `data-aylo` attributes added to the relevant elements. Same set of attribute names applies.

---

## 6. Deployment plan — step by step

**Prerequisites:**
- GitHub account
- Domain `ayloai.com` already owned (user has this)
- ~$50 in monthly budget headroom (SearchAPI Developer plan + Railway hobby tier)

### Step 1 — Set up GitHub repo

The user says they've created a GitHub repo but is unsure of permissions. Check this first:

```bash
# In the project directory
git init
git status
# Try a remote push to verify access
git remote -v
```

If the repo URL isn't set, ask the user for it. Set it:
```bash
git remote add origin git@github.com:USERNAME/REPO_NAME.git
# or
git remote add origin https://github.com/USERNAME/REPO_NAME.git
```

Test access with:
```bash
git fetch origin
```

If it fails on auth, the user needs to either:
- Set up SSH keys (`ssh-keygen`, add to GitHub)
- Or use a Personal Access Token for HTTPS

Then:
```bash
git add .
git commit -m "Initial commit: Aylo Flight Alert MVP"
git push -u origin main
```

### Step 2 — Sign up for services

Walk the user through each one. They'll need:

**SearchAPI** (`searchapi.io`)
- User already has account. Reuse existing API key.
- Free tier (100 lifetime credits) is fine for initial testing. Upgrade to Developer ($40/mo, 10K calls/mo) once they want to run a real daily poll.

**SendGrid** (`sendgrid.com`)
- Free tier: 100 emails/day
- Settings → API Keys → Create API key → "Restricted Access" → enable "Mail Send" only → save the key (shown once)
- Settings → Sender Authentication → Domain Authentication → enter `ayloai.com` → SendGrid gives 3 CNAME records → add them in the user's DNS (likely Cloudflare or wherever ayloai.com is registered) → click verify after DNS propagates (5–60 min)
- This step is critical. Without verified sender, emails go to spam.

**Railway** (`railway.app`)
- Free $5 credit/month, enough for early use
- New Project → "Empty Project" → Add → Database → Postgres
- Copy the `DATABASE_URL` from the Postgres service (the "Connect" tab)

**Vercel** (`vercel.com`)
- Free tier
- Sign in with GitHub
- (We'll set up the project in step 4)

### Step 3 — Deploy the backend to Railway

In Railway (same project as the Postgres):

1. Add a service → Deploy from GitHub repo → select the repo
2. Set the root directory to `/backend`
3. Add environment variables under Service → Variables:
   - `SEARCHAPI_KEY` = (from SearchAPI dashboard)
   - `SENDGRID_API_KEY` = (from SendGrid)
   - `SENDGRID_FROM_EMAIL` = `alerts@ayloai.com`
   - `APP_URL` = `https://ayloai.com/flights`
   - `DATABASE_URL` is set automatically when you link the Postgres service
   - `NODE_ENV` = `production`
4. Settings → Networking → Generate domain. Railway gives a public URL like `aylo-flights-production.up.railway.app`. Note it.
5. Wait for the deploy to finish (~1 min). Check logs for "Aylo API listening on port 3000".

### Step 4 — Initialize the database

In Railway → Postgres service → Data tab → Query:

Paste the contents of `backend/schema.sql` and run it. You should see "CREATE TABLE" output.

Verify:
```sql
SELECT * FROM alerts;
-- empty table, no error = success
```

### Step 5 — Smoke test the backend

From your terminal:

```bash
RAILWAY_URL="https://aylo-flights-production.up.railway.app"

# Health check
curl $RAILWAY_URL/health

# Create a test alert (use your own email!)
curl -X POST $RAILWAY_URL/alerts \
  -H 'Content-Type: application/json' \
  -d '{
    "email": "YOUR_EMAIL@example.com",
    "origin": "SFO",
    "destination": "CDG,ORY",
    "origin_city": "San Francisco",
    "destination_city": "Paris",
    "min_nights": 5,
    "max_nights": 10,
    "travel_window": "6mo",
    "target_price": 900
  }'
# Should return { "id": "uuid-..." }
```

**Check your inbox** — you should receive a confirmation email within 30 seconds. If not:
- Check spam folder
- Check Railway logs for SendGrid errors
- Verify SendGrid sender domain is verified

### Step 6 — Manually trigger a poll (test end-to-end)

In Railway, set env var `RUN_ON_START=true` and restart the service. The poller will run immediately. Watch the logs:

```
Found 1 active alert(s).
Grouped into 1 unique route(s).
Processing SFO→CDG,ORY (6 months, 1 alert(s))...
  SFO→CDG,ORY: 13 calls, 2548 combos collected
  Alert abc12345: cheapest $852 above target $900
```

If `cheapest <= target`, you'll get the alert email. Otherwise the alert just sits and waits for prices to drop. Either way, end-to-end is verified.

After this test, set `RUN_ON_START=false` so it doesn't poll on every restart.

### Step 7 — Deploy the frontend to Vercel

1. Vercel → New Project → Import Git Repository → select your repo
2. Configure project:
   - **Framework Preset:** Other
   - **Root Directory:** `frontend`
   - **Build Command:** leave empty (it's static)
   - **Output Directory:** `.` (single dot)
3. Deploy
4. Vercel gives a URL like `aylo-flights.vercel.app` — confirm `/flights` loads the form

### Step 8 — Wire up DNS for ayloai.com

This is two-part: frontend on Vercel at the root, backend on Railway at api.

**For `ayloai.com` → Vercel:**

In Vercel → Project Settings → Domains → Add `ayloai.com` and `www.ayloai.com`. Vercel will show DNS records to add. Two scenarios:

- **If using Cloudflare:** Add an A record for `@` pointing to `76.76.21.21` (Vercel's IP), and a CNAME for `www` pointing to `cname.vercel-dns.com`. Set both to DNS-only (gray cloud).
- **If using another DNS:** Follow Vercel's exact instructions in the Domains panel.

**For `api.ayloai.com` → Railway:**

In Railway → Service → Settings → Networking → Custom Domain → enter `api.ayloai.com`. Railway gives a CNAME target. In DNS, add a CNAME record: `api` → (Railway's target).

Wait for DNS to propagate (a few minutes to an hour). Test:

```bash
curl https://api.ayloai.com/health
```

### Step 9 — Frontend cleanup (the data-aylo work mentioned in section 5)

Edit `frontend/flights/alert.html` and `frontend/flights/manage.html` to add `data-aylo="..."` attributes to the existing hardcoded elements. The script at the bottom of each file will then populate them with real data.

Specifically, find lines like:

```html
<div class="summary-val">San Francisco → Paris</div>
```

And change to:

```html
<div class="summary-val" data-aylo="route">San Francisco → Paris</div>
```

(Keep the placeholder text — it'll be replaced on page load.)

The full list of attributes is in section 5 above. Test by hitting `https://ayloai.com/flights/alert/{some-real-alert-id}` and confirming real data shows.

### Step 10 — End-to-end production test

1. Go to `https://ayloai.com/flights` in a browser
2. Fill out the form: SFO → CDG,ORY, 5–10 nights, 6 months, $900, your email
3. Click Set alert
4. Confirm success message appears
5. Check email for confirmation
6. Click the "cancel this alert" link in the email → should land on `/flights/alert/{id}`
7. Try the cancel flow → should delete the alert
8. Try to load the cancelled alert again → should show "Alert not found"

If all that works: shipped. ✅

### Step 11 — Production polling cadence

The cron is scheduled for 9 AM UTC daily inside the running service. As long as Railway keeps the service running (which it does on hobby plan), polling happens automatically. No additional setup.

To monitor: check Railway logs daily for the first week. Look for `Poll complete in Xs — N email(s) sent`.

---

## 7. How to check that the GitHub repo permissions are right

The user mentioned they made a repo but aren't sure about permissions. Walk through:

```bash
# Check current remote (if any)
git remote -v

# If empty, ask for the repo URL and add it
git remote add origin <URL>

# Test access
git ls-remote origin
# If this works: you have read access.
# If you get a permission error: SSH/PAT issue.

# Try a push test
git checkout -b test-permissions
git push -u origin test-permissions
# If this works: full push access.
# Clean up:
git push origin --delete test-permissions
git checkout main
git branch -D test-permissions
```

If push fails:
- **HTTPS:** GitHub now requires Personal Access Token instead of password. Create one at github.com/settings/tokens with `repo` scope. Use it as the password when prompted.
- **SSH:** Run `ssh-keygen`, add the public key (`~/.ssh/id_ed25519.pub`) to github.com/settings/keys.

---

## 8. Backend API reference (for the frontend wiring)

All endpoints are on the backend (`https://api.ayloai.com` in production, `http://localhost:3000` for local dev).

### POST `/alerts`
Create a new alert. Sends a confirmation email asynchronously.

Request body:
```json
{
  "email": "user@example.com",
  "origin": "SFO",
  "destination": "CDG,ORY",
  "origin_city": "San Francisco",
  "destination_city": "Paris",
  "min_nights": 5,
  "max_nights": 10,
  "travel_window": "6mo",
  "target_price": 900
}
```

Response (201):
```json
{ "id": "abc-123-..." }
```

Error (400): `{ "error": "..." }`

### GET `/alerts/:id`
Fetch alert details + last poll snapshot. Email is masked (`fa•••@example.com`).

Response (200):
```json
{
  "id": "...",
  "email": "fa•••@example.com",
  "origin": "SFO",
  "destination": "CDG,ORY",
  "origin_city": "San Francisco",
  "destination_city": "Paris",
  "min_nights": 5,
  "max_nights": 10,
  "travel_window": "6mo",
  "target_price": 900,
  "created_at": "2026-05-18T...",
  "expires_at": "2026-08-18T...",
  "last_polled_at": "2026-05-19T09:00:00Z",
  "last_best_price": 852,
  "last_best_departure": "2026-10-15",
  "last_best_return": "2026-10-25",
  "active": true
}
```

### DELETE `/alerts/:id`
Cancel/delete an alert.

Response (200): `{ "ok": true }`

### GET `/health`
Health check.

Response (200): `{ "status": "ok", "time": "..." }`

---

## 9. Costs at expected scale

- **Single user (founder testing):** ~13 SearchAPI calls/day = 390/month. Free tier covers it for ~3 months. Then $40/mo Developer plan.
- **First 25 users on ~10 unique routes:** ~130 calls/day = ~4K/month. $40/mo Developer plan.
- **100 users on ~50 routes:** ~650 calls/day = ~20K/month. $100/mo Production plan.

SendGrid free tier (100 emails/day) is enough until you have ~50+ daily-firing alerts.

Railway hobby plan: $5/month for the always-on service + Postgres.

---

## 10. Things explicitly deferred (don't build these yet)

- **Price history chart** on the search page. Original prototype had one. The MVP `index.html` doesn't. Add later via a `/preview` backend endpoint that makes one calendar call and returns price data.
- **Airport autocomplete.** Currently users type IATA codes directly. Add later with a static airports.json + simple suggest UI.
- **Account system / multi-alert dashboard.** Not needed for v1.
- **Expiry reminder email** (2 weeks before expires_at). Backend has the data; just add another cron task.
- **Custom expiry length.** Currently hardcoded to 3 months everywhere.
- **One-way trips.** Currently round-trip only.

---

## 11. First task list for Claude Code

In order of priority:

1. **Verify GitHub repo access** (Step 7 above). Get the user to a state where `git push` works.
2. **Initial commit and push** of all these files.
3. **Set up SendGrid** including domain authentication (most error-prone step, do early to allow DNS propagation time).
4. **Set up Railway with Postgres**, deploy backend, run schema.sql.
5. **Smoke test backend** with curl (Step 5).
6. **Set up Vercel**, deploy frontend.
7. **Add `data-aylo` attributes** to alert.html and manage.html (Step 9).
8. **Configure DNS** for ayloai.com → Vercel and api.ayloai.com → Railway.
9. **End-to-end test** (Step 10).
10. Confirm with user.

If you hit issues at any step, debug live — read logs, check DNS propagation with `dig`, etc. Don't push past a failing step.
