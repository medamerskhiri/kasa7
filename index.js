require("dotenv").config();
const { Client, GatewayIntentBits, AuditLogEvent, EmbedBuilder } = require("discord.js");

console.log("Starting bot...");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration, // needed for ban/kick audit logs
  ],
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]/g, "")
    .replace(/(.)\1+/g, "$1");
}

function getForwardedContent(message) {
  return message.messageSnapshots
    ? [...message.messageSnapshots.values()]
        .map((s) => s.content?.toLowerCase() || "")
        .join(" ")
    : "";
}

function timestamp() {
  return `<t:${Math.floor(Date.now() / 1000)}:T>`;
}

// ─── Logger ───────────────────────────────────────────────────────────────────

const LOG_CHANNEL_NAME = "📊・brew-logs";

function getLogChannel(guild) {
  return guild.channels.cache.find((ch) => ch.name === LOG_CHANNEL_NAME) || null;
}

async function sendLog(guild, { color, emoji, title, fields, footer }) {
  const channel = getLogChannel(guild);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${emoji}  ${title}`)
    .addFields(fields)
    .setTimestamp();

  if (footer) embed.setFooter({ text: footer });

  channel.send({ embeds: [embed] }).catch(() => {});
}

// Color palette for log types
const Colors = {
  join:    "#57F287",
  leave:   "#ED4245",
  rename:  "#FEE75C",
  ban:     "#FF0000",
  kick:    "#E67E22",
  mute:    "#9B59B6",
  delete:  "#E74C3C",
  edit:    "#3498DB",
  spam:    "#FF6B35",
  badword: "#C0392B",
  bulk:    "#95A5A6",
};

// ─── Config ──────────────────────────────────────────────────────────────────

const OWNER_ROLE_ID = "1490808421916737648";
const ALLOWED_ROLES = [OWNER_ROLE_ID];

const features = {
  badwords: true,
  spam:     true,
  triggers: true,
  welcome:  true,
  mentions: true,
  logs:     true,  // toggle logs on/off
};

// ─── Spam Detection ──────────────────────────────────────────────────────────

const spamHistory = new Map();
const SPAM_WINDOW  = 10 * 1000;
const SPAM_LIMIT   = 5;
const REPEAT_LIMIT = 3;
const MENTION_LIMIT = 3;

setInterval(() => {
  const now = Date.now();
  for (const [userId, history] of spamHistory.entries()) {
    const recent = history.filter((m) => now - m.time < SPAM_WINDOW);
    if (recent.length === 0) spamHistory.delete(userId);
    else spamHistory.set(userId, recent);
  }
}, 60 * 1000);

function checkSpam(userId, normalizedContent, message) {
  const now = Date.now();
  if (!spamHistory.has(userId)) spamHistory.set(userId, []);
  const history = spamHistory.get(userId);
  history.push({
    content: normalizedContent,
    time: now,
    message,
    mentions: message.mentions.users.size,
  });
  const recent = history.filter((m) => now - m.time < SPAM_WINDOW);
  spamHistory.set(userId, recent);

  if (recent.length > SPAM_LIMIT) return true;
  if (recent.filter((m) => m.content === normalizedContent).length > REPEAT_LIMIT) return true;
  if (features.mentions && recent.reduce((sum, m) => sum + m.mentions, 0) > MENTION_LIMIT) return true;
  return false;
}

// ─── Bad Word Detection ───────────────────────────────────────────────────────

const userMessageHistory = new Map();
const HISTORY_WINDOW = 10 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [userId, history] of userMessageHistory.entries()) {
    const recent = history.filter((m) => now - m.time < HISTORY_WINDOW);
    if (recent.length === 0) userMessageHistory.delete(userId);
    else userMessageHistory.set(userId, recent);
  }
}, 60 * 1000);

const badWords = [
  "zebi", "zeb", "زب", "zbi", "zb", "zk", "zab", "zby", "zaby", "zeby",
  "3asba", "3siba", "عصب", "97ayba", "9o7b", "عصبة", "3asb", "3sb", "asba",
  "nik", "niq", "نيك", "niek", "nayak", "nayk", "nyk", "neyek", "نايك", "nayek", "naik",
  "manyouk", "tnaket", "monaka", "mounaka", "kaboul", "nek", "sorm", "سرم",
  "zok", "زك", "zokek", "omk", "أمك", "omek", "omou", "امك", "امو", "أمو",
  "zabour", "زبور", "zbar", "زبر", "9a7ba", "قحب", "97iba", "قحيب",
  "9a7bet", "قحبا", "97ab", "قحاب", "9a7boun", "قحبون", "9a7bt",
  "suck ma dick", "mibon", "wabna", "wapna", "wbna", "wpna", "ميبون", "مبن",
  "ميبن", "مبون", "وبن", "miboun", "mipoun", "mipon", "y3aseb", "3asabet",
  "termtek", "ترم", "termtec", "termteq", "termtk", "termtc", "termtq",
  "terma", "ba3bes", "بعبس", "kos", "كس", "بعباس", "بعبص", "بعباص", "ba3bas",
  "bazoul", "بزول", "بزازل", "bzazel", "bzoul", "bazol", "bezoul", "bezol",
];

const emojiWords = ["🖕"];

function getRecentMessages(userId, newMessage) {
  const now = Date.now();
  if (!userMessageHistory.has(userId)) userMessageHistory.set(userId, []);
  const history = userMessageHistory.get(userId);
  const forwardedContent = getForwardedContent(newMessage);
  const fullContent = newMessage.content.toLowerCase() + " " + forwardedContent;
  history.push({ message: newMessage, content: fullContent, time: now });
  const recent = history.filter((m) => now - m.time < HISTORY_WINDOW);
  userMessageHistory.set(userId, recent);
  return recent;
}

function isBadContent(content, userId) {
  const normalized = normalize(content);
  const combined = normalize(
    userMessageHistory.get(userId)?.map((m) => m.content).join("") || ""
  );
  return (
    badWords.some((w) => normalized.includes(w) || combined.includes(w)) ||
    emojiWords.some((e) => content.includes(e))
  );
}

// ─── Permissions ──────────────────────────────────────────────────────────────

function hasPermission(member) {
  return ALLOWED_ROLES.some((id) => member.roles.cache.has(id));
}

// ─── Triggers ─────────────────────────────────────────────────────────────────

const triggers = [
  { words: ["hello", "hey", "hi", "salam", "ahla"], reply: "ahla!" },
  { words: ["bye", "ciao", "bay", "nemchi", "ala5i", "3ala5ir"], reply: "besslema!" },
];

// ─── Message Handler ──────────────────────────────────────────────────────────

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();
  const forwardedContent = getForwardedContent(message);
  const allContent = content + " " + forwardedContent;
  const normalizedContent = normalize(allContent);
  const recentMessages = getRecentMessages(message.author.id, message);

  // 1. !toggle command
  if (content.startsWith("!toggle")) {
    if (!hasPermission(message.member)) {
      message.reply("ma3andekch permission !").then((msg) => setTimeout(() => msg.delete(), 3000));
      return;
    }
    const feature = content.split(" ")[1];
    if (!feature || !Object.prototype.hasOwnProperty.call(features, feature)) {
      message.reply(
        `features available: \`badwords\`, \`spam\`, \`triggers\`, \`welcome\`, \`mentions\`, \`logs\`\n` +
        `current status:\n` +
        Object.entries(features).map(([k, v]) => `• **${k}**: ${v ? "🟢 on" : "🔴 off"}`).join("\n")
      );
      return;
    }
    features[feature] = !features[feature];
    message.reply(`✅ **${feature}** is now ${features[feature] ? "🟢 on" : "🔴 off"}`);
    return;
  }

  // 2. Bad word check
  if (features.badwords && isBadContent(allContent, message.author.id)) {
    recentMessages.forEach((m) => m.message.delete().catch(() => {}));
    userMessageHistory.set(message.author.id, []);
    message.channel
      .send(`${message.author}, yezi bla sabben we klam zayed , takel ban rak .`)
      .then((msg) => setTimeout(() => msg.delete(), 5000));

    if (features.logs) {
      sendLog(message.guild, {
        color: Colors.badword,
        emoji: "🤬",
        title: "Bad Word Detected",
        fields: [
          { name: "User",    value: `${message.author} (${message.author.tag})`, inline: true },
          { name: "Channel", value: `${message.channel}`, inline: true },
          { name: "Content", value: `\`\`\`${message.content.slice(0, 300)}\`\`\`` },
          { name: "Time",    value: timestamp(), inline: true },
        ],
        footer: "Messages deleted automatically",
      });
    }
    return;
  }

  // 3. Spam check
  if (features.spam) {
    const isSpam = checkSpam(message.author.id, normalizedContent, message);
    if (isSpam) {
      const recentSpam = spamHistory.get(message.author.id) || [];
      recentSpam.slice(1).forEach((m) => m.message.delete().catch(() => {}));
      spamHistory.set(message.author.id, []);
      userMessageHistory.set(message.author.id, []);
      message.channel
        .send(`${message.author}, yezzi bla spam , takel ban rak .`)
        .then((msg) => setTimeout(() => msg.delete(), 5000));

      if (features.logs) {
        sendLog(message.guild, {
          color: Colors.spam,
          emoji: "🚨",
          title: "Spam Detected",
          fields: [
            { name: "User",         value: `${message.author} (${message.author.tag})`, inline: true },
            { name: "Channel",      value: `${message.channel}`, inline: true },
            { name: "Last Message", value: `\`\`\`${message.content.slice(0, 300)}\`\`\`` },
            { name: "Time",         value: timestamp(), inline: true },
          ],
          footer: "Spam messages deleted automatically",
        });
      }
      return;
    }
  }

  // 4. !fassa5 (bulk delete)
  if (content === "!fassa5" || content.startsWith("!fassa5 ")) {
    if (!hasPermission(message.member)) {
      message.reply("ma3andekch permission !").then((msg) => setTimeout(() => msg.delete(), 3000));
      return;
    }
    const args = content.split(" ");
    const amount = parseInt(args[1]) || 100;
    if (amount < 1 || amount > 100) {
      message.reply("el nombre lazem ykon bin 1 w 100 .");
      return;
    }
    message.channel.bulkDelete(amount, true).then((deleted) => {
      const skipped = amount - deleted.size;
      let reply = `✅ hani fassa5t ${deleted.size} messages .`;
      if (skipped > 0)
        reply += ` (${skipped} messages skipped — aktar men 14 days w ma9darch ndelete.)`;
      message.channel.send(reply).then((msg) => setTimeout(() => msg.delete(), 4000));

      if (features.logs) {
        sendLog(message.guild, {
          color: Colors.bulk,
          emoji: "🗑️",
          title: "Bulk Delete (!fassa5)",
          fields: [
            { name: "Mod",             value: `${message.author} (${message.author.tag})`, inline: true },
            { name: "Channel",         value: `${message.channel}`, inline: true },
            { name: "Deleted",         value: `${deleted.size} messages`, inline: true },
            { name: "Skipped (>14d)", value: `${skipped}`, inline: true },
            { name: "Time",            value: timestamp(), inline: true },
          ],
        });
      }
    }).catch((err) => console.error(err));
    return;
  }

  // 5. Keyword triggers
  if (features.triggers) {
    const match = triggers.find((t) => t.words.some((w) => content.includes(w)));
    if (match) message.reply(match.reply);
  }
});

