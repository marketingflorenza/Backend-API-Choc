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
        error: 'Missing environment variables',
        success: false
      });
    }

    let adAccountTimezone = null;
    try {
      const accountResponse = await fetch(`https://graph.facebook.com/v19.0/${adAccountId}?access_token=${accessToken}&fields=timezone_name`);
      if (accountResponse.ok) {
        adAccountTimezone = await accountResponse.json();
      }
    } catch (error) {
      console.error('Could not fetch timezone', error);
    }

    const { since, until } = req.query;
    
    // Helper functions for date
    const convertDateFormat = (dateStr) => {
      if (!dateStr) return null;
      const parts = dateStr.split('-');
      return `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
    };
    const getUTCDateString = (date) => date.toISOString().split('T')[0];

    // =======================================================
    // ✨ ADDED BACK: เพิ่มโค้ดส่วนที่หายไปกลับเข้ามา
    // ส่วนนี้คือการสร้างตัวแปร dateStart และ dateStop
    // =======================================================
    let dateStart, dateStop;

    const today = new Date();
    const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 29));

    if (since) {
      const convertedSince = convertDateFormat(since);
      if (!convertedSince) {
        return res.status(400).json({ success: false, error: 'Invalid since date format. Use DD-MM-YYYY.' });
      }
      dateStart = convertedSince;
    } else {
      dateStart = getUTCDateString(thirtyDaysAgo);
    }
    
    if (until) {
      const convertedUntil = convertDateFormat(until);
      if (!convertedUntil) {
        return res.status(400).json({ success: false, error: 'Invalid until date format. Use DD-MM-YYYY.' });
      }
      dateStop = convertedUntil;
    } else {
      dateStop = getUTCDateString(today);
    }
    // =======================================================
    
    console.log(`Fetching Facebook API data for date range: ${dateStart} to ${dateStop}`);

    const campaignStatuses = ['ACTIVE', 'INACTIVE', 'ARCHIVED', 'PAUSED', 'DELETED', 'COMPLETED'];
    const filtering = encodeURIComponent(JSON.stringify([{
      field: 'effective_status',
      operator: 'IN',
      value: campaignStatuses
    }]));

    const campaignsResponse = await fetch(
      `https://graph.facebook.com/v19.0/${adAccountId}/campaigns?access_token=${accessToken}&fields=id,name,status,objective&limit=100&filtering=${filtering}`
    );

    if (!campaignsResponse.ok) throw new Error(`Facebook campaigns API error: ${await campaignsResponse.text()}`);
    const campaignsData = await campaignsResponse.json();
    if (campaignsData.error) throw new Error(`Facebook API Error: ${campaignsData.error.message}`);
    const campaigns = campaignsData.data || [];

    const campaignsWithDetails = await Promise.all(
      campaigns.map(async (campaign) => {
        const insightFields = 'spend,impressions,clicks,inline_link_clicks,reach,ctr,cpc,cpm';
        const timeRange = encodeURIComponent(JSON.stringify({ since: dateStart, until: dateStop }));
        const insightsUrl = `https://graph.facebook.com/v19.0/${campaign.id}/insights?access_token=${accessToken}&fields=${insightFields}&time_range=${timeRange}&level=campaign&use_unified_attribution_setting=true`;
        
        const insightsResponse = await fetch(insightsUrl);
        const insightsData = await insightsResponse.json();
        const insights = insightsData.data?.[0] || null;

        return { ...campaign, insights };
      })
    );
    
    const totals = campaignsWithDetails.reduce((acc, campaign) => {
      if (campaign.insights) {
        acc.totalSpend += parseFloat(campaign.insights.spend || 0);
        acc.totalImpressions += parseInt(campaign.insights.impressions || 0);
        acc.totalClicks += parseInt(campaign.insights.clicks || 0);
        acc.totalLinkClicks += parseInt(campaign.insights.inline_link_clicks || 0);
      }
      return acc;
    }, { totalSpend: 0, totalImpressions: 0, totalClicks: 0, totalLinkClicks: 0 });

    res.status(200).json({
      success: true,
      totals: {
        spend: totals.totalSpend,
        impressions: totals.totalImpressions,
        clicks: totals.totalClicks,
        inline_link_clicks: totals.totalLinkClicks,
        ctr: totals.totalImpressions > 0 ? (totals.totalClicks / totals.totalImpressions) * 100 : 0,
        cpc: totals.totalClicks > 0 ? totals.totalSpend / totals.totalClicks : 0,
        cpm: totals.totalImpressions > 0 ? (totals.totalSpend / totals.totalImpressions) * 1000 : 0
      },
      data: { campaigns: campaignsWithDetails }
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}