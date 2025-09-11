// lib/firebase.js
// ไฟล์นี้จัดการการเชื่อมต่อกับ Firebase Firestore

const admin = require('firebase-admin');

// ตรวจสอบว่า Firebase ถูก Initialize แล้วหรือยัง
if (!admin.apps.length) {
  try {
    const serviceAccount = {
      type: "service_account",
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      client_id: process.env.FIREBASE_CLIENT_ID,
      auth_uri: "https://accounts.google.com/o/oauth2/auth",
      token_uri: "https://oauth2.googleapis.com/token",
      auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
      client_x509_cert_url: process.env.FIREBASE_CLIENT_CERT_URL
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`
    });

    console.log('✅ Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing Firebase Admin SDK:', error);
  }
}

const db = admin.firestore();

// === ฟังก์ชันสำหรับ Customer Tracking ===

async function saveCustomerTracking(trackingData) {
  try {
    const docRef = db.collection('customer_tracking').doc(trackingData.user_psid);
    
    // เช็คว่ามีข้อมูลอยู่แล้วหรือไม่
    const existingDoc = await docRef.get();
    
    if (existingDoc.exists) {
      // อัพเดทข้อมูลที่มีอยู่
      await docRef.update({
        last_message: new Date().toISOString(),
        message_count: admin.firestore.FieldValue.increment(1),
        updated_at: new Date().toISOString()
      });
      console.log('🔄 Customer tracking updated:', trackingData.user_psid);
    } else {
      // สร้างข้อมูลใหม่
      const newTrackingData = {
        ...trackingData,
        message_count: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      await docRef.set(newTrackingData);
      console.log('✅ New customer tracking saved:', trackingData.user_psid);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error saving customer tracking:', error);
    throw error;
  }
}

async function getCustomerTracking(user_psid) {
  try {
    const doc = await db.collection('customer_tracking').doc(user_psid).get();
    
    if (doc.exists) {
      return { id: doc.id, ...doc.data() };
    } else {
      console.log('ℹ️ Customer not found:', user_psid);
      return null;
    }
  } catch (error) {
    console.error('❌ Error getting customer tracking:', error);
    throw error;
  }
}

async function saveConversation(conversationData) {
  try {
    await db.collection('conversations').add(conversationData);
    console.log('💬 Conversation saved for:', conversationData.user_psid);
    return true;
  } catch (error) {
    console.error('❌ Error saving conversation:', error);
    throw error;
  }
}

// Export functions
module.exports = {
  db,
  saveCustomerTracking,
  getCustomerTracking,
  saveConversation
};