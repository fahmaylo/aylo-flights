# Aylo Flight Alert

Nonstop flight price alerts. Set a route, dates, and target price — we email you when it drops.

## Repo structure

```
aylo-flights/
  HANDOFF.md     ← Read this. Full context + deployment guide.
  frontend/      ← Static site (deploys to Vercel)
  backend/       ← Node.js API + cron (deploys to Railway)
```

## Quick start

For a comprehensive walkthrough, see [HANDOFF.md](./HANDOFF.md).

### Backend (local)

```bash
cd backend
npm install
cp .env.example .env
# fill in SEARCHAPI_KEY, DATABASE_URL, SENDGRID_API_KEY
psql $DATABASE_URL -f schema.sql
npm start
```

### Frontend (local)

Just open `frontend/flights/index.html` in a browser, or run a simple static server:

```bash
cd frontend
python3 -m http.server 8000
# visit http://localhost:8000/flights/
```

## Production

- Backend: deployed on Railway at `api.ayloai.com`
- Frontend: deployed on Vercel at `ayloai.com/flights`
- Domain: `ayloai.com`

## License

Private — not open source.
