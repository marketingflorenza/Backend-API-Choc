export default async function handler(request, response) {
  if (request.method === 'GET') {
    const VERIFY_TOKEN = process.env.WEBHOOK_VERIFY_TOKEN;
    
    // Facebook sends: hub.mode, hub.verify_token, hub.challenge
    const mode = request.query['hub.mode'];
    const token = request.query['hub.verify_token']; 
    const challenge = request.query['hub.challenge'];
    
    console.log('Verification request:', { mode, token, challenge });
    console.log('Expected token:', VERIFY_TOKEN);
    
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED');
      return response.status(200).send(challenge);
    } else {
      console.log('Verification failed');
      return response.status(403).json({
        error: 'Forbidden',
        expected: VERIFY_TOKEN,
        received: token
      });
    }
  }
  
  // POST handling...
  return response.status(200).json({ received: true });
}