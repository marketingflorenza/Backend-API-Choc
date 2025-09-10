import { FacebookAdsApi, AdAccount } from 'facebook-nodejs-business-sdk';

export default async function handler(req, res) {
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

    // Initialize Facebook Ads API
    FacebookAdsApi.init(accessToken);
    
    // Create AdAccount instance
    const account = new AdAccount(adAccountId);

    // Get campaigns
    const campaigns = await account.getCampaigns([
      'id', 'name', 'status'
    ]);

    res.status(200).json({
      success: true,
      data: {
        campaigns: campaigns.map(c => ({
          id: c.id,
          name: c.name,
          status: c.status
        })),
        total: campaigns.length
      }
    });

  } catch (error) {
    console.error('Facebook API Error:', error);
    res.status(500).json({
      error: error.message
    });
  }
}