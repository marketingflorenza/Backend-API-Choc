// api/data.js
const fetch = require('node-fetch');

const accessToken = process.env.FB_ACCESS_TOKEN;
const adAccountId = process.env.AD_ACCOUNT_ID;

module.exports = async (req, res) => {
  // 1. ตรวจสอบว่าได้ตั้งค่า Environment Variables ครบถ้วนหรือไม่
  if (!accessToken || !adAccountId) {
    console.error('Server Error: Missing FB_ACCESS_TOKEN or AD_ACCOUNT_ID in Vercel Environment Variables.');
    return res.status(500).json({ 
      error: 'API credentials are not configured on the server.',
      message: 'Please contact the administrator.' 
    });
  }

  const url = `https://graph.facebook.com/v18.0/${adAccountId}/campaigns?fields=name,status,insights{spend,clicks,impressions}&access_token=${accessToken}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    // 2. ตรวจสอบว่า Facebook API ส่ง Error กลับมาหรือไม่
    if (data.error) {
      // Log error ที่ได้รับจาก Facebook ทั้งหมดออกมา เพื่อการดีบักที่ง่ายขึ้น
      console.error('Facebook API Error Response:', JSON.stringify(data.error, null, 2));
      
      // ส่งข้อความ error ที่ชัดเจนกลับไป
      return res.status(500).json({ 
        error: 'An error occurred while fetching data from Facebook.',
        details: data.error.message 
      });
    }

    // 3. ถ้าทุกอย่างถูกต้อง ให้ส่งข้อมูลกลับไป
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);

  } catch (error) {
    // 4. ดักจับ Error ที่เกิดจากการเชื่อมต่อ (เช่น network error)
    console.error('Server-side fetch failed:', error);
    res.status(500).json({ 
      error: 'Failed to connect to Facebook API.',
      details: error.message 
    });
  }
};