// ─── Message Edit Handler ─────────────────────────────────────────────────────

client.on("messageUpdate", (oldMessage, newMessage) => {
  if (newMessage.author?.bot) return;
  if (!newMessage.content) return;

  // Log all edits (including clean ones)
  if (features.logs && oldMessage.content && oldMessage.content !== newMessage.content) {
    sendLog(newMessage.guild, {
      color: Colors.edit,
      emoji: "✏️",
      title: "Message Edited",
      fields: [
        { name: "User",    value: `${newMessage.author} (${newMessage.author.tag})`, inline: true },
        { name: "Channel", value: `${newMessage.channel}`, inline: true },
        { name: "Before",  value: `\`\`\`${(oldMessage.content || "(empty)").slice(0, 300)}\`\`\`` },
        { name: "After",   value: `\`\`\`${newMessage.content.slice(0, 300)}\`\`\`` },
        { name: "Jump",    value: `[Go to message](${newMessage.url})` },
        { name: "Time",    value: timestamp(), inline: true },
      ],
    });
  }

  if (!features.badwords) return;

  const content = newMessage.content.toLowerCase();
  const forwardedContent = getForwardedContent(newMessage);
  const allContent = content + " " + forwardedContent;
  const normalized = normalize(allContent);

  if (
    badWords.some((w) => normalized.includes(w)) ||
    emojiWords.some((e) => allContent.includes(e))
  ) {
    newMessage.delete().catch(() => {});
    newMessage.channel
      .send(`${newMessage.author}, fe9t bik ta3mel fi edit , arka7 takel ban rak .`)
      .then((msg) => setTimeout(() => msg.delete(), 5000));

    if (features.logs) {
      sendLog(newMessage.guild, {
        color: Colors.badword,
        emoji: "🤬",
        title: "Bad Word in Edit — Deleted",
        fields: [
          { name: "User",           value: `${newMessage.author} (${newMessage.author.tag})`, inline: true },
          { name: "Channel",        value: `${newMessage.channel}`, inline: true },
          { name: "Edited Content", value: `\`\`\`${newMessage.content.slice(0, 300)}\`\`\`` },
          { name: "Time",           value: timestamp(), inline: true },
        ],
        footer: "Message deleted automatically",
      });
    }
  }
});

