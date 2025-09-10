// api/data.js

// ใช้ node-fetch เวอร์ชัน 2 เนื่องจากมีความเข้ากันได้ดีกับ CommonJS
const fetch = require('node-fetch');

const accessToken = process.env.FB_ACCESS_TOKEN; // ควรเก็บ Access Token ใน Environment Variables ของ Vercel
const adAccountId = process.env.AD_ACCOUNT_ID; // ควรเก็บ Ad Account ID ใน Environment Variables

export default async function handler(req, res) {
  // ตรวจสอบว่ามี Access Token และ Ad Account ID หรือไม่
  if (!accessToken || !adAccountId) {
    return res.status(500).json({ error: 'Facebook API credentials are not configured.' });
  }

  // URL สำหรับเรียกข้อมูลแคมเปญจาก Facebook Graph API
  const url = `https://graph.facebook.com/v18.0/${adAccountId}/campaigns?fields=name,status,insights{spend,clicks,impressions}&access_token=${accessToken}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    // หาก Facebook API ส่ง error กลับมา
    if (data.error) {
      console.error('Facebook API Error:', data.error);
      return res.status(500).json({ error: data.error.message });
    }

    // ส่งข้อมูล `data` ที่เป็น Array กลับไปโดยตรง
    // โครงสร้างที่ Frontend คาดหวังคือ { "data": [...] }
    res.setHeader('Access-Control-Allow-Origin', '*'); // อนุญาตให้โดเมนอื่นเรียกใช้ API นี้ได้
    res.status(200).json(data);

  } catch (error) {
    console.error('Server-side fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch data from Facebook API.' });
  }
}
