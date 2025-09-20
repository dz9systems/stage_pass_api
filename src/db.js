const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const DATA_FILE = path.join(DATA_DIR, "db.json");

async function ensureDataFileExists() {
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.access(DATA_FILE, fs.constants.F_OK);
  } catch (_) {
    const initial = { theaters: {} };
    await fsp.writeFile(DATA_FILE, JSON.stringify(initial, null, 2));
  }
}

async function readAll() {
  await ensureDataFileExists();
  const raw = await fsp.readFile(DATA_FILE, "utf8");
  try {
    const parsed = JSON.parse(raw || "{}");
    if (!parsed.theaters || typeof parsed.theaters !== "object") {
      parsed.theaters = {};
    }
    return parsed;
  } catch (e) {
    return { theaters: {} };
  }
}

async function writeAll(db) {
  await ensureDataFileExists();
  await fsp.writeFile(DATA_FILE, JSON.stringify(db, null, 2));
}

async function upsertTheater(theater) {
  const db = await readAll();
  db.theaters[theater.id] = theater;
  await writeAll(db);
  return theater;
}

async function getTheaterById(theaterId) {
  const db = await readAll();
  return db.theaters[theaterId] || null;
}

async function getAllTheaters() {
  const db = await readAll();
  return Object.values(db.theaters);
}

module.exports = {
  readAll,
  writeAll,
  upsertTheater,
  getTheaterById,
  getAllTheaters,
};



