export function formatPhoneNumber(phoneNumber: string): string {
  // Remove 'whatsapp:' prefix and trim spaces
  return phoneNumber.replace('whatsapp:', '').replace(/\s+/g, '');
}

// Remove generateJoinLink, as it was only used for sandbox onboarding 