// ─── Message Delete Handler ───────────────────────────────────────────────────

client.on("messageDelete", async (message) => {
  if (message.author?.bot) return;
  if (!features.logs) return;

  // Small delay so the audit log has time to populate
  await new Promise((r) => setTimeout(r, 1000));

  let deletedBy = "Self-deleted or unknown";
  try {
    const auditLogs = await message.guild.fetchAuditLogs({
      type: AuditLogEvent.MessageDelete,
      limit: 1,
    });
    const entry = auditLogs.entries.first();
    if (
      entry &&
      entry.target?.id === message.author?.id &&
      Date.now() - entry.createdTimestamp < 5000
    ) {
      deletedBy = `${entry.executor} (${entry.executor.tag})`;
    }
  } catch {}

  sendLog(message.guild, {
    color: Colors.delete,
    emoji: "🗑️",
    title: "Message Deleted",
    fields: [
      { name: "Author",     value: `${message.author} (${message.author?.tag || "?"})`, inline: true },
      { name: "Channel",    value: `${message.channel}`, inline: true },
      { name: "Deleted By", value: deletedBy, inline: true },
      { name: "Content",    value: `\`\`\`${(message.content || "(no text / attachment)").slice(0, 300)}\`\`\`` },
      { name: "Time",       value: timestamp(), inline: true },
    ],
  });
});

