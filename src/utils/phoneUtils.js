export function formatPhoneNumber(phoneNumber) {
  // Remove 'whatsapp:' prefix and trim spaces
  return phoneNumber.replace('whatsapp:', '').replace(/\s+/g, '');
}

export function generateJoinLink(phoneNumber) {
  const sandboxCode = process.env.NODE_ENV === 'development' 
    ? process.env.TWILIO_TEST_SANDBOX_CODE 
    : process.env.TWILIO_SANDBOX_CODE;
  const whatsappNumber = process.env.TWILIO_FROM_WHATSAPP;
  // URL encode the join message to ensure it works in the link
  const joinMessage = encodeURIComponent(`join ${sandboxCode}`);
  return `https://wa.me/${whatsappNumber}?text=${joinMessage}`;
} 