// test-firebase.js
const { saveCustomerTracking } = require('./lib/firebase');

async function runTest() {
  console.log('🧪 Testing Firebase connection...');
  
  // ตรวจสอบ Environment Variables
  console.log('📋 Checking environment variables...');
  console.log('FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID ? '✅ Found' : '❌ Missing');
  console.log('FIREBASE_CLIENT_EMAIL:', process.env.FIREBASE_CLIENT_EMAIL ? '✅ Found' : '❌ Missing');
  console.log('FIREBASE_PRIVATE_KEY:', process.env.FIREBASE_PRIVATE_KEY ? '✅ Found' : '❌ Missing');
  
  try {
    const testCustomer = {
      user_psid: 'test_12345',
      utm_campaign: 'test_campaign',
      utm_source: 'facebook',
      utm_medium: 'video_ad',
      first_interaction: new Date().toISOString(),
      status: 'new_lead'
    };
    
    console.log('💾 Attempting to save test customer...');
    await saveCustomerTracking(testCustomer);
    console.log('✅ Test successful!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

runTest();