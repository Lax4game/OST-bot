require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// SUPABASE CONFIG
const SUPABASE_URL = 'https://kchbrgibkvwgbhmeanzw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_UJ4As6EIogrEdc3BYjaUrg_cXs9OGwN';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// TOKEN BOT
const TOKEN = process.env.DISCORD_TOKEN;
const SECRET = 'OST_SECRET_KEY_2026_!@#';

// CẤU HÌNH SEPAY (BẠN CẦN ĐIỀN THÔNG TIN VÀO ĐÂY)
const SEPAY_API_TOKEN = '50FZWULZT8AE9UTYMYIJHSE2CB8EJXFRDCHFYWB7DVIJ6NWUPPIZXLVRAQPCPQMX'; 
const BANK_ACCOUNT = '02000769999'; 
const BANK_ID = 'MB'; // MB Bank
const ACCOUNT_NAME = 'TA QUANG HOP';

// CẤU HÌNH TÊN ROLE QUẢN LÝ GAME
const ADMIN_ROLE_NAME = 'ᴹᴼᴰᴱᴿᴬᵀᴼᴿ';

// CẤU HÌNH TELEGRAM (Báo cáo hành động)
const TELEGRAM_BOT_TOKEN = '8903287354:AAFuVmjFs8lIRO2AgwkhGr2rdWtBaEgNWgg';
const TELEGRAM_CHAT_ID = '7344500870';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Hàm gửi thông báo qua Telegram
async function notifyTelegram(messageText) {
  if (TELEGRAM_BOT_TOKEN === 'ĐIỀN_TOKEN_BOT_TELE_VÀO_ĐÂY' || !TELEGRAM_BOT_TOKEN) return;
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: messageText,
      parse_mode: 'HTML'
    });
  } catch (err) {
    console.error('[TELEGRAM] Lỗi gửi thông báo:', err.message);
  }
}

// Lưu các order đang chờ thanh toán: Map<orderId, { userId, type, days, amount, message } >
const pendingOrders = new Map();

// Hàm tạo Key mã hóa an toàn
function generateKey(type, discordId, days) {
  const exp = Math.floor(Date.now() / 1000) + (days * 24 * 60 * 60);
  
  const expBuffer = Buffer.alloc(4);
  expBuffer.writeUInt32BE(exp);
  
  const typeByte = type === 'VIP' ? 1 : 0;
  const typeBuffer = Buffer.from([typeByte]);
  
  const discordIdBuffer = Buffer.alloc(8);
  discordIdBuffer.writeBigUInt64BE(BigInt(discordId));
  
  const randomBuffer = crypto.randomBytes(2);
  const payload = Buffer.concat([expBuffer, typeBuffer, discordIdBuffer, randomBuffer]);
  
  const hmac = crypto.createHmac('sha256', SECRET).update(payload).digest();
  const signature = hmac.subarray(0, 3);
  
  const finalBuffer = Buffer.concat([payload, signature]);
  const hex = finalBuffer.toString('hex').toUpperCase();
  
  return 'OST-' + hex.match(/.{1,4}/g).join('-');
}

// Kiểm tra giao dịch từ SePay (Chạy ngầm mỗi 10 giây)
setInterval(async () => {
  if (pendingOrders.size === 0 || SEPAY_API_TOKEN === 'YOUR_SEPAY_API_TOKEN_HERE') return;

  try {
    const res = await axios.get('https://my.sepay.vn/userapi/transactions/list', {
      headers: { 'Authorization': `Bearer ${SEPAY_API_TOKEN}` }
    });

    const transactions = res.data.transactions || [];

    for (const tx of transactions) {
      const content = tx.transaction_content.toUpperCase();
      const amountIn = parseInt(tx.amount_in);

      // Tìm xem có mã Order nào khớp không
      for (const [orderId, orderInfo] of pendingOrders.entries()) {
        if (content.includes(orderId) && amountIn >= orderInfo.amount) {
          // Thanh toán thành công!
          const key = generateKey('VIP', orderInfo.userId, orderInfo.days);
          
          // LƯU VÀO SUPABASE
          const expDate = new Date(Date.now() + orderInfo.days * 24 * 60 * 60 * 1000);
          await supabase.from('license_keys').insert([{
            key_string: key,
            discord_id: orderInfo.userId,
            hwid: null,
            type: 'VIP',
            exp_date: expDate.toISOString()
          }]);

          try {
            const user = await client.users.fetch(orderInfo.userId);
            await user.send(`🎉 **Thanh Toán Thành Công!**\nCảm ơn bạn đã ủng hộ.\n\n🔑 Key VIP (${orderInfo.days} Ngày) của bạn là: \`${key}\`\n\n*Vui lòng copy và dán vào O.S.T Manager!*`);
          } catch(e) {
            if (orderInfo.message) {
              await orderInfo.message.reply(`🎉 **Thanh Toán Thành Công!** <@${orderInfo.userId}>\n🔑 Key VIP (${orderInfo.days} Ngày) của bạn là: \`${key}\``);
            }
          }
          
          console.log(`[SEPAY] Đã cấp VIP ${orderInfo.days} ngày cho User ${orderInfo.userId}`);
          notifyTelegram(`💰 <b>TỰ ĐỘNG BÁN VIP THÀNH CÔNG</b>\n👤 ID Khách: <code>${orderInfo.userId}</code>\n💎 Gói VIP: <b>${orderInfo.days} Ngày</b>\n💸 Số tiền: <b>${amountIn.toLocaleString()} VNĐ</b>\n🔑 Key: <code>${key}</code>`);
          
          pendingOrders.delete(orderId);
        }
      }
    }
  } catch (err) {
    console.error('[SEPAY] Lỗi kiểm tra giao dịch:', err.message);
  }
}, 10000);

