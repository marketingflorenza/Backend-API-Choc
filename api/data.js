// api/data.js
const fetch = require('node-fetch'); // Ensure you are using node-fetch v2 for require syntax

const accessToken = process.env.FB_ACCESS_TOKEN;
const adAccountId = process.env.AD_ACCOUNT_ID;

// This is the main handler for Vercel Serverless Functions
module.exports = async (req, res) => {
  // ===================== CORS HEADERS (THE FIX) =====================
  // This allows your frontend (running on a different domain) to make requests to this API
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); // Or specify your frontend domain for better security
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle the browser's preflight request. This is crucial for CORS.
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  // =================================================================

  // Check for API credentials
  if (!accessToken || !adAccountId) {
    console.error('Server Error: Missing FB_ACCESS_TOKEN or AD_ACCOUNT_ID in .env');
    return res.status(500).json({ 
      error: 'API credentials are not configured correctly on the server.'
    });
  }

  // Construct the Facebook API URL
  const url = `https://graph.facebook.com/v19.0/${adAccountId}/campaigns?fields=name,status,insights{spend,clicks,impressions}&access_token=${accessToken}`;

  try {
    const fbResponse = await fetch(url);
    const data = await fbResponse.json();

    // Check for errors returned from Facebook
    if (data.error) {
      console.error('Facebook API Error:', JSON.stringify(data.error, null, 2));
      return res.status(fbResponse.status).json({ 
        error: 'An error occurred while fetching data from Facebook.',
        details: data.error.message 
      });
    }
    
    // Send successful response
    return res.status(200).json(data);

  } catch (error) {
    console.error('Server-side fetch failed:', error);
    return res.status(500).json({ 
      error: 'Failed to connect to the Facebook API.',
      details: error.message 
    });
  }
};

