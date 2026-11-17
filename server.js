require("dotenv").config();
const path = require("path");
const express = require("express");
const { MongoClient } = require("mongodb");

// Only these collections can be read or written through the API.
const COLLECTIONS = new Set(["competitions", "individuals", "groups", "teams"]);

// One MongoDB connection, created on the first request and reused after that.
// Vercel may start a new instance at any time, so this connects lazily.
let dbPromise = null;
function getDb() {
  if (!dbPromise) {
    if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
    dbPromise = new MongoClient(process.env.MONGODB_URI)
      .connect()
      .then((client) => client.db(process.env.MONGODB_DB || "fine_arts"))
      .catch((err) => {
        dbPromise = null; // allow a retry on the next request
        throw err;
      });
  }
  return dbPromise;
}

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

// Attach the database to every /api request.
app.use("/api", async (req, res, next) => {
  try {
    req.db = await getDb();
    next();
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Database connection failed" });
  }
});

const checkName = (req, res, next) =>
  COLLECTIONS.has(req.params.name) ? next() : res.status(404).json({ error: "Unknown collection" });

app.get("/api/:name", checkName, async (req, res) => {
  const docs = await req.db.collection(req.params.name).find({}).toArray();
  res.json(docs.map(({ _id, ...rest }) => ({ id: _id, ...rest })));
});

app.put("/api/:name/:id", checkName, async (req, res) => {
  const { id, _id, ...body } = req.body || {};
  await req.db.collection(req.params.name).replaceOne(
    { _id: req.params.id },
    { _id: req.params.id, ...body },
    { upsert: true }
  );
  res.json({ ok: true });
});

app.patch("/api/:name/:id", checkName, async (req, res) => {
  const { id, _id, ...body } = req.body || {};
  await req.db.collection(req.params.name).updateOne({ _id: req.params.id }, { $set: body });
  res.json({ ok: true });
});

app.delete("/api/:name/:id", checkName, async (req, res) => {
  await req.db.collection(req.params.name).deleteOne({ _id: req.params.id });
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Server error" });
});

// Vercel imports this app. Running "npm start" locally starts a server.
module.exports = app;
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log("Open http://localhost:" + port));
}