client.once('ready', async () => {
  console.log(`[BOT] Đã đăng nhập thành công: ${client.user.tag}`);
  client.user.setActivity('/getkey hoặc /buyvip', { type: ActivityType.Playing });

  // Đăng ký Slash Commands để hiện menu gợi ý
  const commands = [
    {
      name: 'getkey',
      description: 'Nhận Key O.S.T Manager (CASUAL - Miễn phí 1 ngày)'
    },
    {
      name: 'buyvip',
      description: 'Mua Key VIP để mở khóa toàn bộ tính năng'
    },
    {
      name: 'addgame',
      description: 'Quét và thêm Game vào kho (Chỉ Mod/Admin)',
      options: [
        {
          name: 'appid',
          description: 'Mã AppID của Game trên Steam',
          type: 4, // Số nguyên (Integer)
          required: true
        }
      ]
    }
  ];
  try {
    await client.application.commands.set(commands);
    console.log('[BOT] Đã đăng ký Menu Slash Commands thành công!');
  } catch (error) {
    console.error('[BOT] Lỗi đăng ký Slash Commands:', error);
  }
});

// Hệ thống Cooldown (Chống Spam)
const cooldownsPath = path.resolve(__dirname, 'cooldowns.json');
function getCooldowns() {
  if (fs.existsSync(cooldownsPath)) return JSON.parse(fs.readFileSync(cooldownsPath, 'utf8'));
  return {};
}
function saveCooldowns(data) {
  fs.writeFileSync(cooldownsPath, JSON.stringify(data, null, 2));
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();
  const userId = message.author.id;

  // Lệnh tạo key CASUAL (1 ngày miễn phí)
  if (content === '/getkey') {
    const cooldowns = getCooldowns();
    const lastUse = cooldowns[userId]?.getkey || 0;
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    if (now - lastUse < ONE_DAY) {
      const remainingHours = Math.ceil((ONE_DAY - (now - lastUse)) / (1000 * 60 * 60));
      return message.reply(`⏳ **Bạn đã lấy Key hôm nay rồi!**\nVui lòng quay lại sau **${remainingHours} giờ** nữa để nhận Key mới nhé. Tránh lách luật nha! 😎`);
    }

    try {
      const key = generateKey('CASUAL', userId, 1);
      
      // Lưu thời gian
      if (!cooldowns[userId]) cooldowns[userId] = {};
      cooldowns[userId].getkey = now;
      saveCooldowns(cooldowns);

      await message.reply(`✅ **Tạo Key CASUAL Thành Công!**\n\n🔑 Key: \`${key}\`\n⏳ Thời hạn: **24 Giờ**\n🔓 Mở khóa: Các tính năng cơ bản.\n*Dán Key vào O.S.T Manager để truy cập.*`);
      
      // Báo cáo lên Telegram
      notifyTelegram(`🔔 <b>MỚI LẤY KEY CASUAL</b>\n👤 Khách hàng: <code>${message.author.tag}</code> (ID: ${userId})\n🔑 Key: <code>${key}</code>`);
    } catch (error) {
      message.reply('❌ Có lỗi xảy ra!');
    }
  }

  // Lệnh mua VIP
  if (content === '/buyvip') {
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('buy_vip_1')
          .setLabel('VIP 1 Ngày (10.000 VNĐ)')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('buy_vip_7')
          .setLabel('VIP 7 Ngày (50.000 VNĐ)')
          .setStyle(ButtonStyle.Success),
      );

    await message.reply({
      content: '💎 **CHỌN GÓI VIP BẠN MUỐN MUA:**\n(Mở khóa Denuvo Ticket Extractor)',
      components: [row]
    });
  }
  // Lệnh tự động quét và thêm Game (Chỉ dành cho Role được chỉ định)
  if (content.startsWith('/addgame')) {
    // Phân quyền: Kiểm tra Tên Role cụ thể HOẶC quyền Administrator
    const hasAdminPerm = message.member && message.member.permissions.has('Administrator');
    const hasSpecificRole = message.member && message.member.roles.cache.some(role => role.name === ADMIN_ROLE_NAME);
    
    if (!hasAdminPerm && !hasSpecificRole) {
      return message.reply('❌ Bạn không có quyền sử dụng lệnh này!');
    }

    const args = message.content.split(' ');
    if (args.length < 2) {
      return message.reply('📝 Cú pháp: `/addgame <AppID>`');
    }

    const appId = parseInt(args[1]);
    if (isNaN(appId)) return message.reply('❌ AppID phải là một con số!');

    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');
    const os = require('os');

    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
      return message.reply('❌ Lỗi hệ thống: Chưa cấu hình GITHUB_TOKEN trên Render.');
    }

    const keysPath = path.resolve(__dirname, 'depotkeys.json');
    if (!fs.existsSync(keysPath)) {
      return message.reply('❌ Lỗi hệ thống: Không tìm thấy file depotkeys.json.');
    }

    const loadingMsg = await message.reply(`🔄 Đang chuẩn bị dữ liệu cho AppID **${appId}**...`);
    const tmpDir = path.join(os.tmpdir(), `ost_repo_${appId}_${Date.now()}`);
    const repoUrl = `https://Lax4game:${githubToken}@github.com/Lax4game/OST-Manifest-Store.git`;

    try {
      execSync(`git clone ${repoUrl} "${tmpDir}"`);
    } catch (err) {
      return loadingMsg.edit('❌ Lỗi: Không thể kết nối tới Github (Sai Token hoặc Repo không tồn tại).');
    }

    const repoPath = tmpDir;
    const jsonPath = path.join(repoPath, 'games.json');

    try {
      let games = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, 'utf8')) : [];
      const isExist = games.some(g => g.appId.toString() === appId.toString());
      if (isExist) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        return loadingMsg.edit(`⚠️ **Game này đã có sẵn trên Chợ VIP rồi!**\nNếu có cập nhật mới, vui lòng xóa file trên Github trước.`);
      }

      const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appId}`);
      const steamData = steamRes.data[appId];
      
      let gameName = `Game ${appId}`;
      let gameCover = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;

      if (steamData && steamData.success) {
        gameName = steamData.data.name;
        if (steamData.data.header_image) gameCover = steamData.data.header_image;
      } else if (args.length > 2) {
        gameName = args.slice(2).join(' ');
      }
      
      const attachments = Array.from(message.attachments.values());
      let manifestUrls = [];
      let luaUrl = '';
      let attachedDepotIds = [];
      let luaContent = `-- Auto-generated by O.S.T Manager Bot\naddappid(${appId})\n`;

      if (!fs.existsSync(path.join(repoPath, 'lua'))) fs.mkdirSync(path.join(repoPath, 'lua'), { recursive: true });
      if (!fs.existsSync(path.join(repoPath, 'manifests'))) fs.mkdirSync(path.join(repoPath, 'manifests'), { recursive: true });

      for (const att of attachments) {
        const response = await axios.get(att.url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data);

        if (att.name.endsWith('.lua')) {
          fs.writeFileSync(path.join(repoPath, 'lua', att.name), buffer);
          luaUrl = `https://raw.githubusercontent.com/Lax4game/OST-Manifest-Store/main/lua/${att.name}`;
        } else if (att.name.endsWith('.manifest')) {
          fs.writeFileSync(path.join(repoPath, 'manifests', att.name), buffer);
          manifestUrls.push(`https://raw.githubusercontent.com/Lax4game/OST-Manifest-Store/main/manifests/${att.name}`);
          
          const match = att.name.match(/^(\d+)_/);
          if (match) attachedDepotIds.push(match[1]);
        }
      }

      let foundKeys = 0;

      if (!luaUrl) {
        const keysData = JSON.parse(fs.readFileSync(keysPath, 'utf8'));

        if (attachedDepotIds.length > 0) {
          for (const dId of attachedDepotIds) {
            if (keysData[dId]) {
              luaContent += `addappid(${dId}, 1, "${keysData[dId]}")\n`;
              foundKeys++;
            }
          }
        } else {
          for (let i = 1; i <= 30; i++) {
            const depotId = (appId + i).toString();
            if (keysData[depotId]) {
              luaContent += `addappid(${depotId}, 1, "${keysData[depotId]}")\n`;
              foundKeys++;
            }
          }
        }

        if (foundKeys === 0) {
          await loadingMsg.edit(`⚠️ Kho O.S.T chưa có Key. Đang tự động cào dữ liệu từ các kho tàng cộng đồng lớn...`);
          const externalData = await fetchExternalDepotData(appId, repoPath);
          if (externalData.success) {
            luaUrl = externalData.luaUrl || '';
            manifestUrls = manifestUrls.concat(externalData.manifestUrls || []);
            foundKeys = "Nhiều (Kéo từ Cộng Đồng)";
          } else {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            return loadingMsg.edit(`❌ **Thất bại.**\nĐã quét toàn bộ kho cộng đồng nhưng vẫn chưa có dữ liệu cho tựa game **${gameName}**. Vui lòng tải thủ công file \`.lua\` lên nhé!`);
          }
        } else {
          const luaFileName = `${appId}.lua`;
          fs.writeFileSync(path.join(repoPath, 'lua', luaFileName), luaContent);
          luaUrl = `https://raw.githubusercontent.com/Lax4game/OST-Manifest-Store/main/lua/${luaFileName}`;
        }
      }

      games = games.filter(g => g.appId.toString() !== appId.toString());
      games.push({
        appId: appId,
        name: gameName,
        cover: gameCover,
        luaUrl: luaUrl,
        manifestUrls: manifestUrls
      });

      fs.writeFileSync(jsonPath, JSON.stringify(games, null, 2));

      await loadingMsg.edit(`🚀 Đang tải dữ liệu **${gameName}** lên Chợ VIP...`);
      
      const gitCmd = `cd "${repoPath}" && git config user.name "O.S.T Bot" && git config user.email "bot@ost.com" && git add . && git commit -m "Auto add ${gameName}" && git push`;
      execSync(gitCmd);
      
      let successMsg = `✅ **Thêm tựa game thành công!**\n🎮 Tên Game: **${gameName}**\n`;
      if (luaUrl && foundKeys > 0) successMsg += `🔑 Chế độ: Tự sinh file Lua (${foundKeys} Key)\n`;
      else if (luaUrl) successMsg += `📜 Chế độ: Tải file Lua thủ công\n`;
      if (manifestUrls.length > 0) successMsg += `📦 Đính kèm: ${manifestUrls.length} file Manifest\n`;
      
      loadingMsg.edit(successMsg + `Khách hàng hiện đã có thể truy cập tựa game này qua O.S.T Manager!`);
      
      notifyTelegram(`🚀 <b>ADMIN VỪA THÊM GAME MỚI</b>\n🎮 Tên Game: <b>${gameName}</b>\n🛠 AppID: <code>${appId}</code>\n👨‍💻 Người thêm: <code>${message.author.tag}</code>`);
      
      const NEW_GAME_CHANNEL_ID = '1518618101892251758';
      try {
        const channel = await client.channels.fetch(NEW_GAME_CHANNEL_ID);
        const embed = new EmbedBuilder()
          .setColor(0x00FF00) // Green
          .setTitle('🎉 CẬP NHẬT GAME MỚI VÀO CHỢ O.S.T')
          .setThumbnail(gameCover)
          .addFields(
            { name: "🎮 Tên Game", value: `**${gameName}**`, inline: false },
            { name: "🛠 AppID", value: `${appId}`, inline: true },
            { name: "👨‍💻 Thêm bởi", value: `<@${message.author.id}>`, inline: true }
          )
          .setFooter({ text: 'Hãy mở O.S.T Manager để cài đặt ngay!' })
          .setTimestamp();
        await channel.send({ content: '@everyone **Có game mới đổ bộ anh em ơi!** 🚀', embeds: [embed] });
      } catch (err) {
        console.error('Không thể gửi thông báo game mới vào kênh:', err);
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });

    } catch (e) {
      console.error(e);
      message.reply('❌ Có lỗi hệ thống: ' + e.message);
    }
  }

  // Lệnh yêu cầu thêm game (Dành cho thành viên)
  if (message.content.startsWith('!requestgame')) {
    const args = message.content.split(' ').slice(1);
    if (args.length === 0) {
      return message.reply('❌ **Sử dụng sai cú pháp!**\nVui lòng dùng: `!requestgame <AppID> [Tên Game]`\n*Ví dụ: `!requestgame 1091500 Cyberpunk 2077`*');
    }
    const appId = args[0];
    const gameName = args.slice(1).join(' ') || 'Không rõ tên';
    
    // Gửi thông báo đến Kênh Discord (hoặc Telegram nếu không có cấu hình kênh)
    const REQUEST_CHANNEL_ID = '1518618102479323181';
    
    if (REQUEST_CHANNEL_ID && REQUEST_CHANNEL_ID !== 'YOUR_DISCORD_CHANNEL_ID_HERE') {
      try {
        const channel = await client.channels.fetch(REQUEST_CHANNEL_ID);
        const embed = new EmbedBuilder()
          .setColor(0x00A8FF) // Blue
          .setTitle('📝 YÊU CẦU THÊM GAME (TỪ SERVER)')
          .addFields(
            { name: "🎮 Tên Game", value: gameName, inline: true },
            { name: "🛠 AppID", value: appId, inline: true },
            { name: "👤 Người gửi", value: `<@${message.author.id}>`, inline: false }
          )
          .setTimestamp();
        await channel.send({ embeds: [embed] });
      } catch (err) {
        console.error('Không thể gửi request vào kênh:', err);
      }
    } else {
      // Fallback
      notifyTelegram(`📝 <b>YÊU CẦU THÊM GAME MỚI TỪ DISCORD</b>\n🎮 Tên Game: <b>${gameName}</b>\n🛠 AppID: <code>${appId}</code>\n👤 User: <code>${message.author.tag}</code>`);
    }
    
    return message.reply(`✅ Đã gửi yêu cầu thêm game **${gameName}** (AppID: \`${appId}\`) tới Ban Quản Trị!\nVui lòng chờ Admin kiểm tra và cập nhật lên Chợ Game.`);
  }
});

