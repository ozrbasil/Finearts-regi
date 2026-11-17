# Fine Arts Registration

Node/Express server + MongoDB, serving the registration site from `public/`.

```
├── public/
│   ├── index.html   # page markup and styles
│   └── app.js       # front-end logic (calls the API)
├── server.js        # API, login, MongoDB access
├── package.json
├── render.yaml      # hosting blueprint (Render)
├── .env.example     # required settings
└── .github/workflows/ci.yml
```

## 1. Create the database (MongoDB Atlas)

1. Create a free cluster at cloud.mongodb.com.
2. Under **Database Access**, add a user with a strong password.
3. Under **Network Access**, allow access from `0.0.0.0/0` (Render's IPs change).
4. Click **Connect → Drivers** and copy the connection string into `MONGODB_URI`.

## 2. Put it on GitHub

```bash
git init
git add .
git commit -m "Fine Arts Registration"
git branch -M main
git remote add origin https://github.com/<you>/fine-arts-registration.git
git push -u origin main
```

Never commit `.env`. It is already listed in `.gitignore`.

## 3. Run locally

```bash
cp .env.example .env     # fill in the values
npm install
npm run dev              # http://localhost:3000
```

## 4. Deploy (Render, auto-deploys on every push to `main`)

1. In Render, choose **New → Blueprint** and select this GitHub repo. Render reads `render.yaml`.
2. Enter the secret values when prompted: `MONGODB_URI`, `ADMIN_PASSWORD`, and optionally `TEAM1_PASSWORD` to `TEAM4_PASSWORD`. `JWT_SECRET` is generated automatically.
3. Open the service URL and sign in as Admin (leave username blank).

GitHub Pages cannot run this app because it only serves static files and cannot hold a database connection. Render, Railway or Fly.io can run it directly from the same repo.

## Logins

- **Admin:** leave username blank, password = `ADMIN_PASSWORD`.
- **Teams:** usernames `artcrew_01`, `stagevibe_02`, `rhythm_03`, `canvas_04`. Set passwords with the `TEAMn_PASSWORD` variables, or in the admin **Teams** page. Passwords are stored as bcrypt hashes and cannot be viewed afterwards, only replaced.

## Changes from the original single-file version

- Passwords and the admin password are no longer in the page source. Team passwords are hashed.
- Teams only receive their own registrations from the server, not the whole dataset.
- Data updates every 4 seconds instead of live socket sync.
- Downloads are created in the browser, so they no longer depend on Claude's runtime.
