const fs = require("fs");
const path = require("path");
const DB_PATH = path.join(__dirname, "database.json");

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({}));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function getUser(guildId, userId) {
  const db = loadDB();
  if (!db[guildId]) db[guildId] = {};
  if (!db[guildId][userId]) {
    db[guildId][userId] = {
      warns: [],
      mutes: [],
      bans: [],
      messageCount: 0,
      joinDate: null,
    };
    saveDB(db);
  }
  return db[guildId][userId];
}

function saveUser(guildId, userId, userData) {
  const db = loadDB();
  if (!db[guildId]) db[guildId] = {};
  db[guildId][userId] = userData;
  saveDB(db);
}

function addWarn(guildId, userId, reason, moderatorId) {
  const user = getUser(guildId, userId);
  user.warns.push({ reason, moderatorId, date: new Date().toISOString() });
  saveUser(guildId, userId, user);
  return user.warns.length;
}

function addMute(guildId, userId, reason, moderatorId, type) {
  const user = getUser(guildId, userId);
  user.mutes.push({
    reason,
    moderatorId,
    type,
    date: new Date().toISOString(),
  });
  saveUser(guildId, userId, user);
}

function addBan(guildId, userId, reason, moderatorId) {
  const user = getUser(guildId, userId);
  user.bans.push({ reason, moderatorId, date: new Date().toISOString() });
  saveUser(guildId, userId, user);
}

function incrementMessages(guildId, userId) {
  const user = getUser(guildId, userId);
  user.messageCount += 1;
  saveUser(guildId, userId, user);
}

function setJoinDate(guildId, userId, date) {
  const user = getUser(guildId, userId);
  if (!user.joinDate) {
    user.joinDate = date;
    saveUser(guildId, userId, user);
  }
}

function getAllowedRoles(guildId) {
  const db = loadDB();
  if (!db[`roles_${guildId}`] || db[`roles_${guildId}`].length === 0) {
    db[`roles_${guildId}`] = ["1483121682695590069"];
    saveDB(db);
  }
  // ✅ always make sure owner role is in the list
  if (!db[`roles_${guildId}`].includes("1483121682695590069")) {
    db[`roles_${guildId}`].unshift("1483121682695590069");
    saveDB(db);
  }
  return db[`roles_${guildId}`];
}

function saveAllowedRoles(guildId, roles) {
  const db = loadDB();
  db[`roles_${guildId}`] = roles;
  saveDB(db);
}

module.exports = {
  getUser,
  saveUser,
  addWarn,
  addMute,
  addBan,
  incrementMessages,
  setJoinDate,
  getAllowedRoles,
  saveAllowedRoles,
};
