const path = require("path");
const crypto = require("crypto");
const express = require("express");
const { MongoClient } = require("mongodb");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { MONGODB_URI, DB_NAME = "fine_arts", JWT_SECRET, ADMIN_PASSWORD, PORT = 3000 } = process.env;
if (!MONGODB_URI || !JWT_SECRET || !ADMIN_PASSWORD) {
  console.error("Missing MONGODB_URI, JWT_SECRET or ADMIN_PASSWORD. See .env.example.");
  process.exit(1);
}

const MAX_IND = 4;
const SETTINGS_ID = "app";
const DEFAULT_COMPS = [
  { type: "individual", name: "Essay Writing", order: 1 },
  { type: "individual", name: "Poetry Writing", order: 2 },
  { type: "individual", name: "Painting", order: 3 },
  { type: "individual", name: "Short Story Writing", order: 4 },
  { type: "individual", name: "Cartoon Writing", order: 5 },
  { type: "group", name: "Mappillappattu", order: 1 },
];
// Usernames are not secret. Passwords come from TEAMn_PASSWORD env vars, or are set in the admin Teams page.
const DEFAULT_TEAMS = [
  { team: 1, username: "artcrew_01" },
  { team: 2, username: "stagevibe_02" },
  { team: 3, username: "rhythm_03" },
  { team: 4, username: "canvas_04" },
];

let db;
const newId = () => crypto.randomUUID();
const clean = (v) => String(v ?? "").trim();
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest();
const samePassword = (a, b) => crypto.timingSafeEqual(sha(a), sha(b));
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, msg, code = 400) => res.status(code).json({ error: msg });
const strip = ({ _id, passwordHash, ...rest }) => ({ id: _id, ...rest });

function signIn(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "12h" });
}

// requireAuth() = any signed-in user; requireAuth("admin") or requireAuth("team") = that role only.
function requireAuth(role) {
  return (req, res, next) => {
    const h = req.headers.authorization || "";
    try {
      req.user = jwt.verify(h.startsWith("Bearer ") ? h.slice(7) : "", JWT_SECRET);
    } catch {
      return res.status(401).json({ error: "Please sign in again." });
    }
    if (role && req.user.role !== role) return res.status(403).json({ error: "Not allowed." });
    next();
  };
}

// Returns the validated competition names, [] if none were chosen, or null if any name is unknown.
async function pickComps(list, type) {
  const names = [...new Set((Array.isArray(list) ? list : []).map(clean).filter(Boolean))];
  const valid = new Set((await db.collection("competitions").find({ type }).toArray()).map(c => c.name));
  return names.every(n => valid.has(n)) ? names : null;
}

async function nameTaken(name, type, exceptId) {
  const all = await db.collection("competitions").find({ type }).toArray();
  return all.some(c => c._id !== exceptId && c.name.toLowerCase() === name.toLowerCase());
}

async function classNameTaken(name, exceptId) {
  const all = await db.collection("classes").find({}).toArray();
  return all.some(c => c._id !== exceptId && c.name.toLowerCase() === name.toLowerCase());
}

// Accepts an array or a comma-separated string. Returns unique, non-empty years.
function cleanYears(v) {
  const list = Array.isArray(v) ? v : String(v ?? "").split(",");
  return [...new Set(list.map(clean).filter(Boolean))];
}

// Returns { cls, year } only if the class exists and the year is one of its years, otherwise null.
async function pickClass(cls, year) {
  const name = clean(cls), y = clean(year);
  if (!name || !y) return null;
  const doc = await db.collection("classes").findOne({ name, years: y });
  return doc ? { cls: name, year: y } : null;
}

async function getSettings() {
  const doc = await db.collection("settings").findOne({ _id: SETTINGS_ID });
  return {
    editingEnabled: doc?.editingEnabled ?? false,
    registrationOpen: doc?.registrationOpen ?? true,
  };
}

async function checkIndividual(body) {
  const name = clean(body.name);
  if (!name) return { error: "Name is required." };
  const picked = await pickClass(body.cls, body.year);
  if (!picked) return { error: "Choose a valid class and year." };
  const comps = await pickComps(body.comps, "individual");
  if (!comps) return { error: "Choose valid competitions." };
  if (!comps.length) return { error: "Choose at least one competition." };
  if (comps.length > MAX_IND) return { error: "Maximum 4 items per participant." };
  return { value: { name, cls: picked.cls, year: picked.year, comps } };
}

