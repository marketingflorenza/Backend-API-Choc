// api/webhook.js
// ชั่วคราว - ปิด Firebase เพื่อทดสอบ verification

// const { saveCustomerTracking, saveConversation } = require('../lib/firebase');

module.exports = async (req, res) => {
  // --- จัดการ GET Request สำหรับการ Verify ---
  if (req.method === 'GET') {
    const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('VERIFY_TOKEN from env:', VERIFY_TOKEN);
    console.log('Token from request:', token);
    console.log('Mode:', mode);

    if (mode && token) {
      if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('WEBHOOK_VERIFIED');
        res.status(200).send(challenge);
      } else {
        console.log('Token mismatch');
        res.status(403).send('Forbidden');
      }
    } else {
      res.status(400).send('Bad Request');
    }
  }
  // --- POST Request ชั่วคราว ---
  else if (req.method === 'POST') {
    const body = req.body;
    console.log('Received webhook event:', JSON.stringify(body, null, 2));
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.setHeader('Allow', ['GET', 'POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
};