// ─── Member Join ──────────────────────────────────────────────────────────────

client.on("guildMemberAdd", (member) => {
  // Welcome message
  if (features.welcome) {
    const channel = member.guild.channels.cache.find(
      (ch) => ch.name === "☕・𝗳𝗶𝗿𝘀𝘁-𝘀𝗶𝗽-𝘄𝗲𝗹𝗰𝗼𝗺𝗲"
    );
    if (channel) {
      channel.send(
        `☕ 🇹🇳 𝐖𝐞𝐥𝐜𝐨𝐦𝐞 𝐭𝐨 𝐂𝐨𝐟𝐟𝐞𝐞 𝐁𝐞𝐚𝐧\n\n` +
        `𝐀𝐡𝐥𝐚 𝐰 𝐬𝐚𝐡𝐥𝐚 ${member.user.username}! 👋\n` +
        `𝐓𝐟𝐚𝟒𝐞𝐥, 𝟕𝐚𝟒𝐞𝐫 𝟗𝐚𝐡𝐰𝐭𝐞𝐤 𝐰 𝐞𝐫𝐤𝐞𝐜𝐡 𝐦𝟑𝐚𝐧𝐚 ☕\n\n` +
        `💬  𝐂𝐡𝐚𝐭𝐭𝐢𝐧𝐠 ・ 🎮 𝐆𝐚𝐦𝐢𝐧𝐠 ・ 🎵 𝐂𝐡𝐢𝐥𝐥\n` +
        `𝐡𝐧𝐚 𝐤𝐨𝐥 𝐜𝐡𝐚𝐲 𝐚𝟕𝐥𝐚 𝐦𝟑𝐚 𝐂𝐨𝐟𝐟𝐞𝐞 😏\n\n` +
        `📜 𝐚𝟗𝐫𝐚 𝐞𝐥 𝐫𝐮𝐥𝐞𝐬 𝐰 𝐞𝐧𝐣𝐨𝐲 𝐲𝐨𝐮𝐫 𝐬𝐭𝐚𝐲!`
      );
    }
    const role = member.guild.roles.cache.find((r) => r.name === "🌱 Fresh Bean");
    if (role) member.roles.add(role).catch((err) => console.error(err));
  }

  // Log
  if (features.logs) {
    sendLog(member.guild, {
      color: Colors.join,
      emoji: "📥",
      title: "Member Joined",
      fields: [
        { name: "User",        value: `${member.user} (${member.user.tag})`, inline: true },
        { name: "Account Age", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: "Member #",    value: `${member.guild.memberCount}`, inline: true },
        { name: "Time",        value: timestamp(), inline: true },
      ],
    });
  }
});

