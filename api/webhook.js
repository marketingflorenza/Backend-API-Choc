// api/webhook.js

// Webhook นี้จะจัดการ 2 อย่าง:
// 1. GET Request: สำหรับการยืนยันตัวตนครั้งแรกกับ Facebook
// 2. POST Request: สำหรับรับข้อความและ event ต่างๆ จากผู้ใช้

module.exports = (req, res) => {
  // --- จัดการ GET Request สำหรับการ Verify ---
  if (req.method === 'GET') {
    // Token ที่เราจะตั้งเองใน Vercel และนำไปใส่ใน Facebook Developer Dashboard
    // เพื่อยืนยันว่าเป็นเราจริงๆ
    const VERIFY_TOKEN = process.env.MESSENGER_VERIFY_TOKEN;

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // ตรวจสอบว่ามี mode และ token ถูกส่งมาหรือไม่
    if (mode && token) {
      // ตรวจสอบว่า mode คือ 'subscribe' และ token ตรงกับที่เราตั้งไว้
      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('WEBHOOK_VERIFIED');
        res.status(200).send(challenge);
      } else {
        // ถ้าไม่ตรงกัน ให้ส่งสถานะ 403 Forbidden
        res.status(403).send('Forbidden');
      }
    } else {
      res.status(400).send('Bad Request'); // Bad Request
    }
  }
  // --- จัดการ POST Request สำหรับรับข้อความ ---
  else if (req.method === 'POST') {
    const body = req.body;

    console.log('Received webhook event:', JSON.stringify(body, null, 2));

    // ตรวจสอบว่า event มาจาก Page Subscription
    if (body.object === 'page') {
      // วนลูปผ่าน entry แต่ละอัน (อาจมีหลายอันถ้าส่งมาพร้อมกัน)
      body.entry.forEach(function(entry) {
        // รับข้อความจาก event
        const webhook_event = entry.messaging[0];
        console.log(webhook_event);

        // ดึง Sender PSID
        const sender_psid = webhook_event.sender.id;
        console.log('Sender PSID: ' + sender_psid);
      });

      // ตอบกลับด้วย 200 OK เพื่อบอก Facebook ว่าได้รับข้อมูลแล้ว
      res.status(200).send('EVENT_RECEIVED');
    } else {
      // ถ้าไม่ใช่ event จาก page subscription ให้ส่ง 404 Not Found
      res.status(404).send('Not Found');
    }
  } else {
    // ถ้าไม่ใช่ GET หรือ POST
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};