const app = express();
app.use(express.json({ limit: "100kb" }));
app.use((req, _res, next) => { req.body ??= {}; next(); });
app.use(express.static(path.join(__dirname, "public")));

/* ----- Auth ----- */
app.post("/api/login", wrap(async (req, res) => {
  const username = clean(req.body.username);
  const password = String(req.body.password ?? "");
  if (!username) {
    if (samePassword(password, ADMIN_PASSWORD)) return res.json({ token: signIn({ role: "admin" }), role: "admin" });
    return bad(res, "Enter your username.");
  }
  const acct = await db.collection("teams").findOne({ username });
  if (!acct || !(await bcrypt.compare(password, acct.passwordHash))) return bad(res, "Invalid username or password.", 401);
  res.json({
    token: signIn({ role: "team", team: acct.team, username }),
    role: "team", team: acct.team, username,
  });
}));

/* ----- Shared state (teams only see their own registrations) ----- */
app.get("/api/state", requireAuth(), wrap(async (req, res) => {
  const isAdmin = req.user.role === "admin";
  const scope = isAdmin ? {} : { team: req.user.team };
  const [comps, classes, inds, grps, teams, settings] = await Promise.all([
    db.collection("competitions").find({}).toArray(),
    db.collection("classes").find({}).sort({ order: 1 }).toArray(),
    db.collection("individuals").find(scope).sort({ createdAt: 1 }).toArray(),
    db.collection("groups").find(scope).sort({ createdAt: 1 }).toArray(),
    isAdmin ? db.collection("teams").find({}).sort({ team: 1 }).toArray() : [],
    getSettings(),
  ]);
  res.json({
    comps: comps.map(strip),
    classes: classes.map(strip),
    inds: inds.map(strip),
    grps: grps.map(strip),
    teams: teams.map(t => ({ team: t.team, username: t.username })),
    settings,
  });
}));

/* ----- Team: registrations ----- */
app.post("/api/individuals", requireAuth("team"), wrap(async (req, res) => {
  if (!(await getSettings()).registrationOpen) return bad(res, "Registration is stopped by the admin.", 403);
  const r = await checkIndividual(req.body);
  if (r.error) return bad(res, r.error);
  await db.collection("individuals").insertOne({ _id: newId(), team: req.user.team, ...r.value, createdAt: Date.now() });
  res.status(201).json({ ok: true });
}));

app.patch("/api/individuals/:id", requireAuth("team"), wrap(async (req, res) => {
  const col = db.collection("individuals");
  const doc = await col.findOne({ _id: req.params.id, team: req.user.team });
  if (!doc) return bad(res, "Participant not found.", 404);
  if (!(await getSettings()).editingEnabled) return bad(res, "Editing is turned off by the admin.", 403);
  const r = await checkIndividual(req.body);
  if (r.error) return bad(res, r.error);
  await col.updateOne({ _id: doc._id }, { $set: r.value });
  res.json({ ok: true });
}));

app.post("/api/groups", requireAuth("team"), wrap(async (req, res) => {
  if (!(await getSettings()).registrationOpen) return bad(res, "Registration is stopped by the admin.", 403);
  const leader = clean(req.body.leader);
  const leaderClass = await pickClass(req.body.leaderCls, req.body.leaderYear);
  if (!leader || !leaderClass) return bad(res, "Team leader name, class and year are required.");

  const rows = (Array.isArray(req.body.members) ? req.body.members : [])
    .filter(m => clean(m?.name) || clean(m?.cls) || clean(m?.year));
  if (!rows.length) return bad(res, "Add at least one team member.");
  if (rows.length > 50) return bad(res, "Too many members.");
  const members = [];
  for (const m of rows) {
    const name = clean(m?.name);
    const pc = await pickClass(m?.cls, m?.year);
    if (!name || !pc) return bad(res, "Each member needs a name, class and year.");
    members.push({ name, cls: pc.cls, year: pc.year });
  }

  const comps = await pickComps(req.body.comps, "group");
  if (!comps) return bad(res, "Choose valid group competitions.");
  if (!comps.length) return bad(res, "Choose a group competition.");

  // A team may register for each group competition only once.
  const existing = await db.collection("groups").find({ team: req.user.team, comps: { $in: comps } }).toArray();
  if (existing.length) {
    const already = comps.filter(c => existing.some(g => g.comps.includes(c)));
    return bad(res, `Your team is already registered for: ${already.join(", ")}.`, 409);
  }

  await db.collection("groups").insertOne({
    _id: newId(), team: req.user.team,
    leader, leaderCls: leaderClass.cls, leaderYear: leaderClass.year,
    members, comps, createdAt: Date.now(),
  });
  res.status(201).json({ ok: true });
}));

