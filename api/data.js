import { FacebookAdsApi, AdAccount } from 'facebook-nodejs-business-sdk';

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
        error: 'Missing FB_ACCESS_TOKEN in environment variables',
        details: 'Please set FB_ACCESS_TOKEN in Vercel settings'
      });
    }

    if (!adAccountId) {
      return res.status(500).json({ 
        error: 'Missing AD_ACCOUNT_ID in environment variables',
        details: 'Please set AD_ACCOUNT_ID in Vercel settings'
      });
    }

    // Initialize Facebook Ads API
    FacebookAdsApi.init(accessToken);
    const api = FacebookAdsApi.getDefaultApi();

    // Get date range (last 30 days by default)
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    const dateStart = req.query.date_start || thirtyDaysAgo.toISOString().split('T')[0];
    const dateStop = req.query.date_stop || today.toISOString().split('T')[0];

    // Create AdAccount instance
    const account = new AdAccount(adAccountId);

    // Get campaigns with insights
    const campaigns = await account.getCampaigns([
      'id',
      'name',
      'status',
      'objective',
      'created_time',
      'updated_time'
    ]);

    // Get insights for each campaign
    const campaignsWithInsights = await Promise.all(
      campaigns.map(async (campaign) => {
        try {
          const insights = await campaign.getInsights([
            'campaign_id',
            'campaign_name',
            'spend',
            'impressions',
            'clicks',
            'ctr',
            'cpc',
            'cpm',
            'reach',
            'frequency'
          ], {
            time_range: {
              since: dateStart,
              until: dateStop
            }
          });

          return {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            objective: campaign.objective,
            created_time: campaign.created_time,
            updated_time: campaign.updated_time,
            insights: insights.length > 0 ? insights[0] : null
          };
        } catch (insightError) {
          console.error('Error fetching insights for campaign:', campaign.id, insightError.message);
          return {
            id: campaign.id,
            name: campaign.name,
            status: campaign.status,
            objective: campaign.objective,
            created_time: campaign.created_time,
            updated_time: campaign.updated_time,
            insights: null,
            error: insightError.message
          };
        }
      })
    );

    // Calculate totals
    const totals = campaignsWithInsights.reduce((acc, campaign) => {
      if (campaign.insights) {
        acc.totalSpend += parseFloat(campaign.insights.spend || 0);
        acc.totalImpressions += parseInt(campaign.insights.impressions || 0);
        acc.totalClicks += parseInt(campaign.insights.clicks || 0);
        acc.totalReach += parseInt(campaign.insights.reach || 0);
      }
      return acc;
    }, {
      totalSpend: 0,
      totalImpressions: 0,
      totalClicks: 0,
      totalReach: 0
    });

    // Calculate averages
    const activeCampaigns = campaignsWithInsights.filter(c => c.insights);
    totals.averageCTR = activeCampaigns.length > 0 
      ? activeCampaigns.reduce((sum, c) => sum + parseFloat(c.insights.ctr || 0), 0) / activeCampaigns.length 
      : 0;
    totals.averageCPC = totals.totalClicks > 0 ? totals.totalSpend / totals.totalClicks : 0;
    totals.averageCPM = totals.totalImpressions > 0 ? (totals.totalSpend / totals.totalImpressions) * 1000 : 0;

    // Return response
    res.status(200).json({
      success: true,
      data: {
        dateRange: {
          start: dateStart,
          end: dateStop
        },
        totals: {
          spend: totals.totalSpend.toFixed(2),
          impressions: totals.totalImpressions,
          clicks: totals.totalClicks,
          reach: totals.totalReach,
          ctr: totals.averageCTR.toFixed(2),
          cpc: totals.averageCPC.toFixed(2),
          cpm: totals.averageCPM.toFixed(2)
        },
        campaigns: campaignsWithInsights,
        meta: {
          totalCampaigns: campaignsWithInsights.length,
          activeCampaigns: activeCampaigns.length,
          adAccountId: adAccountId
        }
      }
    });

  } catch (error) {
    console.error('Facebook API Error:', error);
    
    // Handle specific Facebook API errors
    if (error.message.includes('Invalid OAuth access token')) {
      return res.status(401).json({
        error: 'Invalid or expired access token',
        details: 'Please generate a new FB_ACCESS_TOKEN',
        code: 'INVALID_TOKEN'
      });
    }

    if (error.message.includes('Unsupported get request')) {
      return res.status(403).json({
        error: 'Insufficient permissions',
        details: 'Check if your app has ads_read permission',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
      code: 'SERVER_ERROR'
    });
  }
}