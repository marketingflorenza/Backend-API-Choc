export default async function handler(req, res) {
  // CORS Headers to allow requests from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Pre-flight request for CORS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const accessToken = process.env.FB_ACCESS_TOKEN;
    const adAccountId = process.env.AD_ACCOUNT_ID;

    if (!accessToken || !adAccountId) {
      return res.status(500).json({ success: false, error: 'Missing Facebook API environment variables' });
    }

    // --- Helper Functions ---
    const getPurchases = (actions) => {
        if (!actions) return 0;
        const purchaseEventNames = ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase'];
        const purchaseAction = actions.find(a => purchaseEventNames.includes(a.action_type));
        return purchaseAction ? parseInt(purchaseAction.value) : 0;
    };

    const getMessagingConversations = (actions) => {
        if (!actions) return 0;
        const messageAction = actions.find(a => a.action_type === 'onsite_conversion.messaging_conversation_started_7d');
        return messageAction ? parseInt(messageAction.value) : 0;
    };

    // --- Date Range Setup ---
    // The API provides data for the last 30 days by default, so we don't need to pass date parameters.
    const today = new Date();
    const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 29));
    const timeRange = {
        since: thirtyDaysAgo.toISOString().split('T')[0],
        until: today.toISOString().split('T')[0]
    };
    const timeRangeParam = JSON.stringify(timeRange);
    
    const insightFields = 'spend,impressions,clicks,ctr,cpm,actions';

    // 1. Fetch Aggregated Totals for the entire account
    const totalInsightsUrl = `https://graph.facebook.com/v19.0/${adAccountId}/insights?access_token=${accessToken}&fields=${insightFields}&time_range=${timeRangeParam}&level=account`;
    const totalInsightsResponse = await fetch(totalInsightsUrl);
    const totalInsightsData = await totalInsightsResponse.json();
    const totals = totalInsightsData.data?.[0] || {};
    
    // 2. Fetch Daily Data for the chart
    const dailyInsightsUrl = `https://graph.facebook.com/v19.0/${adAccountId}/insights?access_token=${accessToken}&fields=spend&time_range=${timeRangeParam}&level=account&time_increment=1`;
    const dailyInsightsResponse = await fetch(dailyInsightsUrl);
    const dailyInsightsData = await dailyInsightsResponse.json();
    const dailySpend = (dailyInsightsData.data || []).map(d => ({ date: d.date_start, spend: parseFloat(d.spend || 0) }));

    // 3. Fetch Campaigns and their Ads with Insights
    const campaignStatuses = ['ACTIVE', 'PAUSED']; // Focusing on relevant statuses
    const filtering = JSON.stringify([{ field: 'effective_status', operator: 'IN', value: campaignStatuses }]);
    
    const campaignsUrl = `https://graph.facebook.com/v19.0/${adAccountId}/campaigns?access_token=${accessToken}&fields=id,name,status&limit=100&filtering=${filtering}`;
    const campaignsResponse = await fetch(campaignsUrl);
    const campaignsData = await campaignsResponse.json();
    const campaigns = campaignsData.data || [];

    const campaignsWithDetails = await Promise.all(
      campaigns.map(async (campaign) => {
        // Fetch ad-level data as the single source of truth for insights
        const adsUrl = `https://graph.facebook.com/v19.0/${campaign.id}/ads?access_token=${accessToken}&fields=name,adcreatives{thumbnail_url},insights.time_range(${timeRangeParam}){${insightFields}}&limit=50`;
        const adsDataResponse = await fetch(adsUrl);
        const adsData = await adsDataResponse.json();
        
        const adsWithDetails = (adsData.data || []).map(ad => {
          const insight = ad.insights?.data?.[0];
          return {
            id: ad.id,
            name: ad.name,
            thumbnail_url: ad.adcreatives?.data[0]?.thumbnail_url || 'https://placehold.co/120x120/0d0c1d/a0a0b0?text=No+Image',
            insights: {
              spend: parseFloat(insight?.spend || 0),
              impressions: parseInt(insight?.impressions || 0),
              cpm: parseFloat(insight?.cpm || 0),
              purchases: getPurchases(insight?.actions),
              messaging_conversations: getMessagingConversations(insight?.actions),
            }
          };
        });

        // Calculate campaign totals by summing up its ads' insights
        const campaignInsights = adsWithDetails.reduce((acc, ad) => {
            acc.spend += ad.insights.spend;
            acc.impressions += ad.insights.impressions;
            acc.purchases += ad.insights.purchases;
            acc.messaging_conversations += ad.insights.messaging_conversations;
            return acc;
        }, { spend: 0, impressions: 0, purchases: 0, messaging_conversations: 0 });

        // Recalculate CPM for the campaign based on summed data
        campaignInsights.cpm = campaignInsights.impressions > 0 ? (campaignInsights.spend / campaignInsights.impressions) * 1000 : 0;

        return { ...campaign, insights: campaignInsights, ads: adsWithDetails };
      })
    );

    res.status(200).json({
      success: true,
      totals: {
        spend: parseFloat(totals.spend || 0),
        impressions: parseInt(totals.impressions || 0),
        clicks: parseInt(totals.clicks || 0),
        purchases: getPurchases(totals.actions),
        messaging_conversations: getMessagingConversations(totals.actions),
        ctr: parseFloat(totals.ctr || 0),
        cpm: parseFloat(totals.cpm || 0),
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
