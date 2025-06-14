export function formatPhoneNumber(phoneNumber: string): string {
  // Remove 'whatsapp:' prefix and trim spaces
  return phoneNumber.replace('whatsapp:', '').replace(/\s+/g, '');
}

export function generateJoinLink(phoneNumber: string): string {
  const sandboxCode = process.env.NODE_ENV === 'development' 
    ? process.env.TWILIO_TEST_SANDBOX_CODE 
    : process.env.TWILIO_SANDBOX_CODE;
  const whatsappNumber = process.env.TWILIO_FROM_WHATSAPP;
  
  if (!sandboxCode || !whatsappNumber) {
    throw new Error('Missing required environment variables for join link generation');
  }
  
  // URL encode the join message to ensure it works in the link
  const joinMessage = encodeURIComponent(`join ${sandboxCode}`);
  return `https://wa.me/${whatsappNumber}?text=${joinMessage}`;
} 