// Editing a group changes the leader's name, class and year, and each member's name, class and year.
// Competitions and the number of members stay as they were registered.
app.patch("/api/groups/:id", requireAuth("team"), wrap(async (req, res) => {
  const col = db.collection("groups");
  const doc = await col.findOne({ _id: req.params.id, team: req.user.team });
  if (!doc) return bad(res, "Group not found.", 404);
  if (!(await getSettings()).editingEnabled) return bad(res, "Editing is turned off by the admin.", 403);

  const leader = clean(req.body.leader);
  const leaderClass = await pickClass(req.body.leaderCls, req.body.leaderYear);
  if (!leader || !leaderClass) return bad(res, "Team leader name, class and year are required.");

  // Existing members must all be sent back (they can be edited, not removed). Extra entries are new members.
  const edits = Array.isArray(req.body.members) ? req.body.members : [];
  if (edits.length < doc.members.length) return bad(res, "Member list does not match the registered group.");
  if (edits.length > 50) return bad(res, "Too many members.");
  const members = [];
  for (let i = 0; i < edits.length; i++) {
    const name = clean(edits[i]?.name);
    const pc = await pickClass(edits[i]?.cls, edits[i]?.year);
    if (!name || !pc) return bad(res, "Each member needs a name, class and year.");
    members.push({ name, cls: pc.cls, year: pc.year });
  }

  await col.updateOne({ _id: doc._id }, {
    $set: { leader, leaderCls: leaderClass.cls, leaderYear: leaderClass.year, members },
  });
  res.json({ ok: true });
}));

// Removing a registration is allowed only while the admin has editing turned on, and only for the team's own entries.
app.delete("/api/individuals/:id", requireAuth("team"), wrap(async (req, res) => {
  if (!(await getSettings()).editingEnabled) return bad(res, "Editing is turned off by the admin.", 403);
  const r = await db.collection("individuals").deleteOne({ _id: req.params.id, team: req.user.team });
  if (!r.deletedCount) return bad(res, "Participant not found.", 404);
  res.json({ ok: true });
}));

app.delete("/api/groups/:id", requireAuth("team"), wrap(async (req, res) => {
  if (!(await getSettings()).editingEnabled) return bad(res, "Editing is turned off by the admin.", 403);
  const r = await db.collection("groups").deleteOne({ _id: req.params.id, team: req.user.team });
  if (!r.deletedCount) return bad(res, "Group not found.", 404);
  res.json({ ok: true });
}));

/* ----- Admin: controls ----- */
app.patch("/api/admin/settings", requireAuth("admin"), wrap(async (req, res) => {
  const $set = {};
  if (typeof req.body.editingEnabled === "boolean") $set.editingEnabled = req.body.editingEnabled;
  if (typeof req.body.registrationOpen === "boolean") $set.registrationOpen = req.body.registrationOpen;
  if (!Object.keys($set).length) return bad(res, "Nothing to change.");
  await db.collection("settings").updateOne({ _id: SETTINGS_ID }, { $set }, { upsert: true });
  res.json({ ok: true });
}));

app.post("/api/admin/reset", requireAuth("admin"), wrap(async (req, res) => {
  const [i, g] = await Promise.all([
    db.collection("individuals").deleteMany({}),
    db.collection("groups").deleteMany({}),
  ]);
  res.json({ ok: true, removed: i.deletedCount + g.deletedCount });
}));

/* ----- Admin: competitions ----- */
app.post("/api/competitions", requireAuth("admin"), wrap(async (req, res) => {
  const name = clean(req.body.name);
  const type = req.body.type === "group" ? "group" : "individual";
  if (!name) return bad(res, "Name is required.");
  if (await nameTaken(name, type, null)) return bad(res, "That competition already exists.", 409);
  const order = (await db.collection("competitions").countDocuments({ type })) + 1;
  await db.collection("competitions").insertOne({ _id: newId(), name, type, order, createdAt: Date.now() });
  res.status(201).json({ ok: true });
}));

app.patch("/api/competitions/:id", requireAuth("admin"), wrap(async (req, res) => {
  const comps = db.collection("competitions");
  const doc = await comps.findOne({ _id: req.params.id });
  if (!doc) return bad(res, "Competition not found.", 404);
  const name = clean(req.body.name);
  if (!name) return bad(res, "Name cannot be empty.");
  if (await nameTaken(name, doc.type, doc._id)) return bad(res, "That competition already exists.", 409);
  await comps.updateOne({ _id: doc._id }, { $set: { name } });
  res.json({ ok: true });
}));

