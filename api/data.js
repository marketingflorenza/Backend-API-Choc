// api/data.js
const fetch = require('node-fetch');

const accessToken = process.env.FB_ACCESS_TOKEN;
const adAccountId = process.env.AD_ACCOUNT_ID;

// This function handles the actual API logic
async function handleRequest(req, res) {
  if (!accessToken || !adAccountId) {
    console.error('Server Error: Missing FB_ACCESS_TOKEN or AD_ACCOUNT_ID.');
    return res.status(500).json({ 
      error: 'API credentials are not configured on the server.'
    });
  }

  const url = `https://graph.facebook.com/v18.0/${adAccountId}/campaigns?fields=name,status,insights{spend,clicks,impressions}&access_token=${accessToken}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error('Facebook API Error:', JSON.stringify(data.error, null, 2));
      return res.status(500).json({ 
        error: 'An error occurred while fetching from Facebook.',
        details: data.error.message 
      });
    }
    
    return res.status(200).json(data);

  } catch (error) {
    console.error('Server-side fetch failed:', error);
    return res.status(500).json({ 
      error: 'Failed to connect to Facebook API.',
      details: error.message 
    });
  }
}

// This is the main handler for Vercel
module.exports = async (req, res) => {
  // Set CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*'); // Allows any origin
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle the CORS preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Handle the actual GET request
  return handleRequest(req, res);
};

