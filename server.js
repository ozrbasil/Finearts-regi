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

async function
