const { Client, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildEmojisAndStickers,
  ],
});


const TOKEN = 'PUT TOKEN HERE'; 

// Helper: download a file from a URL to a local path
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    if (!url) return resolve();
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    protocol.get(url, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

// Helper: escape CSV field
function csvField(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Helper: write array of objects to CSV
function writeCSV(filepath, rows) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => csvField(row[h])).join(','))
  ];
  fs.writeFileSync(filepath, lines.join('\n'), 'utf8');
}

client.once('ready', () => {
  console.log(` Logged in as ${client.user.tag}`);
  console.log(` Use /export in any server where you are an Administrator.`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'export') return;

  // ── Admin check ──────────────────────────────────
  if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: ' You must be a server **Administrator** to use this command.',
      ephemeral: true,
    });
  }

  await interaction.reply({ content: '⏳ Exporting server data, please wait...', ephemeral: true });

  const guild = interaction.guild;

  // Fetch full guild data
  await guild.fetch();
  await guild.members.fetch();

  // ── Output folder ────────────────────────────────
  const safeName = guild.name.replace(/[^a-z0-9_\-]/gi, '_');
  const outDir   = path.join(__dirname, 'exports', safeName);
  const imgDir   = path.join(outDir, 'images');
  const emojiDir = path.join(outDir, 'images', 'emojis');
  const stickerDir = path.join(outDir, 'images', 'stickers');

  fs.mkdirSync(outDir,     { recursive: true });
  fs.mkdirSync(imgDir,     { recursive: true });
  fs.mkdirSync(emojiDir,   { recursive: true });
  fs.mkdirSync(stickerDir, { recursive: true });

  // ── 1. Server info CSV ───────────────────────────
  const serverInfo = [{
    name:           guild.name,
    id:             guild.id,
    description:    guild.description || '',
    member_count:   guild.memberCount,
    owner_id:       guild.ownerId,
    created_at:     guild.createdAt.toISOString(),
    verification_level: guild.verificationLevel,
    boost_level:    guild.premiumTier,
    boost_count:    guild.premiumSubscriptionCount || 0,
    preferred_locale: guild.preferredLocale,
    nsfw_level:     guild.nsfwLevel,
    icon_url:       guild.iconURL({ size: 4096 }) || '',
    banner_url:     guild.bannerURL({ size: 4096 }) || '',
    splash_url:     guild.splashURL({ size: 4096 }) || '',
  }];
  writeCSV(path.join(outDir, 'server_info.csv'), serverInfo);

  // ── 2. Roles CSV ─────────────────────────────────
  const roles = guild.roles.cache
    .sort((a, b) => b.position - a.position)
    .map(role => ({
      id:          role.id,
      name:        role.name,
      color:       role.hexColor,
      position:    role.position,
      hoisted:     role.hoist,
      mentionable: role.mentionable,
      managed:     role.managed,
      permissions: role.permissions.toArray().join(' | '),
    }));
  writeCSV(path.join(outDir, 'roles.csv'), roles);

  // ── 3. Channels CSV ──────────────────────────────
  const channels = guild.channels.cache
    .sort((a, b) => a.position - b.position)
    .map(ch => ({
      id:       ch.id,
      name:     ch.name,
      type:     ch.type,
      position: ch.rawPosition ?? '',
      parent:   ch.parent?.name || '',
      topic:    ch.topic || '',
      nsfw:     ch.nsfw ?? '',
    }));
  writeCSV(path.join(outDir, 'channels.csv'), channels);

  // ── 4. Members CSV ───────────────────────────────
  const members = guild.members.cache.map(member => ({
    id:          member.id,
    username:    member.user.username,
    display_name: member.displayName,
    bot:         member.user.bot,
    joined_at:   member.joinedAt?.toISOString() || '',
    roles:       member.roles.cache.filter(r => r.name !== '@everyone').map(r => r.name).join(' | '),
    top_role:    member.roles.highest.name,
  }));
  writeCSV(path.join(outDir, 'members.csv'), members);

  // ── 5. Emojis CSV + download ─────────────────────
  const emojis = guild.emojis.cache.map(emoji => ({
    id:       emoji.id,
    name:     emoji.name,
    animated: emoji.animated,
    url:      emoji.url,
  }));
  writeCSV(path.join(outDir, 'emojis.csv'), emojis);

  for (const emoji of guild.emojis.cache.values()) {
    const ext  = emoji.animated ? 'gif' : 'png';
    const dest = path.join(emojiDir, `${emoji.name}.${ext}`);
    await downloadFile(emoji.url, dest).catch(() => {});
  }

  // ── 6. Stickers CSV + download ───────────────────
  const stickers = guild.stickers.cache.map(s => ({
    id:          s.id,
    name:        s.name,
    description: s.description || '',
    format:      s.format,
    url:         s.url,
  }));
  writeCSV(path.join(outDir, 'stickers.csv'), stickers);

  for (const sticker of guild.stickers.cache.values()) {
    const ext  = sticker.format === 'APNG' ? 'png' : sticker.format.toLowerCase();
    const dest = path.join(stickerDir, `${sticker.name}.${ext}`);
    await downloadFile(sticker.url, dest).catch(() => {});
  }

  // ── 7. Download server images ────────────────────
  const iconURL   = guild.iconURL({ size: 4096, extension: 'png' });
  const bannerURL = guild.bannerURL({ size: 4096, extension: 'png' });
  const splashURL = guild.splashURL({ size: 4096, extension: 'png' });

  if (iconURL)   await downloadFile(iconURL,   path.join(imgDir, 'icon.png')).catch(() => {});
  if (bannerURL) await downloadFile(bannerURL, path.join(imgDir, 'banner.png')).catch(() => {});
  if (splashURL) await downloadFile(splashURL, path.join(imgDir, 'splash.png')).catch(() => {});

  // ── Done ─────────────────────────────────────────
  const summary = [
    ` **Export complete** for **${guild.name}**`,
    ``,
    ` \`server_info.csv\` — server details`,
    ` \`roles.csv\` — ${roles.length} roles`,
    ` \`channels.csv\` — ${channels.length} channels`,
    ` \`members.csv\` — ${members.length} members`,
    ` \`emojis.csv\` + ${emojis.length} images`,
    ` \`stickers.csv\` + ${stickers.length} images`,
    ` Server icon, banner & splash (if available)`,
    ``,
    ` Saved to: \`exports/${safeName}/\``,
  ].join('\n');

  await interaction.editReply({ content: summary });
});

// ── Register slash command & login ───────────────────
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const command = new SlashCommandBuilder()
  .setName('export')
  .setDescription('Export server data to CSV and download assets (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .toJSON();

client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    console.log(' Registering /export slash command...');
    // Register globally (takes up to 1hr) — for instant use, replace with guild command:
    // await rest.put(Routes.applicationGuildCommands(client.user.id, 'YOUR_GUILD_ID'), { body: [command] });
    await rest.put(Routes.applicationCommands(client.user.id), { body: [command] });
    console.log(' Slash command registered.');
  } catch (err) {
    console.error('Failed to register command:', err);
  }
});

client.login(TOKEN);