// Xử lý khi bấm nút Mua VIP
client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;
    const userId = interaction.user.id;

    if (commandName === 'getkey') {
      const cooldowns = getCooldowns();
      const lastUse = cooldowns[userId]?.getkey || 0;
      const now = Date.now();
      const ONE_DAY = 24 * 60 * 60 * 1000;

      if (now - lastUse < ONE_DAY) {
        const remainingHours = Math.ceil((ONE_DAY - (now - lastUse)) / (1000 * 60 * 60));
        return interaction.reply(`⏳ **Bạn đã lấy Key hôm nay rồi!**\nVui lòng quay lại sau **${remainingHours} giờ** nữa để nhận Key mới nhé. Tránh lách luật nha! 😎`);
      }

      try {
        const key = generateKey('CASUAL', userId, 1);
        if (!cooldowns[userId]) cooldowns[userId] = {};
        cooldowns[userId].getkey = now;
        saveCooldowns(cooldowns);

        await interaction.reply(`✅ **Tạo Key CASUAL Thành Công!**\n\n🔑 Key: \`${key}\`\n⏳ Thời hạn: **24 Giờ**\n🔓 Mở khóa: Các tính năng cơ bản.\n*Dán Key vào O.S.T Manager để truy cập.*`);
        notifyTelegram(`🔔 <b>MỚI LẤY KEY CASUAL (Lệnh Menu)</b>\n👤 Khách: <code>${interaction.user.tag}</code> (ID: ${userId})\n🔑 Key: <code>${key}</code>`);
      } catch (error) {
        interaction.reply('❌ Có lỗi xảy ra!');
      }
    }

    if (commandName === 'buyvip') {
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('buy_vip_1')
            .setLabel('VIP 1 Ngày (10.000 VNĐ)')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('buy_vip_7')
            .setLabel('VIP 7 Ngày (50.000 VNĐ)')
            .setStyle(ButtonStyle.Success),
        );
      await interaction.reply({
        content: '💎 **CHỌN GÓI VIP BẠN MUỐN MUA:**\n(Mở khóa Denuvo Ticket Extractor)',
        components: [row]
      });
    }
    
    if (commandName === 'addgame') {
      const hasAdminPerm = interaction.member && interaction.member.permissions.has('Administrator');
      const hasSpecificRole = interaction.member && interaction.member.roles.cache.some(role => role.name === ADMIN_ROLE_NAME);
      
      if (!hasAdminPerm && !hasSpecificRole) {
        return interaction.reply({ content: '❌ Bạn không có quyền sử dụng lệnh này!', ephemeral: true });
      }

      const appId = interaction.options.getInteger('appid');
      
      const fs = require('fs');
      const path = require('path');
      const { execSync } = require('child_process');
      const os = require('os');
      const axios = require('axios');

      const githubToken = process.env.GITHUB_TOKEN;
      if (!githubToken) {
        return interaction.reply({ content: '❌ Lỗi hệ thống: Chưa cấu hình GITHUB_TOKEN trên Render.', ephemeral: true });
      }

      const keysPath = path.resolve(__dirname, 'depotkeys.json');
      if (!fs.existsSync(keysPath)) {
        return interaction.reply({ content: '❌ Lỗi hệ thống: Không tìm thấy file depotkeys.json.', ephemeral: true });
      }

      await interaction.reply(`🔄 Đang chuẩn bị dữ liệu cho AppID **${appId}**...`);
      const tmpDir = path.join(os.tmpdir(), `ost_repo_slash_${appId}_${Date.now()}`);
      const repoUrl = `https://Lax4game:${githubToken}@github.com/Lax4game/OST-Manifest-Store.git`;

      try {
        execSync(`git clone ${repoUrl} "${tmpDir}"`);
      } catch (err) {
        return interaction.editReply('❌ Lỗi: Không thể kết nối tới Github (Sai Token hoặc Repo không tồn tại).');
      }

      const repoPath = tmpDir;
      const jsonPath = path.join(repoPath, 'games.json');

      try {
        let games = fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, 'utf8')) : [];
        const isExist = games.some(g => g.appId.toString() === appId.toString());
        if (isExist) {
          fs.rmSync(tmpDir, { recursive: true, force: true });
          return interaction.editReply(`⚠️ **Game này đã có sẵn trên Chợ VIP rồi!**\nNếu có cập nhật mới, vui lòng xóa file trên Github trước.`);
        }

        const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appId}`);
        const steamData = steamRes.data[appId];
        
        let gameName = `Game ${appId}`;
        let gameCover = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;

        if (steamData && steamData.success) {
          gameName = steamData.data.name;
          if (steamData.data.header_image) gameCover = steamData.data.header_image;
        }
        
        let luaUrl = '';
        let luaContent = `-- Auto-generated by O.S.T Manager Bot\naddappid(${appId})\n`;

        if (!fs.existsSync(path.join(repoPath, 'lua'))) fs.mkdirSync(path.join(repoPath, 'lua'), { recursive: true });

        let foundKeys = 0;
        const keysData = JSON.parse(fs.readFileSync(keysPath, 'utf8'));

        for (let i = 1; i <= 30; i++) {
          const depotId = (appId + i).toString();
          if (keysData[depotId]) {
            luaContent += `addappid(${depotId}, 1, "${keysData[depotId]}")\n`;
            foundKeys++;
          }
        }

        let manifestUrls = [];
        if (foundKeys === 0) {
          await interaction.editReply(`⚠️ Kho O.S.T chưa có Key. Đang bật chế độ "Cào Dữ Liệu" từ các kho tàng cộng đồng lớn...`);
          const externalData = await fetchExternalDepotData(appId, repoPath);
          if (externalData.success) {
            luaUrl = externalData.luaUrl || '';
            manifestUrls = externalData.manifestUrls || [];
            foundKeys = "Nhiều (Kéo từ Cộng Đồng)";
          } else {
            fs.rmSync(tmpDir, { recursive: true, force: true });
            return interaction.editReply(`❌ **Thất bại.**\nĐã cào dữ liệu toàn cầu nhưng không có kho nào chứa Key giải mã cho tựa game **${gameName}**.\n*(Mẹo: Dùng lệnh gõ tay \`/addgame <AppID>\` và đính kèm file \`.lua\` để tải thủ công)*`);
          }
        } else {
          const luaFileName = `${appId}.lua`;
          fs.writeFileSync(path.join(repoPath, 'lua', luaFileName), luaContent);
          luaUrl = `https://raw.githubusercontent.com/Lax4game/OST-Manifest-Store/main/lua/${luaFileName}`;
        }

        games = games.filter(g => g.appId.toString() !== appId.toString());
        games.push({
          appId: appId,
          name: gameName,
          cover: gameCover,
          luaUrl: luaUrl,
          manifestUrls: manifestUrls
        });

        fs.writeFileSync(jsonPath, JSON.stringify(games, null, 2));

        await interaction.editReply(`🚀 Đang tải dữ liệu **${gameName}** lên Chợ VIP...`);
        
        const gitCmd = `cd "${repoPath}" && git config user.name "O.S.T Bot" && git config user.email "bot@ost.com" && git add . && git commit -m "Auto add ${gameName} via SlashCommand" && git push`;
        execSync(gitCmd);
        
        let successMsg = `✅ **Thêm tựa game thành công!**\n🎮 Tên Game: **${gameName}**\n🔑 Chế độ: Tự sinh file Lua (${foundKeys} Key)\n`;
        
        interaction.editReply(successMsg + `Khách hàng hiện đã có thể truy cập tựa game này qua O.S.T Manager!`);
        
        notifyTelegram(`🚀 <b>ADMIN VỪA THÊM GAME MỚI (SLASH MENU)</b>\n🎮 Tên Game: <b>${gameName}</b>\n🛠 AppID: <code>${appId}</code>\n👨‍💻 Người thêm: <code>${interaction.user.tag}</code>`);
        
        const NEW_GAME_CHANNEL_ID = '1518618101892251758';
        try {
          const channel = await client.channels.fetch(NEW_GAME_CHANNEL_ID);
          const embed = new EmbedBuilder()
            .setColor(0x00FF00) // Green
            .setTitle('🎉 CẬP NHẬT GAME MỚI VÀO CHỢ O.S.T')
            .setThumbnail(gameCover)
            .addFields(
              { name: "🎮 Tên Game", value: `**${gameName}**`, inline: false },
              { name: "🛠 AppID", value: `${appId}`, inline: true },
              { name: "👨‍💻 Thêm bởi", value: `<@${interaction.user.id}>`, inline: true }
            )
            .setFooter({ text: 'Hãy mở O.S.T Manager để cài đặt ngay!' })
            .setTimestamp();
          await channel.send({ content: '**Có game mới đổ bộ anh em ơi!** 🚀', embeds: [embed] });
        } catch (err) {
          console.error('Không thể gửi thông báo game mới vào kênh:', err);
        }
      } catch (error) {
        console.error('Lỗi khi thêm game qua Slash Command:', error);
        interaction.editReply('❌ Có lỗi xảy ra khi xử lý hoặc tải dữ liệu lên Github!');
      } finally {
        if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
      }
      return;
    }
  }

  if (!interaction.isButton()) return;

  if (interaction.customId.startsWith('buy_vip_')) {
    const userId = interaction.user.id;
    
    // Kiểm tra Cooldown khi bấm nút
    const cooldowns = getCooldowns();
    const lastUse = cooldowns[userId]?.buyvip || 0;
    const now = Date.now();
    const TEN_MINS = 10 * 60 * 1000;

    if (now - lastUse < TEN_MINS) {
      const remainingMins = Math.ceil((TEN_MINS - (now - lastUse)) / (1000 * 60));
      return interaction.reply({ content: `⏳ **Bạn vừa tạo đơn hàng rồi!**\nVui lòng chờ **${remainingMins} phút** nữa để tạo đơn mới (Tránh spam đơn ảo).`, ephemeral: true });
    }

    // Lưu thời gian tạo đơn
    if (!cooldowns[userId]) cooldowns[userId] = {};
    cooldowns[userId].buyvip = now;
    saveCooldowns(cooldowns);

    const days = parseInt(interaction.customId.split('_')[2]);
    const amount = days === 1 ? 10000 : 50000;
    
    // Tạo mã đơn hàng độc nhất (Ví dụ: OSTXXXX)
    const orderId = 'OST' + Math.floor(1000 + Math.random() * 9000);
    
    // Lưu vào pending
    pendingOrders.set(orderId, {
      userId: interaction.user.id,
      type: 'VIP',
      days: days,
      amount: amount,
      message: interaction.message
    });

    // Xóa order sau 10 phút nếu không thanh toán
    setTimeout(() => pendingOrders.delete(orderId), 10 * 60 * 1000);

    const qrUrl = `https://qr.sepay.vn/img?acc=${BANK_ACCOUNT}&bank=${BANK_ID}&amount=${amount}&des=${orderId}&name=${encodeURIComponent(ACCOUNT_NAME)}`;

    const embed = new EmbedBuilder()
      .setColor(0x00FF00)
      .setTitle(`THANH TOÁN VIP ${days} NGÀY`)
      .setDescription(`Để hoàn tất, vui lòng chuyển khoản theo thông tin dưới đây:\n\n💳 **Ngân hàng:** ${BANK_ID}\n🔢 **STK:** \`${BANK_ACCOUNT}\`\n💰 **Số tiền:** \`${amount.toLocaleString()} VNĐ\`\n📝 **Nội dung CK:** \`${orderId}\`\n\n*(Hệ thống sẽ tự động cấp Key sau 10-30s kể từ khi CK thành công!)*`)
      .setImage(qrUrl)
      .setFooter({ text: 'Đơn hàng tự động hủy sau 10 phút.' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

const AdmZip = require('adm-zip');

async function fetchExternalDepotData(appId, repoPath) {
  const sources = [
    `https://cysaw.top/uploads/${appId}.zip`,
    `https://steambox.gdata.fun/cnhz/qingdan/${appId}.zip`,
    `https://api.printedwaste.com/gfk/download/${appId}`
  ];

  for (const url of sources) {
    try {
      console.log(`Đang cào dữ liệu từ kho: ${url}`);
      let headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' };
      if (url.includes('printedwaste.com')) {
        headers['Authorization'] = 'Bearer dGhpc19pcyBhX3JhbmRvbV90b2tlbg==';
      }
      
      const axios = require('axios');
      const response = await axios.get(url, { responseType: 'arraybuffer', headers, timeout: 15000 });
      const buffer = Buffer.from(response.data);
      const zip = new AdmZip(buffer);
      const zipEntries = zip.getEntries();
      
      let foundSomething = false;
      let luaContent = '';
      let manifestUrls = [];

      const fs = require('fs');
      const path = require('path');
      if (!fs.existsSync(path.join(repoPath, 'lua'))) fs.mkdirSync(path.join(repoPath, 'lua'), { recursive: true });
      if (!fs.existsSync(path.join(repoPath, 'manifests'))) fs.mkdirSync(path.join(repoPath, 'manifests'), { recursive: true });

      zipEntries.forEach(function (zipEntry) {
        if (zipEntry.name.endsWith('.lua')) {
           luaContent = zipEntry.getData().toString('utf8');
           fs.writeFileSync(path.join(repoPath, 'lua', `${appId}.lua`), luaContent);
           foundSomething = true;
        } else if (zipEntry.name.endsWith('.manifest')) {
           fs.writeFileSync(path.join(repoPath, 'manifests', zipEntry.name), zipEntry.getData());
           manifestUrls.push(`https://raw.githubusercontent.com/Lax4game/OST-Manifest-Store/main/manifests/${zipEntry.name}`);
           foundSomething = true;
        }
      });
      
      if (foundSomething) {
        let luaUrl = luaContent ? `https://raw.githubusercontent.com/Lax4game/OST-Manifest-Store/main/lua/${appId}.lua` : '';
        return { success: true, luaUrl, manifestUrls };
      }
    } catch (e) {
      console.log(`Kho ${url} không có dữ liệu (hoặc lỗi). Bỏ qua.`);
    }
  }

  // Nếu 3 kho API sập, chuyển sang cào dữ liệu trực tiếp từ các kho Github (Auiowu, ikun0014)
  const githubRepos = ['Auiowu/ManifestAutoUpdate', 'tymolu233/ManifestAutoUpdate', 'ikun0014/ManifestHub'];
  for (const repo of githubRepos) {
    try {
      console.log(`Đang cào dữ liệu từ Github Repo: ${repo}`);
      const axios = require('axios');
      const treeUrl = `https://api.github.com/repos/${repo}/branches/${appId}`;
      const branchRes = await axios.get(treeUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
      
      const treeApi = branchRes.data.commit.commit.tree.url;
      const treeRes = await axios.get(treeApi, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 10000 });
      
      const files = treeRes.data.tree;
      const keyFile = files.find(f => f.path.toLowerCase() === 'key.vdf');
      const manifestFiles = files.filter(f => f.path.endsWith('.manifest'));
      
      if (keyFile) {
        const keyUrl = `https://raw.githubusercontent.com/${repo}/${appId}/${keyFile.path}`;
        const keyRes = await axios.get(keyUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
        const vdfContent = keyRes.data;
        
        let luaContent = `-- Auto-generated from ${repo}\naddappid(${appId})\n`;
        const regex = /"(\d+)"\s*\{\s*"DecryptionKey"\s*"([a-f0-9]+)"/gi;
        let match;
        let foundKeysCount = 0;
        while ((match = regex.exec(vdfContent)) !== null) {
            luaContent += `addappid(${match[1]}, 1, "${match[2]}")\n`;
            foundKeysCount++;
        }
        
        if (foundKeysCount > 0) {
          const fs = require('fs');
          const path = require('path');
          if (!fs.existsSync(path.join(repoPath, 'lua'))) fs.mkdirSync(path.join(repoPath, 'lua'), { recursive: true });
          if (!fs.existsSync(path.join(repoPath, 'manifests'))) fs.mkdirSync(path.join(repoPath, 'manifests'), { recursive: true });
          
          fs.writeFileSync(path.join(repoPath, 'lua', `${appId}.lua`), luaContent);
          
          let manifestUrls = [];
          for (const m of manifestFiles) {
             const mUrl = `https://raw.githubusercontent.com/${repo}/${appId}/${m.path}`;
             const mRes = await axios.get(mUrl, { responseType: 'arraybuffer', headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 });
             fs.writeFileSync(path.join(repoPath, 'manifests', m.path), Buffer.from(mRes.data));
             manifestUrls.push(`https://raw.githubusercontent.com/Lax4game/OST-Manifest-Store/main/manifests/${m.path}`);
          }
          
          let luaUrl = `https://raw.githubusercontent.com/Lax4game/OST-Manifest-Store/main/lua/${appId}.lua`;
          return { success: true, luaUrl, manifestUrls };
        }
      }
    } catch (e) {
      console.log(`Github Repo ${repo} không có dữ liệu. Bỏ qua.`);
    }
  }

  return { success: false };
}

client.login(TOKEN);

// Server giả lập (Keep-alive cho hosting miễn phí Render / Koyeb)
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('O.S.T Discord Bot is running smoothly!'));
app.listen(PORT, () => console.log(`[SERVER] Đang lắng nghe trên cổng ${PORT} để Keep-Alive`));