app.delete("/api/competitions/:id", requireAuth("admin"), wrap(async (req, res) => {
  await db.collection("competitions").deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));

/* ----- Admin: classes and years ----- */
app.post("/api/classes", requireAuth("admin"), wrap(async (req, res) => {
  const name = clean(req.body.name), years = cleanYears(req.body.years);
  if (!name) return bad(res, "Class name is required.");
  if (!years.length) return bad(res, "Add at least one year.");
  if (await classNameTaken(name, null)) return bad(res, "That class already exists.", 409);
  const order = (await db.collection("classes").countDocuments({})) + 1;
  await db.collection("classes").insertOne({ _id: newId(), name, years, order, createdAt: Date.now() });
  res.status(201).json({ ok: true });
}));

app.patch("/api/classes/:id", requireAuth("admin"), wrap(async (req, res) => {
  const col = db.collection("classes");
  const doc = await col.findOne({ _id: req.params.id });
  if (!doc) return bad(res, "Class not found.", 404);
  const name = clean(req.body.name), years = cleanYears(req.body.years);
  if (!name) return bad(res, "Class name cannot be empty.");
  if (!years.length) return bad(res, "Add at least one year.");
  if (await classNameTaken(name, doc._id)) return bad(res, "That class already exists.", 409);
  await col.updateOne({ _id: doc._id }, { $set: { name, years } });
  res.json({ ok: true });
}));

app.delete("/api/classes/:id", requireAuth("admin"), wrap(async (req, res) => {
  const r = await db.collection("classes").deleteOne({ _id: req.params.id });
  if (!r.deletedCount) return bad(res, "Class not found.", 404);
  res.json({ ok: true });
}));

/* ----- Admin: team logins ----- */
app.patch("/api/teams/:n", requireAuth("admin"), wrap(async (req, res) => {
  const n = Number(req.params.n);
  if (!DEFAULT_TEAMS.some(t => t.team === n)) return bad(res, "Team not found.", 404);
  const username = clean(req.body.username);
  const password = String(req.body.password ?? "");
  if (!/^[A-Za-z0-9_]{3,}$/.test(username)) return bad(res, "Username: letters, numbers or _ (min 3)");
  if (password && password.length < 4) return bad(res, "Password must be at least 4 characters");

  const teams = db.collection("teams");
  const existing = await teams.findOne({ _id: `team${n}` });
  if (!existing && !password) return bad(res, "Set a password for this team.");

  const update = { team: n, username };
  if (password) update.passwordHash = await bcrypt.hash(password, 12);
  try {
    await teams.updateOne({ _id: `team${n}` }, { $set: update }, { upsert: true });
  } catch (err) {
    if (err.code === 11000) return bad(res, "That username is already used.", 409);
    throw err;
  }
  res.json({ ok: true });
}));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Could not save. Please try again." });
});

/* ----- Startup: connect, seed missing defaults, listen ----- */
async function seed() {
  const comps = db.collection("competitions");
  if ((await comps.estimatedDocumentCount()) === 0) {
    await comps.insertMany(DEFAULT_COMPS.map(c => ({ _id: newId(), ...c, createdAt: Date.now() })));
  }
  await db.collection("settings").updateOne(
    { _id: SETTINGS_ID },
    { $setOnInsert: { editingEnabled: false, registrationOpen: true } },
    { upsert: true }
  );
  const teams = db.collection("teams");
  await teams.createIndex({ username: 1 }, { unique: true });
  for (const t of DEFAULT_TEAMS) {
    const id = `team${t.team}`;
    if (await teams.findOne({ _id: id })) continue;
    const envPw = process.env[`TEAM${t.team}_PASSWORD`];
    if (!envPw) console.warn(`TEAM${t.team}_PASSWORD not set. Set ${t.username}'s password from the admin Teams page.`);
    const passwordHash = await bcrypt.hash(envPw || crypto.randomBytes(16).toString("hex"), 12);
    await teams.insertOne({ _id: id, team: t.team, username: t.username, passwordHash });
  }
}

(async () => {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  db = client.db(DB_NAME);
  await seed();
  app.listen(PORT, () => console.log(`Fine Arts Registration listening on port ${PORT}`));
})().catch((err) => {
  console.error("Startup failed:", err);
  process.exit(1);
});
