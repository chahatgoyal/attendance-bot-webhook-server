import twilio from "twilio";
import dotenv from "dotenv";
import { Twilio } from "twilio";

dotenv.config();

// Initialize Twilio client with proper error handling
let twilioClient: Twilio;
try {
  // Use test credentials in development
  const accountSid = process.env.NODE_ENV === 'development' 
    ? process.env.TWILIO_TEST_ACCOUNT_SID 
    : process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.NODE_ENV === 'development'
    ? process.env.TWILIO_TEST_AUTH_TOKEN
    : process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error('Missing Twilio credentials');
  }

  twilioClient = twilio(accountSid, authToken);
  console.log("Twilio client initialized successfully with", 
    process.env.NODE_ENV === 'development' ? "test" : "production", "credentials");
} catch (err) {
  console.error("Error initializing Twilio client:", err);
  throw err;
}

export { twilioClient }; 