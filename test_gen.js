const crypto = require('crypto');
const SECRET = 'OST_SECRET_KEY_2026_!@#';

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

const testKey = generateKey('VIP', '1518618102479323181', 30);
console.log(testKey);
