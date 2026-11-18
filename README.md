# Fine Arts Registration

Node/Express server + MongoDB. Two separate logins:

| Page | URL | Login |
|---|---|---|
| User login | `/` | Team username + password |
| User panel | `/user.html` | Registration and My Dashboard |
| Admin login | `/admin.html` | Password only (`ADMIN_PASSWORD`) |
| Admin panel | `/admin-panel.html` | Competitions, Controls, Registrations, Teams |

```
public/        favicon.png, style.css, common.js, index.html, user.html, user.js,
               admin.html, admin-panel.html, admin-panel.js
server.js      API, login, MongoDB access
render.yaml    Render deployment blueprint
.env.example   required settings (copy to .env for local runs)
```

## Setup

1. **MongoDB Atlas:** create a free cluster, add a database user, allow network access from `0.0.0.0/0`, and copy the connection string into `MONGODB_URI`.
2. **Local run:** `cp .env.example .env`, fill in the values, then `npm install` and `npm run dev`. Open http://localhost:3000.
3. **GitHub:** push the folder to a repo. Never commit `.env`.
4. **Render:** New → Blueprint → select the repo. Enter `MONGODB_URI` and `ADMIN_PASSWORD`. `JWT_SECRET` is generated automatically. Every push to `main` redeploys.

GitHub Pages cannot run this app because it has no server to reach MongoDB.

## Logins

- Team passwords come from `TEAM1_PASSWORD` to `TEAM4_PASSWORD` the first time the database is created, or from the admin Teams page later. Stored passwords are bcrypt hashes and cannot be viewed, only replaced.
- Sessions last 12 hours and are kept per browser tab.