// ─── Member Leave / Kick ──────────────────────────────────────────────────────

client.on("guildMemberRemove", async (member) => {
  if (!features.logs) return;

  await new Promise((r) => setTimeout(r, 1000));

  let reason = "Left the server";
  let actionBy = null;

  try {
    const kickLogs = await member.guild.fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 1 });
    const entry = kickLogs.entries.first();
    if (entry && entry.target?.id === member.id && Date.now() - entry.createdTimestamp < 5000) {
      reason = `Kicked — ${entry.reason || "no reason given"}`;
      actionBy = entry.executor;
    }
  } catch {}

  sendLog(member.guild, {
    color: actionBy ? Colors.kick : Colors.leave,
    emoji: actionBy ? "👢" : "📤",
    title: actionBy ? "Member Kicked" : "Member Left",
    fields: [
      { name: "User",   value: `${member.user.tag} (ID: ${member.user.id})`, inline: true },
      { name: "Reason", value: reason, inline: true },
      ...(actionBy ? [{ name: "By", value: `${actionBy} (${actionBy.tag})`, inline: true }] : []),
      { name: "Time",   value: timestamp(), inline: true },
    ],
  });
});

// ─── Nickname Change ──────────────────────────────────────────────────────────

client.on("guildMemberUpdate", async (oldMember, newMember) => {
  if (!features.logs) return;

  // Nickname change
  const oldNick = oldMember.nickname || oldMember.user.username;
  const newNick = newMember.nickname || newMember.user.username;

  if (oldNick !== newNick) {
    sendLog(newMember.guild, {
      color: Colors.rename,
      emoji: "📝",
      title: "Nickname Changed",
      fields: [
        { name: "User",   value: `${newMember.user} (${newMember.user.tag})`, inline: true },
        { name: "Before", value: oldNick, inline: true },
        { name: "After",  value: newNick, inline: true },
        { name: "Time",   value: timestamp(), inline: true },
      ],
    });
  }

  // Timeout (mute) applied or removed
  const wasTimedOut = !oldMember.communicationDisabledUntil && newMember.communicationDisabledUntil;
  const unTimedOut  = oldMember.communicationDisabledUntil && !newMember.communicationDisabledUntil;

  if (!wasTimedOut && !unTimedOut) return;

  await new Promise((r) => setTimeout(r, 1000));

  let executor = "Unknown";
  let muteReason = "No reason given";

  try {
    const auditLogs = await newMember.guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 1 });
    const entry = auditLogs.entries.first();
    if (entry && entry.target?.id === newMember.id && Date.now() - entry.createdTimestamp < 5000) {
      executor = `${entry.executor} (${entry.executor.tag})`;
      muteReason = entry.reason || muteReason;
    }
  } catch {}

  if (wasTimedOut) {
    sendLog(newMember.guild, {
      color: Colors.mute,
      emoji: "🔇",
      title: "Member Timed Out (Muted)",
      fields: [
        { name: "User",     value: `${newMember.user} (${newMember.user.tag})`, inline: true },
        { name: "Muted By", value: executor, inline: true },
        { name: "Until",    value: `<t:${Math.floor(newMember.communicationDisabledUntil / 1000)}:F>`, inline: true },
        { name: "Reason",   value: muteReason },
        { name: "Time",     value: timestamp(), inline: true },
      ],
    });
  } else {
    sendLog(newMember.guild, {
      color: Colors.join,
      emoji: "🔊",
      title: "Member Timeout Removed",
      fields: [
        { name: "User",       value: `${newMember.user} (${newMember.user.tag})`, inline: true },
        { name: "Removed By", value: executor, inline: true },
        { name: "Time",       value: timestamp(), inline: true },
      ],
    });
  }
});

