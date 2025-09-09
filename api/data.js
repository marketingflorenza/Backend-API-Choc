export default async function handler(request, response) {
  try {
    if (request.method !== 'GET') {
      return response.status(405).json({ error: 'Method not allowed' });
    }

    const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
    const AD_ACCOUNT_ID = process.env.FB_AD_ACCOUNT_ID;
    
    if (!FB_ACCESS_TOKEN || !AD_ACCOUNT_ID) {
      return response.status(500).json({ 
        error: 'Missing environment variables'
      });
    }

    const url = `https://graph.facebook.com/v19.0/${AD_ACCOUNT_ID}/campaigns?fields=name,status,insights{spend,clicks,impressions}&access_token=${FB_ACCESS_TOKEN}`;
    
    // ใช้ fetch built-in ของ Vercel (ไม่ต้อง import)
    const facebookResponse = await fetch(url);
    
    if (!facebookResponse.ok) {
      const errorText = await facebookResponse.text();
      return response.status(facebookResponse.status).json({
        error: 'Facebook API error',
        status: facebookResponse.status,
        message: errorText
      });
    }
    
    const data = await facebookResponse.json();
    
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    
    return response.status(200).json(data);
    
  } catch (error) {
    console.error('Error:', error);
    return response.status(500).json({ 
      error: 'Function failed',
      message: error.message
    });
  }
}