// api/data.js
import fetch from 'node-fetch';

// นี่คือ Serverless Function ของเรา
export default async function handler(request, response) {
  // 1. ดึง Access Token และ Ad Account ID ที่เก็บไว้อย่างปลอดภัย
  const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
  const AD_ACCOUNT_ID = process.env.FB_AD_ACCOUNT_ID;

  // 2. สร้าง URL สำหรับยิงไปที่ Facebook Graph API
  const url = `https://graph.facebook.com/v19.0/${AD_ACCOUNT_ID}/campaigns?fields=name,status,insights{spend,clicks,impressions}&access_token=${FB_ACCESS_TOKEN}`;

  try {
    // 3. ยิง API ไปที่ Facebook
    const facebookResponse = await fetch(url);
    const data = await facebookResponse.json();

    // 4. ตั้งค่า CORS Header (สำคัญมาก!) เพื่ออนุญาตให้ React App ของคุณเรียกใช้ API นี้ได้
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

    // 5. ส่งข้อมูลที่ได้จาก Facebook กลับไปเป็นคำตอบ
    response.status(200).json(data);

  } catch (error) {
    // จัดการกรณีเกิดข้อผิดพลาด
    response.status(500).json({ error: 'Failed to fetch data from Facebook API' });
  }
}