// ─── Ban ──────────────────────────────────────────────────────────────────────

client.on("guildBanAdd", async (ban) => {
  if (!features.logs) return;

  await new Promise((r) => setTimeout(r, 1000));

  let executor = "Unknown";
  let reason = ban.reason || "No reason given";

  try {
    const auditLogs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanAdd, limit: 1 });
    const entry = auditLogs.entries.first();
    if (entry && entry.target?.id === ban.user.id && Date.now() - entry.createdTimestamp < 5000) {
      executor = `${entry.executor} (${entry.executor.tag})`;
      reason = entry.reason || reason;
    }
  } catch {}

  sendLog(ban.guild, {
    color: Colors.ban,
    emoji: "🔨",
    title: "Member Banned",
    fields: [
      { name: "User",      value: `${ban.user.tag} (ID: ${ban.user.id})`, inline: true },
      { name: "Banned By", value: executor, inline: true },
      { name: "Reason",    value: reason },
      { name: "Time",      value: timestamp(), inline: true },
    ],
  });
});

// ─── Unban ────────────────────────────────────────────────────────────────────

client.on("guildBanRemove", async (ban) => {
  if (!features.logs) return;

  await new Promise((r) => setTimeout(r, 1000));

  let executor = "Unknown";

  try {
    const auditLogs = await ban.guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: 1 });
    const entry = auditLogs.entries.first();
    if (entry && entry.target?.id === ban.user.id && Date.now() - entry.createdTimestamp < 5000) {
      executor = `${entry.executor} (${entry.executor.tag})`;
    }
  } catch {}

  sendLog(ban.guild, {
    color: Colors.join,
    emoji: "✅",
    title: "Member Unbanned",
    fields: [
      { name: "User",        value: `${ban.user.tag} (ID: ${ban.user.id})`, inline: true },
      { name: "Unbanned By", value: executor, inline: true },
      { name: "Time",        value: timestamp(), inline: true },
    ],
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────

client.login(process.env.TOKEN).catch((err) => console.error("Login error:", err));