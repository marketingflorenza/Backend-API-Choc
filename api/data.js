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

    // รับค่าช่วงเวลาจาก query parameters
    const { since, until } = req.query;
    
    // ฟังก์ชันแปลงวันที่จาก DD-MM-YYYY เป็น YYYY-MM-DD
    function convertDateFormat(dateStr) {
      if (!dateStr) return null;
      
      const parts = dateStr.split('-');
      if (parts.length !== 3) return null;
      
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      
      // ตรวจสอบว่าเป็นตัวเลขหรือไม่
      if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
      if (day < 1 || day > 31 || month < 1 || month > 12 || year < 1900) return null;
      
      return `${year}-${month}-${day}`;
    }

    // กำหนดค่า default หากไม่มีการส่งมา
    const today = new Date();
    const thirtyDaysAgo = new Date(today.getTime() - (30 * 24 * 60 * 60 * 1000));
    
    let dateStart, dateStop;
    
    if (since) {
      const convertedSince = convertDateFormat(since);
      if (!convertedSince) {
        return res.status(400).json({
          error: 'Invalid since date format. Use DD-MM-YYYY format (e.g., 31-01-2024)'
        });
      }
      dateStart = convertedSince;
    } else {
      dateStart = thirtyDaysAgo.toISOString().split('T')[0];
    }
    
    if (until) {
      const convertedUntil = convertDateFormat(until);
      if (!convertedUntil) {
        return res.status(400).json({
          error: 'Invalid until date format. Use DD-MM-YYYY format (e.g., 31-01-2024)'
        });
      }
      dateStop = convertedUntil;
    } else {
      dateStop = today.toISOString().split('T')[0];
    }

    // Validate date range
    const startDate = new Date(dateStart);
    const endDate = new Date(dateStop);
    
    if (startDate > endDate) {
      return res.status(400).json({
        error: 'Start date must be before end date'
      });
    }

    // Check if date range is not too far in the past
    const maxDaysBack = 365;
    const maxDate = new Date(today.getTime() - (maxDaysBack * 24 * 60 * 60 * 1000));
    
    if (startDate < maxDate) {
      return res.status(400).json({
        error: `Date range cannot be more than ${maxDaysBack} days ago`
      });
    }

    // ดึงข้อมูล campaigns
    const campaignsResponse = await fetch(
      `https://graph.facebook.com/v18.0/${adAccountId}/campaigns?access_token=${accessToken}&fields=id,name,status,objective&limit=10`
    );

    if (!campaignsResponse.ok) {
      throw new Error(`Facebook API error: ${campaignsResponse.status}`);
    }

    const campaignsData = await campaignsResponse.json();
    const campaigns = campaignsData.data || [];

    // ดึงข้อมูลสำหรับแต่ละ campaign
    const campaignsWithDetails = await Promise.all(
      campaigns.map(async (campaign) => {
        try {
          // ใช้ช่วงเวลาที่แปลงแล้ว (YYYY-MM-DD format for Facebook API)
          const insightsResponse = await fetch(
            `https://graph.facebook.com/v18.0/${campaign.id}/insights?access_token=${accessToken}&fields=spend,impressions,clicks,reach,ctr,cpc,cpm&time_range={'since':'${dateStart}','until':'${dateStop}'}`
          );
          
          let insights = null;
          if (insightsResponse.ok) {
            const insightsData = await insightsResponse.json();
            insights = insightsData.data?.[0] || null;
          }

          // ดึง ads ของ campaign
          const adsResponse = await fetch(
            `https://graph.facebook.com/v18.0/${campaign.id}/ads?access_token=${accessToken}&fields=id,name,status&limit=5`
          );

          let ads = [];
          if (adsResponse.ok) {
            const adsData = await adsResponse.json();
            ads = adsData.data || [];
          }

          // ดึงรูปภาพของ ads
          const adsWithImages = await Promise.all(
            ads.map(async (ad) => {
              try {
                const creativesResponse = await fetch(
                  `https://graph.facebook.com/v18.0/${ad.id}/adcreatives?access_token=${accessToken}&fields=id,name,object_story_spec,image_url,thumbnail_url`
                );

                let images = [];
                if (creativesResponse.ok) {
                  const creativesData = await creativesResponse.json();
                  const creatives = creativesData.data || [];
                  
                  for (const creative of creatives) {
                    if (creative.image_url) {
                      images.push({
                        type: 'image',
                        url: creative.image_url,
                        thumbnail: creative.thumbnail_url || creative.image_url
                      });
                    }
                    
                    if (creative.object_story_spec?.link_data?.picture) {
                      images.push({
                        type: 'link_image',
                        url: creative.object_story_spec.link_data.picture,
                        thumbnail: creative.object_story_spec.link_data.picture
                      });
                    }
                  }
                }

                return {
                  ...ad,
                  images: images
                };
              } catch (error) {
                console.error('Error fetching ad images:', error);
                return {
                  ...ad,
                  images: []
                };
              }
            })
          );

          return {
            ...campaign,
            insights: insights,
            ads: adsWithImages
          };

        } catch (error) {
          console.error('Error fetching campaign details:', error);
          return {
            ...campaign,
            insights: null,
            ads: [],
            error: error.message
          };
        }
      })
    );

    // คำนวณ totals
    const totals = campaignsWithDetails.reduce((acc, campaign) => {
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

    const totalImages = campaignsWithDetails.reduce((count, campaign) => {
      return count + campaign.ads.reduce((adCount, ad) => {
        return adCount + ad.images.length;
      }, 0);
    }, 0);

    // แปลงวันที่กลับเป็น DD-MM-YYYY สำหรับ response
    function formatDateForResponse(dateStr) {
      const parts = dateStr.split('-');
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    res.status(200).json({
      success: true,
      message: 'Facebook API with DD-MM-YYYY date format',
      dateRange: {
        start: formatDateForResponse(dateStart),
        end: formatDateForResponse(dateStop),
        requested: {
          since: since || 'auto (30 days ago)',
          until: until || 'auto (today)'
        }
      },
      summary: {
        totalCampaigns: campaignsWithDetails.length,
        totalAds: campaignsWithDetails.reduce((count, c) => count + c.ads.length, 0),
        totalImages: totalImages
      },
      totals: {
        spend: totals.totalSpend.toFixed(2),
        impressions: totals.totalImpressions,
        clicks: totals.totalClicks,
        reach: totals.totalReach,
        ctr: totals.totalImpressions > 0 ? ((totals.totalClicks / totals.totalImpressions) * 100).toFixed(2) : 0,
        cpc: totals.totalClicks > 0 ? (totals.totalSpend / totals.totalClicks).toFixed(2) : 0
      },
      data: {
        campaigns: campaignsWithDetails
      }
    });

  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({
      error: error.message,
      details: 'Check logs for more info'
    });
  }
}