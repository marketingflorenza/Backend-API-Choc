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
    
    // ✨ MODIFIED: เพิ่ม 'actions' เพื่อดึงข้อมูลการซื้อ
    const insightFields = 'spend,impressions,clicks,inline_link_clicks,ctr,cpc,cpm,actions';

    // 1. Fetch aggregated totals
    const totalInsightsUrl = `https://graph.facebook.com/v19.0/${adAccountId}/insights?access_token=${accessToken}&fields=${insightFields}&time_range=${timeRange}&level=account&use_unified_attribution_setting=true`;
    const totalInsightsResponse = await fetch(totalInsightsUrl);
    if (!totalInsightsResponse.ok) throw new Error(`Facebook Total Insights API error`);
    const totalInsightsData = await totalInsightsResponse.json();
    const totals = totalInsightsData.data?.[0] || {};
    
    // 2. Fetch daily data
    const dailyInsightsUrl = `https://graph.facebook.com/v19.0/${adAccountId}/insights?access_token=${accessToken}&fields=spend&time_range=${timeRange}&level=account&time_increment=1`;
    const dailyInsightsResponse = await fetch(dailyInsightsUrl);
    if (!dailyInsightsResponse.ok) throw new Error(`Facebook Daily Insights API error`);
    const dailyInsightsData = await dailyInsightsResponse.json();
    const dailySpend = (dailyInsightsData.data || []).map(d => ({ date: d.date_start, spend: parseFloat(d.spend || 0) }));

    // 3. Fetch campaign breakdown
    const campaignStatuses = ['ACTIVE', 'INACTIVE', 'ARCHIVED', 'PAUSED', 'DELETED', 'COMPLETED'];
    const filtering = encodeURIComponent(JSON.stringify([{ field: 'effective_status', operator: 'IN', value: campaignStatuses }]));
    const campaignsResponse = await fetch(`https://graph.facebook.com/v19.0/${adAccountId}/campaigns?access_token=${accessToken}&fields=id,name,status&limit=100&filtering=${filtering}`);
    if (!campaignsResponse.ok) throw new Error(`Facebook campaigns API error`);
    const campaignsData = await campaignsResponse.json();
    const campaigns = campaignsData.data || [];

    const campaignsWithDetails = await Promise.all(
      campaigns.map(async (campaign) => {
        const campaignInsightsUrl = `https://graph.facebook.com/v19.0/${campaign.id}/insights?access_token=${accessToken}&fields=${insightFields}&time_range=${timeRange}&level=campaign&use_unified_attribution_setting=true`;
        const insightsResponse = await fetch(campaignInsightsUrl);
        const insightsData = await insightsResponse.json();
        const insights = insightsData.data?.[0] || null;
        return { ...campaign, insights };
      })
    );

    // ✨ ADDED: ฟังก์ชันสำหรับหาจำนวนการซื้อจาก 'actions'
    const getPurchases = (actions) => {
        if (!actions) return 0;
        const purchaseAction = actions.find(action => action.action_type === 'purchase');
        return purchaseAction ? parseInt(purchaseAction.value) : 0;
    };
    
    const totalPurchases = getPurchases(totals.actions);

    res.status(200).json({
      success: true,
      totals: {
        spend: parseFloat(totals.spend || 0),
        impressions: parseInt(totals.impressions || 0),
        clicks: parseInt(totals.clicks || 0),
        inline_link_clicks: parseInt(totals.inline_link_clicks || 0),
        ctr: parseFloat(totals.ctr || 0),
        cpc: parseFloat(totals.cpc || 0),
        cpm: parseFloat(totals.cpm || 0),
        purchases: totalPurchases, // ✨ ADDED: ส่งค่าการซื้อกลับไป
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