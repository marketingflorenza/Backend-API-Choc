export default async function handler(req, res) {
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
    
    const convertDateFormat = (dateStr) => {
      if (!dateStr) return null;
      const parts = dateStr.split('-');
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    };
    const getUTCDateString = (date) => date.toISOString().split('T')[0];

    let dateStart, dateStop;
    const today = new Date();
    const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 29));

    dateStart = since ? convertDateFormat(since) : getUTCDateString(thirtyDaysAgo);
    dateStop = until ? convertDateFormat(until) : getUTCDateString(today);
    
    const timeRange = encodeURIComponent(JSON.stringify({ since: dateStart, until: dateStop }));
    const insightFields = 'spend,impressions,clicks,inline_link_clicks,ctr,cpc,cpm,actions';
    const adFields = 'ad_name,spend,impressions,actions,inline_link_clicks,thumbnail_url'; // ✨ ADDED: Fields for ads

    const getPurchases = (actions) => {
        if (!actions) return 0;
        const purchaseAction = actions.find(a => a.action_type === 'purchase' || a.action_type === 'offsite_conversion.fb_pixel_purchase');
        return purchaseAction ? parseInt(purchaseAction.value) : 0;
    };

    // 1. Fetch aggregated totals
    const totalInsightsUrl = `https://graph.facebook.com/v19.0/${adAccountId}/insights?access_token=${accessToken}&fields=${insightFields}&time_range=${timeRange}&level=account&use_unified_attribution_setting=true`;
    const totalInsightsResponse = await fetch(totalInsightsUrl);
    const totalInsightsData = await totalInsightsResponse.json();
    const totals = totalInsightsData.data?.[0] || {};
    
    // 2. Fetch campaign list
    const campaignStatuses = ['ACTIVE', 'INACTIVE', 'ARCHIVED', 'PAUSED', 'DELETED', 'COMPLETED'];
    const filtering = encodeURIComponent(JSON.stringify([{ field: 'effective_status', operator: 'IN', value: campaignStatuses }]));
    const campaignsResponse = await fetch(`https://graph.facebook.com/v19.0/${adAccountId}/campaigns?access_token=${accessToken}&fields=id,name,status&limit=100&filtering=${filtering}`);
    const campaignsData = await campaignsResponse.json();
    const campaigns = campaignsData.data || [];

    // ✨ MODIFIED: Fetch ads details inside each campaign
    const campaignsWithDetails = await Promise.all(
      campaigns.map(async (campaign) => {
        // Fetch campaign-level insights
        const campaignInsightsUrl = `https://graph.facebook.com/v19.0/${campaign.id}/insights?access_token=${accessToken}&fields=${insightFields}&time_range=${timeRange}&level=campaign&use_unified_attribution_setting=true`;
        const insightsResponse = await fetch(campaignInsightsUrl);
        const insightsData = await insightsResponse.json();
        const campaignInsights = insightsData.data?.[0] || null;

        // Fetch ad-level insights and details for this campaign
        const adsUrl = `https://graph.facebook.com/v19.0/${campaign.id}/ads?access_token=${accessToken}&fields=name,adcreatives{thumbnail_url,image_url}&limit=50`;
        const adsDataResponse = await fetch(adsUrl);
        const adsData = await adsDataResponse.json();
        const ads = adsData.data || [];

        // Fetch insights for all ads in this campaign at once
        const adInsightsUrl = `https://graph.facebook.com/v19.0/${campaign.id}/insights?access_token=${accessToken}&fields=ad_id,spend,impressions,actions&time_range=${timeRange}&level=ad`;
        const adInsightsResponse = await fetch(adInsightsUrl);
        const adInsightsData = await adInsightsResponse.json();
        const adInsights = adInsightsData.data || [];

        // Combine ad data with its insights
        const adsWithDetails = ads.map(ad => {
          const insight = adInsights.find(i => i.ad_id === ad.id);
          return {
            id: ad.id,
            name: ad.name,
            thumbnail_url: ad.adcreatives?.data[0]?.thumbnail_url || 'https://via.placeholder.com/100',
            insights: {
              spend: parseFloat(insight?.spend || 0),
              impressions: parseInt(insight?.impressions || 0),
              purchases: getPurchases(insight?.actions),
            }
          };
        });

        return { ...campaign, insights: campaignInsights, ads: adsWithDetails };
      })
    );

    res.status(200).json({
      success: true,
      totals: {
        spend: parseFloat(totals.spend || 0),
        impressions: parseInt(totals.impressions || 0),
        clicks: parseInt(totals.clicks || 0),
        inline_link_clicks: parseInt(totals.inline_link_clicks || 0),
        purchases: getPurchases(totals.actions),
        ctr: parseFloat(totals.ctr || 0),
        cpc: parseFloat(totals.cpc || 0),
        cpm: parseFloat(totals.cpm || 0),
      },
      data: { 
        campaigns: campaignsWithDetails,
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}