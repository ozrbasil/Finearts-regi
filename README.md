# Fine Arts Registration

Team registration for Fine Arts competitions. Data is stored in MongoDB.

## 1. Set up MongoDB Atlas
1. Create a free cluster at https://cloud.mongodb.com.
2. Under Database Access, create a database user and a password.
3. Under Network Access, allow your IP address. For Vercel, allow `0.0.0.0/0`.
4. Click Connect > Drivers and copy the connection string.

## 2. Run on your computer
```bash
npm install
cp .env.example .env    # then edit .env and paste your connection string
npm start
```
Open http://localhost:3000

## 3. Upload to GitHub
```bash
git init
git add .
git commit -m "Fine Arts registration"
git branch -M main
git remote add origin https://github.com/YOUR-USER/YOUR-REPO.git
git push -u origin main
```
`.env` is excluded by `.gitignore`, so your database password is not uploaded.

## 4. Deploy on Vercel
1. In Vercel, click Add New > Project and import the GitHub repository.
2. Under Environment Variables, add `MONGODB_URI`. `MONGODB_DB` is optional and defaults to `fine_arts`.
3. Click Deploy and open the `.vercel.app` address.

## Default logins
The starting team logins and the admin password are in `public/index.html`. Change team logins in the Teams page after the first start.
