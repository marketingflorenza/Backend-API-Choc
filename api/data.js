export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const accessToken = process.env.FB_ACCESS_TOKEN;
    const adAccountId = process.env.AD_ACCOUNT_ID;

    if (!accessToken || !adAccountId) {
      return res.status(500).json({ 
        error: 'Missing environment variables'
      });
    }

    // ใช้ fetch แทน Facebook SDK เพื่อหลีกเลี่ยง import error
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${adAccountId}/campaigns?access_token=${accessToken}&fields=id,name,status`
    );

    if (!response.ok) {
      throw new Error(`Facebook API error: ${response.status}`);
    }

    const data = await response.json();

    res.status(200).json({
      success: true,
      message: 'Facebook API working',
      data: {
        campaigns: data.data || [],
        total: data.data ? data.data.length : 0,
        paging: data.paging || null
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      error: error.message,
      details: 'Check logs for more info'
    });
  }
}