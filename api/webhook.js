// api/webhook.js
// Webhook ที่เชื่อมต่อกับ Firebase เพื่อติดตามลูกค้า

const { saveCustomerTracking, saveConversation } = require('../lib/firebase');

module.exports = async (req, res) => {
  // --- จัดการ GET Request สำหรับการ Verify ---
  if (req.method === 'GET') {
    const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // เพิ่ม debug logs
    console.log('VERIFY_TOKEN from env:', VERIFY_TOKEN);
    console.log('Token from request:', token);
    console.log('Mode:', mode);
    console.log('Challenge:', challenge);

    if (mode && token) {
      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('WEBHOOK_VERIFIED');
        res.status(200).send(challenge);
      } else {
        console.log('Token mismatch or wrong mode');
        console.log('Expected token:', VERIFY_TOKEN);
        console.log('Received token:', token);
        res.status(403).send('Forbidden');
      }
    } else {
      console.log('Missing mode or token');
      res.status(400).send('Bad Request');
    }
  }
  // --- ส่วน POST Request เหมือนเดิม ---
  else if (req.method === 'POST') {
    const body = req.body;

    console.log('Received webhook event:', JSON.stringify(body, null, 2));

    if (body.object === 'page') {
      for (const entry of body.entry) {
        if (entry.messaging) {
          for (const webhook_event of entry.messaging) {
            const sender_psid = webhook_event.sender.id;
            
            try {
              // === ติดตาม UTM/Referral Data ===
              await trackCustomerSource(sender_psid, webhook_event);
              
              // === บันทึกข้อความ ===
              if (webhook_event.message) {
                await trackConversation(sender_psid, webhook_event.message, 'user', webhook_event.timestamp);
              }
              
            } catch (error) {
              console.error('❌ Error processing webhook event:', error);
            }
          }
        }
      }

      res.status(200).send('EVENT_RECEIVED');
    } else {
      res.status(404).send('Not Found');
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};

