require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const {
  getUser,
  addWarn,
  addMute,
  addBan,
  incrementMessages,
  setJoinDate,
  getAllowedRoles,
  saveAllowedRoles,
} = require("./db");

console.log("Starting bot...");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
});

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]/g, "")
    .replace(/(.)\1+/g, "$1");
}

function parseRoomName(messageContent) {
  const withQuotes = messageContent.match(/"(.+?)"/);
  if (withQuotes) return withQuotes[1].trim().toLowerCase();
  const withoutQuotes = messageContent.match(/(?:vr|chat)\s+(.+)/i);
  if (withoutQuotes) return withoutQuotes[1].trim().toLowerCase();
  return null;
}

function getForwardedContent(message) {
  return message.messageSnapshots
    ? [...message.messageSnapshots.values()]
        .map((s) => s.content?.toLowerCase() || "")
        .join(" ")
    : "";
}

async function showVoteResults(channel, msgId, question, choices, emojis) {
  const fetchedMsg = await channel.messages.fetch(msgId).catch(() => null);
  if (!fetchedMsg) return;

  const results = choices.map((choice, i) => {
    const reaction = fetchedMsg.reactions.cache.get(emojis[i]);
    const count = (reaction ? reaction.count : 1) - 1;
    return { choice, count, emoji: emojis[i] };
  });

  const total = results.reduce((sum, r) => sum + r.count, 0);
  const winner = results.reduce((a, b) => (a.count > b.count ? a : b));

  const resultText =
    `📊 **${question}** — natija:\n\n` +
    results
      .map((r) => {
        const percent = total > 0 ? Math.round((r.count / total) * 100) : 0;
        const bar =
          "█".repeat(Math.round(percent / 10)) +
          "░".repeat(10 - Math.round(percent / 10));
        return `${r.emoji} **${r.choice}** — ${r.count} votes (${percent}%)\n${bar}`;
      })
      .join("\n\n") +
    `\n\n🏆 ** l9arar erraba7: ${winner.choice}** b ${winner.count} votes !`;

  channel.send(resultText);
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const OWNER_ROLE_ID = "1483121682695590069";

const features = {
  badwords: true,
  spam: true,
  triggers: true,
  welcome: true,
  mentions: true,
};

const cooldowns = new Map();
const COOLDOWN = 30 * 1000;

const spamHistory = new Map();
const SPAM_WINDOW = 10 * 1000;
const SPAM_LIMIT = 5;
const REPEAT_LIMIT = 3;
const MENTION_LIMIT = 3;

const activeVotes = new Map();

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
  if (recent.length > SPAM_LIMIT) return { spam: true };
  if (
    recent.filter((m) => m.content === normalizedContent).length > REPEAT_LIMIT
  )
    return { spam: true };
  if (recent.reduce((sum, m) => sum + m.mentions, 0) > MENTION_LIMIT)
    return { spam: true };
  return { spam: false };
}

const triggers = [
  {
    words: ["ya ta77an", "tahan", "tahhan", "ta77an", "ta7an", "ya ta7an"],
    reply: "nti houwa eta77an",
  },
  { words: ["hello", "hey", "hi", "salam", "ahla"], reply: "ahla!" },
  {
    words: ["bye", "ciao", "bay", "nemchi", "ala5i", "3ala5ir"],
    reply: "besslema!",
  },
];

