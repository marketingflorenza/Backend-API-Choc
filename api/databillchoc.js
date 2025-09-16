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

    // (ส่วนดึงข้อมูล Timezone เหมือนเดิม ไม่มีการแก้ไข)
    let adAccountTimezone = null;
    try {
      // ... code to fetch timezone ...
    } catch (error) {
      console.error('Error fetching ad account timezone:', error);
    }

    const { since, until } = req.query;
    
    // (ส่วนฟังก์ชันแปลงวันที่ต่างๆ เหมือนเดิม ไม่มีการแก้ไข)
    function convertDateFormat(dateStr) { /* ... */ }
    function formatDateForResponse(dateStr) { /* ... */ }
    function getUTCDateString(date) { /* ... */ }

    // (ส่วนคำนวณและตรวจสอบวันที่ เหมือนเดิม ไม่มีการแก้ไข)
    // ... code for date calculation and validation ...
    
    console.log(`Fetching Facebook API data for date range: ${dateStart} to ${dateStop}`);

    // =======================================================
    // ✨ ADDED: กำหนดสถานะแคมเปญทั้งหมดที่ต้องการดึง
    // =======================================================
    const campaignStatuses = ['ACTIVE', 'INACTIVE', 'ARCHIVED', 'PAUSED', 'DELETED', 'COMPLETED'];
    const filtering = encodeURIComponent(JSON.stringify([{
      field: 'effective_status',
      operator: 'IN',
      value: campaignStatuses
    }]));
    // =======================================================

    // ✨ MODIFIED: เพิ่ม `&filtering=${filtering}` เข้าไปใน URL
    const campaignsResponse = await fetch(
      `https://graph.facebook.com/v19.0/${adAccountId}/campaigns?access_token=${accessToken}&fields=id,name,status,objective,created_time,updated_time&limit=50&filtering=${filtering}`
    );

    if (!campaignsResponse.ok) {
      const errorText = await campaignsResponse.text();
      console.error('Facebook API campaigns error:', errorText);
      throw new Error(`Facebook API campaigns error: ${campaignsResponse.status} - ${errorText}`);
    }

    const campaignsData = await campaignsResponse.json();
    
    if (campaignsData.error) {
      console.error('Facebook API Error:', campaignsData.error);
      throw new Error(`Facebook API Error: ${campaignsData.error.message} (Code: ${campaignsData.error.code})`);
    }

    const campaigns = campaignsData.data || [];
    console.log(`Found ${campaigns.length} campaigns (including all statuses)`);

    const isLast30Days = dateStart === getUTCDateString(thirtyDaysAgo) && dateStop === getUTCDateString(today);

    const campaignsWithDetails = await Promise.all(
      campaigns.map(async (campaign, index) => {
        try {
          if (index > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

          // ✨ ADDED: เพิ่ม inline_link_clicks เพื่อดูจำนวนคลิกลิงก์โดยเฉพาะ
          const insightFields = 'spend,impressions,clicks,inline_link_clicks,reach,ctr,cpc,cpm,frequency,actions,cost_per_action_type';

          let insightsUrl;
          if (isLast30Days) {
            // ✨ MODIFIED: เพิ่ม `&use_unified_attribution_setting=true` และ fields ใหม่
            insightsUrl = `https://graph.facebook.com/v19.0/${campaign.id}/insights?access_token=${accessToken}&fields=${insightFields}&date_preset=last_30d&level=campaign&use_unified_attribution_setting=true`;
            console.log(`Using date_preset=last_30d for campaign ${campaign.id}`);
          } else {
            const timeRange = encodeURIComponent(JSON.stringify({
              since: dateStart,
              until: dateStop
            }));
            // ✨ MODIFIED: เพิ่ม `&use_unified_attribution_setting=true` และ fields ใหม่
            insightsUrl = `https://graph.facebook.com/v19.0/${campaign.id}/insights?access_token=${accessToken}&fields=${insightFields}&time_range=${timeRange}&level=campaign&use_unified_attribution_setting=true`;
            console.log(`Using custom time_range for campaign ${campaign.id}: ${dateStart} to ${dateStop}`);
          }
          
          const insightsResponse = await fetch(insightsUrl);
          
          let insights = null;
          if (insightsResponse.ok) {
            const insightsData = await insightsResponse.json();
            insights = insightsData.data?.[0] || null;
          } else {
            // ... error handling ...
          }
          
          // (ส่วนดึง ads และ images เหมือนเดิม ไม่มีการแก้ไข)
          // ... code to fetch ads and images ...

          return {
            ...campaign,
            insights: insights,
            ads: adsWithImages
          };

        } catch (error) {
          // ... error handling ...
        }
      })
    );
    
    // (ส่วนคำนวณ totals และ response เหมือนเดิม ไม่มีการแก้ไข)
    // ... code to calculate totals and format response ...

    res.status(200).json({ /* ... response data ... */ });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ /* ... error response ... */ });
  }
}