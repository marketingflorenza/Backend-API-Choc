export default async function handler(request, response) {
  if (request.method === 'GET') {
    // Webhook verification
    const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token'];
    const challenge = request.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      return response.status(200).send(challenge);
    } else {
      return response.status(403).send('Forbidden');
    }
  }

  if (request.method === 'POST') {
    // Receive messages
    const body = request.body;
    
    if (body.object === 'page') {
      body.entry.forEach(entry => {
        const webhookEvent = entry.messaging[0];
        console.log('Received message:', webhookEvent);
        
        // Process message here
        if (webhookEvent.message) {
          const senderId = webhookEvent.sender.id;
          const messageText = webhookEvent.message.text;
          console.log(`Message from ${senderId}: ${messageText}`);
        }
      });
      
      return response.status(200).send('EVENT_RECEIVED');
    } else {
      return response.status(404).send('Not Found');
    }
  }
}