const badWords = [
  "zebi",
  "zeb",
  "زب",
  "zbi",
  "zb",
  "zk",
  "zab",
  "zby",
  "zaby",
  "zeby",
  "3asba",
  "3siba",
  "عصب",
  "97ayba",
  "9o7b",
  "عصبة",
  "3asb",
  "3sb",
  "asba",
  "nik",
  "niq",
  "نيك",
  "niek",
  "nayak",
  "nayk",
  "نايك",
  "nayek",
  "naik",
  "manyouk",
  "tnaket",
  "monaka",
  "mounaka",
  "kaboul",
  "nek",
  "sorm",
  "سرم",
  "zok",
  "زك",
  "zokek",
  "omk",
  "أمك",
  "omek",
  "omou",
  "امك",
  "امو",
  "أمو",
  "zabour",
  "زبور",
  "zbar",
  "زبر",
  "9a7ba",
  "قحب",
  "97iba",
  "قحيب",
  "9a7bet",
  "قحبا",
  "97ab",
  "قحاب",
  "9a7boun",
  "قحبون",
  "9a7bt",
  "suck ma dick",
  "mibon",
  "wabna",
  "wapna",
  "wbna",
  "wpna",
  "ميبون",
  "مبن",
  "ميبن",
  "مبون",
  "وبن",
  "miboun",
  "mipoun",
  "mipon",
  "y3aseb",
  "3asabet",
  "termtek",
  "ترم",
  "termtec",
  "termteq",
  "termtk",
  "termtc",
  "termtq",
  "terma",
  "ba3bes",
  "بعبس",
  "kos",
  "كس",
  "بعباس",
  "بعبص",
  "بعباص",
  "ba3bas",
  "bazoul",
  "بزول",
  "بزازل",
  "bzazel",
  "bzoul",
  "bazol",
  "bezoul",
  "bezol",
];

const emojiWords = ["🖕"];

const userMessageHistory = new Map();
const HISTORY_WINDOW = 10 * 1000;

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

function isBadMessage(content, userId) {
  const normalized = normalize(content);
  const combined = normalize(
    userMessageHistory
      .get(userId)
      ?.map((m) => m.content)
      .join("") || ""
  );
  return (
    badWords.some((w) => normalized.includes(w) || combined.includes(w)) ||
    emojiWords.some((e) => content.includes(e))
  );
}

function hasPermission(member) {
  try {
    const roles = getAllowedRoles(member.guild.id);
    return roles.some((id) => member.roles.cache.has(id));
  } catch (err) {
    console.error("hasPermission error:", err);
    return member.roles.cache.has(OWNER_ROLE_ID);
  }
}

