export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const accessToken = process.env.FB_ACCESS_TOKEN;
    const adAccountId = process.env.AD_ACCOUNT_ID;

    if (!accessToken || !adAccountId) {
      return res.status(500).json({ success: false, error: 'Missing environment variables' });
    }

    const { since, until } = req.query;
    
    // Helper functions
    const convertDateFormat = (dateStr) => {
      if (!dateStr) return null;
      // The date is already in YYYY-MM-DD format from frontend, no conversion needed.
      return dateStr;
    };

    const getUTCDateString = (date) => date.toISOString().split('T')[0];

    const getPurchases = (actions) => {
        if (!actions) return 0;
        const purchaseEventNames = ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase'];
        const purchaseAction = actions.find(a => purchaseEventNames.includes(a.action_type));
        return purchaseAction ? parseInt(purchaseAction.value, 10) : 0;
    };

    const getMessagingConversations = (actions) => {
        if (!actions) return 0;
        const messageAction = actions.find(a => a.action_type === 'onsite_conversion.messaging_conversation_started_7d');
        return messageAction ? parseInt(messageAction.value, 10) : 0;
    };

    // Date range setup
    let dateStart, dateStop;
    const today = new Date();
    const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 29));
    
    // Vercel query params are DD-MM-YYYY, converting for Facebook API
    dateStart = since ? since.split('-').reverse().join('-') : getUTCDateString(thirtyDaysAgo);
    dateStop = until ? until.split('-').reverse().join('-') : getUTCDateString(today);
    
    const timeRange = JSON.stringify({ since: dateStart, until: dateStop });
    const insightFields = 'spend,impressions,clicks,ctr,cpm,actions';

    // 1. Fetch daily data for the chart (remains the same)
    const dailyInsightsUrl = `https://graph.facebook.com/v19.0/${adAccountId}/insights?access_token=${accessToken}&fields=spend&time_range=${timeRange}&level=account&time_increment=1`;
    const dailyInsightsResponse = await fetch(dailyInsightsUrl);
    if (!dailyInsightsResponse.ok) throw new Error(`Failed to fetch daily insights: ${await dailyInsightsResponse.text()}`);
    const dailyInsightsData = await dailyInsightsResponse.json();
    const dailySpend = (dailyInsightsData.data || []).map(d => ({ date: d.date_start, spend: parseFloat(d.spend || 0) }));

    // 2. Fetch campaign and ad details
    const campaignStatuses = ['ACTIVE', 'INACTIVE', 'ARCHIVED', 'PAUSED', 'DELETED', 'COMPLETED'];
    const filtering = JSON.stringify([{ field: 'effective_status', operator: 'IN', value: campaignStatuses }]);
    const campaignsResponse = await fetch(`https://graph.facebook.com/v19.0/${adAccountId}/campaigns?access_token=${accessToken}&fields=id,name,status&limit=100&filtering=${filtering}`);
    if (!campaignsResponse.ok) throw new Error(`Failed to fetch campaigns: ${await campaignsResponse.text()}`);
    const campaignsData = await campaignsResponse.json();
    const campaigns = campaignsData.data || [];

    const campaignsWithDetails = await Promise.all(
      campaigns.map(async (campaign) => {
        const adsUrl = `https://graph.facebook.com/v19.0/${campaign.id}/ads?access_token=${accessToken}&fields=name,adcreatives{thumbnail_url},insights.time_range(${timeRange}){${insightFields}}&limit=50`;
        const adsDataResponse = await fetch(adsUrl);
         if (!adsDataResponse.ok) {
            console.warn(`Could not fetch ads for campaign ${campaign.id}: ${adsDataResponse.statusText}`);
            return { ...campaign, insights: { spend: 0, impressions: 0, purchases: 0, messaging_conversations: 0, cpm: 0 }, ads: [] };
        }
        const adsData = await adsDataResponse.json();
        
        const adsWithDetails = (adsData.data || []).map(ad => {
          const insight = ad.insights?.data?.[0];
          return {
            id: ad.id,
            name: ad.name,
            thumbnail_url: ad.adcreatives?.data[0]?.thumbnail_url || 'https://placehold.co/120x120/0d0c1d/a0a0b0?text=No+Image',
            insights: {
              spend: parseFloat(insight?.spend || 0),
              impressions: parseInt(insight?.impressions || 0, 10),
              cpm: parseFloat(insight?.cpm || 0),
              purchases: getPurchases(insight?.actions),
              messaging_conversations: getMessagingConversations(insight?.actions),
            }
          };
        });

        // Calculate campaign totals by summing up its ads
        const campaignInsights = adsWithDetails.reduce((acc, ad) => {
            acc.spend += ad.insights.spend;
            acc.impressions += ad.insights.impressions;
            acc.purchases += ad.insights.purchases;
            acc.messaging_conversations += ad.insights.messaging_conversations;
            return acc;
        }, { spend: 0, impressions: 0, purchases: 0, messaging_conversations: 0 });

        campaignInsights.cpm = campaignInsights.impressions > 0 ? (campaignInsights.spend / campaignInsights.impressions) * 1000 : 0;

        return { ...campaign, insights: campaignInsights, ads: adsWithDetails };
      })
    );

    // ✅ NEW: Calculate accurate grand totals by summing up the calculated campaign insights
    const accurateTotals = campaignsWithDetails.reduce((acc, campaign) => {
        acc.spend += campaign.insights.spend;
        acc.impressions += campaign.insights.impressions;
        acc.purchases += campaign.insights.purchases;
        acc.messaging_conversations += campaign.insights.messaging_conversations;
        return acc;
    }, { spend: 0, impressions: 0, purchases: 0, messaging_conversations: 0 });
    
    accurateTotals.cpm = accurateTotals.impressions > 0 ? (accurateTotals.spend / accurateTotals.impressions) * 1000 : 0;
    
    // For CTR, we still need total clicks from the account level as it's not summed
    const totalInsightsUrl = `https://graph.facebook.com/v19.0/${adAccountId}/insights?access_token=${accessToken}&fields=clicks,ctr&time_range=${timeRange}&level=account`;
    const totalInsightsResponse = await fetch(totalInsightsUrl);
    const totalInsightsData = await totalInsightsResponse.json();
    const accountTotals = totalInsightsData.data?.[0] || {};
    accurateTotals.clicks = parseInt(accountTotals.clicks || 0, 10);
    accurateTotals.ctr = parseFloat(accountTotals.ctr || 0);


    res.status(200).json({
      success: true,
      totals: {
        spend: accurateTotals.spend,
        impressions: accurateTotals.impressions,
        clicks: accurateTotals.clicks,
        purchases: accurateTotals.purchases,
        messaging_conversations: accurateTotals.messaging_conversations,
        ctr: accurateTotals.ctr,
        cpm: accurateTotals.cpm,
      },
      data: { 
        campaigns: campaignsWithDetails,
        dailySpend: dailySpend
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

