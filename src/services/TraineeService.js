import db from "../config/firebase.js";
import { twilioClient } from "../config/twilio.config.js";
import { generateJoinLink } from "../utils/phoneUtils.js";

export async function isDuplicatePendingTrainee(phoneNumber) {
  const existingTrainee = await db.collection("pendingTrainees")
    .where("phoneNumber", "==", phoneNumber)
    .where("status", "==", "pending_join")
    .get();
  return !existingTrainee.empty;
}

export async function isDuplicateTrainee(phoneNumber) {
  const existingTrainee = await db.collection("trainees")
    .where("phoneNumber", "==", phoneNumber)
    .get();
  return !existingTrainee.empty;
}

export async function sendWelcomeMessage(phoneNumber, traineeName) {
  if (!twilioClient) {
    console.error("Twilio client not initialized");
    return;
  }

  try {
    console.log(`Attempting to send welcome message to ${phoneNumber}`);
    
    // Check for duplicates before proceeding
    if (await isDuplicatePendingTrainee(phoneNumber)) {
      console.log(`Duplicate pending trainee found for ${phoneNumber}`);
      return;
    }
    
    // First message with welcome and sandbox code
    try {
      const joinLink = generateJoinLink(phoneNumber);
      const sandboxCode = process.env.NODE_ENV === 'development' 
        ? process.env.TWILIO_TEST_SANDBOX_CODE 
        : process.env.TWILIO_SANDBOX_CODE;
      
      const firstMessage = await twilioClient.messages.create({
        body: `Welcome ${traineeName} to our Badminton Training Program! 🏸\n\nTo join our WhatsApp service:\n1. Click this link: ${joinLink}\n2. When WhatsApp opens, click "Send" to join\n3. Wait for our welcome message\n\nOr send "join ${sandboxCode}" to this number.`,
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      
      console.log("First message sent successfully:", {
        messageSid: firstMessage.sid,
        status: firstMessage.status,
        to: firstMessage.to,
        environment: process.env.NODE_ENV
      });
    } catch (err) {
      console.error("Error sending welcome message:", {
        error: err.message,
        code: err.code,
        status: err.status,
        phoneNumber: phoneNumber,
        traineeName: traineeName,
        environment: process.env.NODE_ENV
      });
      
      // Store in pending trainees only if not a duplicate
      if (!await isDuplicatePendingTrainee(phoneNumber)) {
        const sandboxCode = process.env.NODE_ENV === 'development' 
          ? process.env.TWILIO_TEST_SANDBOX_CODE 
          : process.env.TWILIO_SANDBOX_CODE;
        
        await db.collection("pendingTrainees").add({
          name: traineeName,
          phoneNumber: phoneNumber,
          status: 'pending_join',
          createdAt: new Date(),
          sandboxCode: sandboxCode,
          joinLink: generateJoinLink(phoneNumber),
          environment: process.env.NODE_ENV
        });
      }
    }
  } catch (err) {
    console.error("Error in welcome message process:", err);
  }
} 