function isOwner(member) {
  return member.roles.cache.has(OWNER_ROLE_ID);
}

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();
  const forwardedContent = getForwardedContent(message);
  const allContent = content + " " + forwardedContent;
  const normalizedContent = normalize(allContent);
  const recentMessages = getRecentMessages(message.author.id, message);

  // 0. toggle command
  if (content.startsWith("!toggle")) {
    if (!hasPermission(message.member)) {
      message.reply("ma3andekch permission !").then((msg) => {
        setTimeout(() => msg.delete(), 3000);
      });
      return;
    }
    const feature = content.split(" ")[1];
    if (!feature || !Object.prototype.hasOwnProperty.call(features, feature)) {
      message.reply(
        `features available: \`badwords\` , \`spam\` , \`triggers\` , \`welcome\` , \`mentions\`\n` +
          `current status:\n` +
          Object.entries(features)
            .map(([k, v]) => `• **${k}**: ${v ? "🟢 on" : "🔴 off"}`)
            .join("\n")
      );
      return;
    }
    features[feature] = !features[feature];
    message.reply(
      `✅ **${feature}** is now ${features[feature] ? "🟢 on" : "🔴 off"}`
    );
    return;
  }

  // 1. bad word check
  if (features.badwords && isBadMessage(allContent, message.author.id)) {
    recentMessages.forEach((m) => m.message.delete().catch(() => {}));
    userMessageHistory.set(message.author.id, []);
    message.channel
      .send(
        `${message.author}, yezi bla sabben we klam zayed , takel ban rak .`
      )
      .then((msg) => {
        setTimeout(() => msg.delete(), 5000);
      });
    return;
  }

  // 2. spam check
  if (features.spam) {
    const spamResult = checkSpam(message.author.id, normalizedContent, message);
    if (spamResult.spam) {
      const recentSpam = spamHistory.get(message.author.id) || [];
      recentSpam.slice(1).forEach((m) => m.message.delete().catch(() => {}));
      spamHistory.set(message.author.id, []);
      userMessageHistory.set(message.author.id, []);
      message.channel
        .send(`${message.author}, yezzi bla spam , takel ban rak .`)
        .then((msg) => {
          setTimeout(() => msg.delete(), 5000);
        });
      return;
    }
  }

  // track message count
  incrementMessages(message.guild.id, message.author.id);

  // 3. clear command
  if (content === "!fassa5" || content.startsWith("!fassa5 ")) {
    if (!hasPermission(message.member)) {
      message.reply("ma3andekch permission !").then((msg) => {
        setTimeout(() => msg.delete(), 3000);
      });
      return;
    }
    const args = content.split(" ");
    const amount = parseInt(args[1]) || 100;
    if (amount < 1 || amount > 100) {
      message.reply("el nombre lazem ykon bin 1 w 100 .");
      return;
    }
    message.channel
      .bulkDelete(amount, true)
      .then((deleted) => {
        message.channel
          .send(`✅ hani fassa5t ${deleted.size} messages .`)
          .then((msg) => {
            setTimeout(() => msg.delete(), 3000);
          });
      })
      .catch((err) => console.error(err));
    return;
  }

  // 4. warn command
  if (content.startsWith("!warn")) {
    if (!hasPermission(message.member)) {
      message.reply("ma3andekch permission !").then((msg) => {
        setTimeout(() => msg.delete(), 3000);
      });
      return;
    }
    const mentionedUser = message.mentions.members.first();
    const reason = message.content.split(" ").slice(2).join(" ") || "no reason";
    if (!mentionedUser) {
      message.reply("usage: `!warn @user reason`");
      return;
    }
    const warnCount = addWarn(
      message.guild.id,
      mentionedUser.id,
      reason,
      message.author.id
    );
    message.reply(
      `⚠️ ${mentionedUser} t3andou warn , total warns: **${warnCount}**`
    );
    return;
  }

  // 5. profile command
  if (content.startsWith("!profile")) {
    const mentionedUser = message.mentions.members.first() || message.member;
    const userData = getUser(message.guild.id, mentionedUser.id);
    message.reply(
      `👤 **${mentionedUser.user.username}**\n` +
        `📅 Join date: ${
          userData.joinDate
            ? new Date(userData.joinDate).toLocaleDateString()
            : "unknown"
        }\n` +
        `💬 Messages: **${userData.messageCount}**\n` +
        `⚠️ Warns: **${userData.warns.length}**\n` +
        `🔇 Mutes: **${userData.mutes.length}**\n` +
        `🔨 Bans: **${userData.bans.length}**`
    );
    return;
  }

  // 6. addrole command
  if (content.startsWith("!addrole")) {
    if (!isOwner(message.member)) {
      message.reply("ma3andekch permission !").then((msg) => {
        setTimeout(() => msg.delete(), 3000);
      });
      return;
    }
    const roleId = content.split(" ")[1];
    const roles = getAllowedRoles(message.guild.id);
    if (!roleId) {
      message.reply(
        `usage: \`!addrole roleID\`\ncurrent allowed roles:\n` +
          roles
            .map((id, i) => `• \`${id}\`${i === 0 ? " (owner)" : ""}`)
            .join("\n")
      );
      return;
    }
    if (roles.includes(roleId)) {
      message.reply("hadha erole deja fe lista .");
      return;
    }
    roles.push(roleId);
    saveAllowedRoles(message.guild.id, roles);
    message.reply(`✅ role \`${roleId}\` tzad fe lista .`);
    return;
  }

  // 7. removerole command
  if (content.startsWith("!removerole")) {
    if (!isOwner(message.member)) {
      message.reply("ma3andekch permission !").then((msg) => {
        setTimeout(() => msg.delete(), 3000);
      });
      return;
    }
    const roleId = content.split(" ")[1];
    const roles = getAllowedRoles(message.guild.id);
    if (!roleId) {
      message.reply(
        `usage: \`!removerole roleID\`\ncurrent allowed roles:\n` +
          roles
            .map((id, i) => `• \`${id}\`${i === 0 ? " (owner)" : ""}`)
            .join("\n")
      );
      return;
    }
    if (roleId === OWNER_ROLE_ID) {
      message.reply("ma tnajem tna7i el owner role .");
      return;
    }
    const index = roles.indexOf(roleId);
    if (index === -1) {
      message.reply("had role mach fi lista .");
      return;
    }
    roles.splice(index, 1);
    saveAllowedRoles(message.guild.id, roles);
    message.reply(`✅ role \`${roleId}\` tna7a men lista .`);
    return;
  }

  // 8. listroles command
  if (content === "!listroles") {
    if (!hasPermission(message.member)) {
      message.reply("ma3andekch permission !").then((msg) => {
        setTimeout(() => msg.delete(), 3000);
      });
      return;
    }
    const roles = getAllowedRoles(message.guild.id);
    message.reply(
      `current allowed roles:\n` +
        roles
          .map((id, i) => `• \`${id}\`${i === 0 ? " (owner)" : ""}`)
          .join("\n")
    );
    return;
  }

  // 9. vote command
  if (content.startsWith("!vote")) {
    if (!hasPermission(message.member)) {
      message.reply("ma3andekch permission !").then((msg) => {
        setTimeout(() => msg.delete(), 3000);
      });
      return;
    }
    const args = message.content.match(/"([^"]+)"/g);
    const timeMatch = message.content.match(/!vote\s+(\d+)(s|m|h|d)/i);
    if (!args || args.length < 3 || !timeMatch) {
      message.reply(
        'usage: `!vote <time> "question" "choice1" "choice2" ...`\n' +
          "time format: `30s` = 30 sec , `10m` = 10 min , `2h` = 2 hours , `1d` = 1 day\n" +
          'example: `!vote 10m "winner?" "option 1" "option 2" "option 3"`\n' +
          "max 5 choices , max 24h ."
      );
      return;
    }
    const timeValue = parseInt(timeMatch[1]);
    const timeUnit = timeMatch[2].toLowerCase();
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400 };
    const duration = Math.min(timeValue * multipliers[timeUnit], 86400);
    const durationLabel = `${timeValue}${timeUnit}`;
    const question = args[0].replace(/"/g, "");
    const choices = args
      .slice(1)
      .map((a) => a.replace(/"/g, ""))
      .slice(0, 5);
    const emojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣"];
    const voteText =
      `📊 **${question}**\n\n` +
      choices.map((c, i) => `${emojis[i]} ${c}`).join("\n") +
      `\n\n⏱️ tatla3 natijet lvote fi **${durationLabel}** .\n` +
      `(moderator ynajem ywa99ef lvote b \`!stopvote\`)`;
    const voteMsg = await message.channel.send(voteText);
    for (let i = 0; i < choices.length; i++) {
      await voteMsg.react(emojis[i]);
    }
    const timer = setTimeout(async () => {
      await showVoteResults(
        message.channel,
        voteMsg.id,
        question,
        choices,
        emojis
      );
      activeVotes.delete(message.channel.id);
    }, duration * 1000);
    activeVotes.set(message.channel.id, {
      msgId: voteMsg.id,
      question,
      choices,
      emojis,
      timer,
    });
    return;
  }

  // 10. stopvote command
  if (content === "!stopvote") {
    if (!hasPermission(message.member)) {
      message.reply("ma3andekch permission !").then((msg) => {
        setTimeout(() => msg.delete(), 3000);
      });
      return;
    }
    const vote = activeVotes.get(message.channel.id);
    if (!vote) {
      message.reply("dja fammach taswit hna .");
      return;
    }
    clearTimeout(vote.timer);
    activeVotes.delete(message.channel.id);
    await showVoteResults(
      message.channel,
      vote.msgId,
      vote.question,
      vote.choices,
      vote.emojis
    );
    return;
  }

  // 11. sakket command (mute)
  if (content.startsWith("!sakket")) {
    if (!hasPermission(message.member)) {
      message.reply("ma3andekch permission !").then((msg) => {
        setTimeout(() => msg.delete(), 3000);
      });
      return;
    }
    const mentionedUser = message.mentions.members.first();
    const typeMatch = message.content.match(/\b(vr|chat)\b/i);
    const roomName = parseRoomName(message.content);
    if (!mentionedUser || !typeMatch || !roomName) {
      message.reply(
        "usage: `!sakket @user vr room name` or `!sakket @user chat room name`"
      );
      return;
    }
    const type = typeMatch[1].toLowerCase();
    if (type === "vr") {
      const voiceChannel = message.guild.channels.cache.find(
        (ch) => ch.name.toLowerCase() === roomName && ch.type === 2
      );
      if (!voiceChannel) {
        message.reply(`ma l9ithach lvoice room li esmha "**${roomName}**"`);
        return;
      }
      const freshMember = await message.guild.members.fetch(mentionedUser.id);
      if (!freshMember.voice.channel) {
        message.reply(`${mentionedUser} mahouch fi vr "**${roomName}**" !`);
        return;
      }
      const reloadChannel = message.guild.channels.cache.find(
        (ch) => ch.name.toLowerCase() === "mute-reload" && ch.type === 2
      );
      if (!reloadChannel) {
        message.reply(`ma l9ithach channel "mute-reload" , zidha fi server !`);
        return;
      }
      const currentChannel = freshMember.voice.channel;
      try {
        await voiceChannel.permissionOverwrites.edit(freshMember, {
          Speak: false,
        });
        await freshMember.voice.setChannel(reloadChannel);
        await delay(1500);
        await freshMember.voice.setChannel(currentChannel);
        addMute(
          message.guild.id,
          mentionedUser.id,
          "muted by moderator",
          message.author.id,
          "vr"
        );
        message.reply(
          `✅ ${mentionedUser} saket fi **${voiceChannel.name}** 🔇`
        );
      } catch (err) {
        console.error(err);
        message.reply("manajjamtech nsakktou , check bot permissions .");
      }
    } else if (type === "chat") {
      const textChannel = message.guild.channels.cache.find(
        (ch) => ch.name.toLowerCase() === roomName && ch.type === 0
      );
      if (!textChannel) {
        message.reply(`ma l9ithach echat room li esmha "**${roomName}**"`);
        return;
      }
      try {
        await textChannel.permissionOverwrites.edit(mentionedUser, {
          SendMessages: false,
        });
        addMute(
          message.guild.id,
          mentionedUser.id,
          "muted by moderator",
          message.author.id,
          "chat"
        );
        message.reply(
          `✅ ${mentionedUser} saket fi **${textChannel.name}** 🔇`
        );
      } catch (err) {
        console.error(err);
        message.reply("manajjamtech nsakktou , check bot permissions .");
      }
    }
    return;
  }

  // 12. na77i_mute command (unmute)
  if (content.startsWith("!na77i_mute")) {
    if (!hasPermission(message.member)) {
      message.reply("ma3andekch permission !").then((msg) => {
        setTimeout(() => msg.delete(), 3000);
      });
      return;
    }
    const mentionedUser = message.mentions.members.first();
    const typeMatch = message.content.match(/\b(vr|chat)\b/i);
    const roomName = parseRoomName(message.content);
    if (!mentionedUser || !typeMatch || !roomName) {
      message.reply(
        "usage: `!na77i_mute @user vr room name` or `!na77i_mute @user chat room name`"
      );
      return;
    }
    const type = typeMatch[1].toLowerCase();
    if (type === "vr") {
      const voiceChannel = message.guild.channels.cache.find(
        (ch) => ch.name.toLowerCase() === roomName && ch.type === 2
      );
      if (!voiceChannel) {
        message.reply(`ma l9ithach lvoice room li esmha "**${roomName}**"`);
        return;
      }
      const freshMember = await message.guild.members.fetch(mentionedUser.id);
      if (!freshMember.voice.channel) {
        message.reply(`${mentionedUser} mahouch fi vr "**${roomName}**" !`);
        return;
      }
      const reloadChannel = message.guild.channels.cache.find(
        (ch) => ch.name.toLowerCase() === "mute-reload" && ch.type === 2
      );
      if (!reloadChannel) {
        message.reply(`ma l9ithach channel "mute-reload" , zidha fi server !`);
        return;
      }
      const currentChannel = freshMember.voice.channel;
      try {
        await voiceChannel.permissionOverwrites.edit(freshMember, {
          Speak: true,
        });
        await freshMember.voice.setChannel(reloadChannel);
        await delay(1500);
        await freshMember.voice.setChannel(currentChannel);
        message.reply(
          `✅ ${mentionedUser} tna77alou lmute fi **${voiceChannel.name}** 🔊`
        );
      } catch (err) {
        console.error(err);
        message.reply("manajjamtech enna7i mute , check bot permissions .");
      }
    } else if (type === "chat") {
      const textChannel = message.guild.channels.cache.find(
        (ch) => ch.name.toLowerCase() === roomName && ch.type === 0
      );
      if (!textChannel) {
        message.reply(`ma l9ithach echat room li esmha "**${roomName}**"`);
        return;
      }
      try {
        await textChannel.permissionOverwrites.edit(mentionedUser, {
          SendMessages: true,
        });
        message.reply(
          `✅ ${mentionedUser} tna77alou lmute fi **${textChannel.name}** 🔊`
        );
      } catch (err) {
        console.error(err);
        message.reply("manajjamtech enna7i mute , check bot permissions .");
      }
    }
    return;
  }

  // 13. mention logic
  if (features.mentions && message.mentions.has(client.user)) {
    const userId = message.author.id;
    const now = Date.now();
    if (cooldowns.has(userId)) {
      const data = cooldowns.get(userId);
      data.lastTime = now;
      if (data.count === 1) {
        message.reply(`aa si ${message.author}, chet7eb ?`);
      } else if (data.count === 2) {
        message.reply(`chet7eb ${message.author} ma twattarlich a3sabi`);
      } else {
        message.reply(
          `aa si ${message.author}, 5aterni ka7louch te7sayebini ma9mou3 hw chentaffik .`
        );
        message.reply(`${message.author}, barra zammer`);
      }
      data.count += 1;
      cooldowns.set(userId, data);
    } else {
      cooldowns.set(userId, { lastTime: now, count: 1 });
      message.reply(`aa si ${message.author}, chet7eb`);
    }
    return;
  }

  // 14. keyword triggers
  if (features.triggers) {
    const match = triggers.find((t) =>
      t.words.some((w) => content.includes(w))
    );
    if (match) message.reply(match.reply);
  }
});

// 15. catch edited messages
client.on("messageUpdate", (oldMessage, newMessage) => {
  if (newMessage.author?.bot) return;
  if (!newMessage.content) return;
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
      .send(
        `${newMessage.author}, fe9t bik ta3mel fi edit , arka7 takel ban rak .`
      )
      .then((msg) => {
        setTimeout(() => msg.delete(), 5000);
      });
  }
});

// 16. welcome + save join date
client.on("guildMemberAdd", (member) => {
  setJoinDate(member.guild.id, member.user.id, new Date().toISOString());
  if (!features.welcome) return;
  const channel = member.guild.channels.cache.find(
    (ch) => ch.name === "welcome"
  );
  if (!channel) return;
  channel.send(
    `ahla b ${member.user.username} , mar7ba bik fi ${member.guild.name} 🎉`
  );
  const role = member.guild.roles.cache.find((r) => r.name === "member");
  if (!role) return;
  member.roles.add(role).catch((err) => console.error(err));
});

client
  .login(process.env.TOKEN)
  .catch((err) => console.error("Login error:", err));
