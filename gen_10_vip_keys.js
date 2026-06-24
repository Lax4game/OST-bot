const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://kchbrgibkvwgbhmeanzw.supabase.co';
const SUPABASE_KEY = 'sb_publishable_UJ4As6EIogrEdc3BYjaUrg_cXs9OGwN';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const SECRET = 'OST_SECRET_KEY_2026_!@#';

function generateKey(type, discordId, days) {
  const exp = Math.floor(Date.now() / 1000) + (days * 24 * 60 * 60);
  
  const expBuffer = Buffer.alloc(4);
  expBuffer.writeUInt32BE(exp);
  
  const typeByte = type === 'VIP' ? 1 : 0;
  const typeBuffer = Buffer.from([typeByte]);
  
  const discordIdBuffer = Buffer.alloc(8);
  discordIdBuffer.writeBigUInt64BE(BigInt(discordId || 0));
  
  const randomBuffer = crypto.randomBytes(2);
  const payload = Buffer.concat([expBuffer, typeBuffer, discordIdBuffer, randomBuffer]);
  
  const hmac = crypto.createHmac('sha256', SECRET).update(payload).digest();
  const signature = hmac.subarray(0, 3);
  
  const finalBuffer = Buffer.concat([payload, signature]);
  const hex = finalBuffer.toString('hex').toUpperCase();
  
  return 'OST-' + hex.match(/.{1,4}/g).join('-');
}

async function create10VIPKeys() {
  console.log('Đang tạo 10 VIP keys thời hạn 1000 ngày...');
  const keys = [];
  const expDate = new Date(Date.now() + 1000 * 24 * 60 * 60 * 1000);
  
  for (let i = 0; i < 10; i++) {
    // Generate key with discordId '0' (so any mod can use it)
    const key = generateKey('VIP', '0', 1000);
    keys.push(key);
    
    // Insert into Supabase
    await supabase.from('license_keys').insert([{
      key_string: key,
      discord_id: null, // Allow any user to redeem
      hwid: null,
      type: 'VIP',
      exp_date: expDate.toISOString()
    }]);
  }
  
  console.log('\n--- DANH SÁCH 10 KEY VIP (1000 NGÀY) ---');
  keys.forEach((k, idx) => console.log(`${idx + 1}. ${k}`));
  console.log('----------------------------------------\n');
  console.log('Đã lưu toàn bộ vào CSDL Supabase thành công!');
}

create10VIPKeys();
