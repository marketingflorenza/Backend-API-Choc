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
    // Get environment variables
    const accessToken = process.env.FB_ACCESS_TOKEN;
    const adAccountId = process.env.AD_ACCOUNT_ID;

    // Validate environment variables
    if (!accessToken) {
      return res.status(500).json({ 
        error: 'Missing FB_ACCESS_TOKEN in environment variables'
      });
    }

    if (!adAccountId) {
      return res.status(500).json({ 
        error: 'Missing AD_ACCOUNT_ID in environment variables'
      });
    }

    // Simple response first (without Facebook SDK)
    res.status(200).json({
      success: true,
      message: 'API is working',
      data: {
        accessToken: accessToken ? 'Set' : 'Not Set',
        adAccountId: adAccountId ? 'Set' : 'Not Set',
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message
    });
  }
}