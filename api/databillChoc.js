// pages/api/databillchoc.js

export default async function handler(req, res) {
  // ================================================================
  // 1. SETUP & CORS
  // ================================================================
  res.setHeader('Access-Control-Allow-Origin', '*'); // อนุญาตให้ทุกโดเมนเรียกใช้
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // จัดการกับ OPTIONS request สำหรับ CORS pre-flight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // ================================================================
    // 2. ENVIRONMENT VARIABLES & VALIDATION
    // ================================================================
    const accessToken = process.env.FB_ACCESS_TOKEN;
    const adAccountId = process.env.AD_ACCOUNT_ID;

    if (!accessToken || !adAccountId) {
      // ถ้าไม่มี Token หรือ Ad Account ID ใน .env.local ให้ส่ง Error กลับไป
      return res.status(500).json({ success: false, error: 'Missing server environment variables (FB_ACCESS_TOKEN or AD_ACCOUNT_ID)' });
    }

    // ================================================================
    // 3. HELPER FUNCTIONS (สำหรับแยกข้อมูลจาก Facebook)
    // ================================================================
    const getActionValue = (actions, actionType) => {
        if (!actions) return 0;
        const action = actions.find(a => a.action_type === actionType);
        return action ? parseInt(action.value, 10) : 0;
    };
    
    const getPurchases = (actions) => {
        if (!actions) return 0;
        const purchaseEventNames = ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase'];
        const purchaseAction = actions.find(a => purchaseEventNames.includes(a.action_type));
        return purchaseAction ? parseInt(purchaseAction.value, 10) : 0;
    };
    
    const getMessagingConversations = (actions) => {
        return getActionValue(actions, 'onsite_conversion.messaging_conversation_started_7d');
    };

    // ================================================================
    // 4. DATE & PARAMETER SETUP
    // ================================================================
    const { since, until } = req.query;
    
    let dateStart, dateStop;

    if (since && until) {
      // ใช้ข้อมูลจาก Front-end ถ้ามีส่งมา
      dateStart = since;
      dateStop = until;
    } else {
      // ถ้าไม่ ให้ใช้ค่าเริ่มต้น (30 วันล่าสุด)
      const today = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 29);
      dateStart = thirtyDaysAgo.toISOString().split('T')[0];
      dateStop = today.toISOString().split('T')[0];
    }
    
    const timeRange = encodeURIComponent(JSON.stringify({ since: dateStart, until: dateStop }));
    const insightFields = 'spend,impressions,clicks,inline_link_clicks,ctr,cpc,cpm,actions';
    const facebookApiVersion = 'v19.0'; // สามารถเปลี่ยนเวอร์ชันได้ในอนาคต

    // ================================================================
    // 5. FACEBOOK API CALLS
    // ================================================================

    // --- 5.1 ดึงข้อมูลภาพรวมทั้งหมด (Totals) ---
    const totalInsightsUrl = `https://graph.facebook.com/${facebookApiVersion}/${adAccountId}/insights?access_token=${accessToken}&fields=${insightFields}&time_range=${timeRange}&level=account&use_unified_attribution_setting=true`;
    const totalInsightsResponse = await fetch(totalInsightsUrl);
    const totalInsightsData = await totalInsightsResponse.json();
    if (totalInsightsData.error) throw new Error(`Facebook API Error (Totals): ${totalInsightsData.error.message}`);
    const totals = totalInsightsData.data?.[0] || {};
    
    // --- 5.2 ดึงข้อมูลค่าใช้จ่ายรายวันสำหรับกราฟ (Daily Spend) ---
    const dailyInsightsUrl = `https://graph.facebook.com/${facebookApiVersion}/${adAccountId}/insights?access_token=${accessToken}&fields=spend&time_range=${timeRange}&level=account&time_increment=1`;
    const dailyInsightsResponse = await fetch(dailyInsightsUrl);
    const dailyInsightsData = await dailyInsightsResponse.json();
    if (dailyInsightsData.error) throw new Error(`Facebook API Error (Daily Spend): ${dailyInsightsData.error.message}`);
    const dailySpend = (dailyInsightsData.data || []).map(d => ({ date: d.date_start, spend: parseFloat(d.spend || 0) }));

    // --- 5.3 ดึงข้อมูลแคมเปญทั้งหมด ---
    const campaignsUrl = `https://graph.facebook.com/${facebookApiVersion}/${adAccountId}/campaigns?access_token=${accessToken}&fields=id,name,status&limit=100`;
    const campaignsResponse = await fetch(campaignsUrl);
    const campaignsData = await campaignsResponse.json();
    if (campaignsData.error) throw new Error(`Facebook API Error (Campaigns): ${campaignsData.error.message}`);
    const campaigns = campaignsData.data || [];

    // --- 5.4 ดึงข้อมูลโฆษณาและ Insights ของแต่ละแคมเปญ ---
    const campaignsWithDetails = await Promise.all(
      campaigns.map(async (campaign) => {
        const adsUrl = `https://graph.facebook.com/${facebookApiVersion}/${campaign.id}/ads?access_token=${accessToken}&fields=name,adcreatives{thumbnail_url},insights.time_range(${timeRange}){${insightFields}}&limit=50`;
        const adsDataResponse = await fetch(adsUrl);
        const adsData = await adsDataResponse.json();
        if (adsData.error) {
            console.warn(`Could not fetch ads for campaign ${campaign.id}: ${adsData.error.message}`);
            return { ...campaign, insights: {}, ads: [] };
        }
        
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

        // คำนวณ Insights ของแคมเปญจากการรวมผลของโฆษณาทั้งหมด
        const campaignInsights = adsWithDetails.reduce((acc, ad) => {
            acc.spend += ad.insights.spend;
            acc.impressions += ad.insights.impressions;
            acc.purchases += ad.insights.purchases;
            acc.messaging_conversations += ad.insights.messaging_conversations;
            return acc;
        }, { spend: 0, impressions: 0, purchases: 0, messaging_conversations: 0 });

        // คำนวณ CPM ของแคมเปญใหม่
        campaignInsights.cpm = campaignInsights.impressions > 0 ? (campaignInsights.spend / campaignInsights.impressions) * 1000 : 0;

        return { ...campaign, insights: campaignInsights, ads: adsWithDetails };
      })
    );

    // ================================================================
    // 6. SEND SUCCESS RESPONSE
    // ================================================================
    res.status(200).json({
      success: true,
      totals: {
        spend: parseFloat(totals.spend || 0),
        impressions: parseInt(totals.impressions || 0),
        clicks: parseInt(totals.clicks || 0),
        inline_link_clicks: parseInt(totals.inline_link_clicks || 0),
        purchases: getPurchases(totals.actions),
        messaging_conversations: getMessagingConversations(totals.actions),
        ctr: parseFloat(totals.ctr || 0),
        cpc: parseFloat(totals.cpc || 0),
        cpm: parseFloat(totals.cpm || 0),
      },
      data: { 
        campaigns: campaignsWithDetails.filter(c => c.insights.spend > 0), // กรองเฉพาะแคมเปญที่มีค่าใช้จ่าย
        dailySpend: dailySpend
      }
    });

  } catch (error) {
    // ================================================================
    // 7. SEND ERROR RESPONSE
    // ================================================================
    console.error('API Route Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}