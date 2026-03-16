require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");

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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cooldowns = new Map();
const COOLDOWN = 30 * 1000;

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
  if (!userMessageHistory.has(userId)) {
    userMessageHistory.set(userId, []);
  }
  const history = userMessageHistory.get(userId);
  const forwardedContent = getForwardedContent(newMessage);
  const fullContent = newMessage.content.toLowerCase() + " " + forwardedContent;
  history.push({
    message: newMessage,
    content: fullContent,
    time: now,
  });
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

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();
  const forwardedContent = getForwardedContent(message);
  const allContent = content + " " + forwardedContent;

  const recentMessages = getRecentMessages(message.author.id, message);

  // 1. bad word check
  if (isBadMessage(allContent, message.author.id)) {
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

  // 2. clear command
  if (content === "!fassa5") {
    const allowedRole = "a7la nes";
    const hasRole = message.member.roles.cache.some(
      (r) => r.name.toLowerCase() === allowedRole
    );
    if (!hasRole) {
      message.reply("ma3andekch permission !").then((msg) => {
        setTimeout(() => msg.delete(), 3000);
      });
      return;
    }
    message.channel
      .bulkDelete(100, true)
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

  // 3. sakket command (mute)
  if (content.startsWith("!sakket")) {
    const allowedRole = "a7la nes";
    const hasRole = message.member.roles.cache.some(
      (r) => r.name.toLowerCase() === allowedRole
    );
    if (!hasRole) {
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
        message.reply(
          `ma l9ithach channel "mute-reload" , a3melou fi server !`
        );
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

  // 4. na77i_mute command (unmute)
  if (content.startsWith("!na77i_mute")) {
    const allowedRole = "a7la nes";
    const hasRole = message.member.roles.cache.some(
      (r) => r.name.toLowerCase() === allowedRole
    );
    if (!hasRole) {
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
        message.reply(
          `ma l9ithach channel "mute-reload" , a3melou fi server !`
        );
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

  // 5. mention logic
  if (message.mentions.has(client.user)) {
    const userId = message.author.id;
    const now = Date.now();

    if (cooldowns.has(userId)) {
      const data = cooldowns.get(userId);
      data.lastTime = now;

      if (data.count === 1) {
        message.reply(`aa si ${message.author}, chet7eb ?`);
      } else if (data.count === 2) {
        message.reply(`chet7eb ${message.author} ma tkarreznich`);
      } else {
        message.reply(
          `aa si ${message.author}, 5aterni ka7louch te7sayebini ma9mou3 hw chentaffik .`
        );
        message.reply(`${message.author}, barra nayek`);
      }

      data.count += 1;
      cooldowns.set(userId, data);
    } else {
      cooldowns.set(userId, { lastTime: now, count: 1 });
      message.reply(`aa si ${message.author}, chet7eb`);
    }
    return;
  }

  // 6. keyword triggers
  const match = triggers.find((t) => t.words.some((w) => content.includes(w)));
  if (match) message.reply(match.reply);
});

// 7. catch edited messages
client.on("messageUpdate", (oldMessage, newMessage) => {
  if (newMessage.author?.bot) return;
  if (!newMessage.content) return;

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

client.on("guildMemberAdd", (member) => {
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
