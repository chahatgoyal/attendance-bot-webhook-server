import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import db from "./firebase.js"; // Import Firestore
import twilio from "twilio";

dotenv.config();

// Debug: Check if environment variables are loaded
console.log("Environment variables check:");
console.log("TWILIO_ACCOUNT_SID:", process.env.TWILIO_ACCOUNT_SID ? "Set" : "Not set");
console.log("TWILIO_AUTH_TOKEN:", process.env.TWILIO_AUTH_TOKEN ? "Set" : "Not set");
console.log("TWILIO_FROM_WHATSAPP:", process.env.TWILIO_FROM_WHATSAPP ? "Set" : "Not set");
console.log("TWILIO_SANDBOX_CODE:", process.env.TWILIO_SANDBOX_CODE ? "Set" : "Not set");
console.log("TWILIO_TEST_SANDBOX_CODE:", process.env.TWILIO_TEST_SANDBOX_CODE ? "Set" : "Not set");

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Initialize Twilio client with proper error handling
let twilioClient;
try {
  // Use test credentials in development
  const accountSid = process.env.NODE_ENV === 'development' 
    ? process.env.TWILIO_TEST_ACCOUNT_SID 
    : process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.NODE_ENV === 'development'
    ? process.env.TWILIO_TEST_AUTH_TOKEN
    : process.env.TWILIO_AUTH_TOKEN;

  twilioClient = twilio(accountSid, authToken);
  console.log("Twilio client initialized successfully with", 
    process.env.NODE_ENV === 'development' ? "test" : "production", "credentials");
} catch (err) {
  console.error("Error initializing Twilio client:", err);
}
 
// Store admin states
const adminStates = new Map();
const adminTempData = new Map();

function getNextBusinessDay() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const day = date.getDay();
  if (day === 6) date.setDate(date.getDate() + 2); // Skip Saturday
  if (day === 0) date.setDate(date.getDate() + 1); // Skip Sunday
  return date.toISOString().split("T")[0];
}

function formatPhoneNumber(phoneNumber) {
  // Remove 'whatsapp:' prefix and trim spaces
  return phoneNumber.replace('whatsapp:', '').replace(/\s+/g, '');
}

async function sendWelcomeMessage(phoneNumber, traineeName) {
  if (!twilioClient) {
    console.error("Twilio client not initialized");
    return;
  }

  try {
    console.log(`Attempting to send welcome message to ${phoneNumber}`);
    
    // First message with welcome and sandbox code
    try {
      const joinLink = generateJoinLink(phoneNumber);
      const sandboxCode = process.env.NODE_ENV === 'development' 
        ? process.env.TWILIO_TEST_SANDBOX_CODE 
        : process.env.TWILIO_SANDBOX_CODE;
      
      const firstMessage = await twilioClient.messages.create({
        body: `Welcome ${traineeName} to our Badminton Training Program! 🏸\n\nTo join our WhatsApp service, click this link:\n${joinLink}\n\nOr send "join ${sandboxCode}" to this number.`,
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
      
      // Store the trainee in a pending state
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
  } catch (err) {
    console.error("Error in welcome message process:", err);
  }
}

function generateJoinLink(phoneNumber) {
  const sandboxCode = process.env.NODE_ENV === 'development' 
    ? process.env.TWILIO_TEST_SANDBOX_CODE 
    : process.env.TWILIO_SANDBOX_CODE;
  const whatsappNumber = process.env.TWILIO_FROM_WHATSAPP;
  return `https://wa.me/${whatsappNumber}?text=join%20${sandboxCode}`;
}

async function isSuperAdmin(phoneNumber) {
  try {
    const adminSnapshot = await db.collection("superAdmin").where("phoneNumber", "==", phoneNumber).get();
    return !adminSnapshot.empty;
  } catch (err) {
    console.error("Error checking super admin status:", err);
    return false;
  }
}

function generateAdminOptions() {
  return `Welcome to Admin Panel! Please select an option:
1. Onboard a new trainee
2. Give list of trainees who have completed their sessions`;
}

async function handleAdminResponse(phoneNumber, message) {
  const state = adminStates.get(phoneNumber) || 'initial';
  let response = '';

  switch (state) {
    case 'initial':
      if (message === '1') {
        adminStates.set(phoneNumber, 'onboarding_details');
        response = 'Please enter trainee details in the following format:\n\nName: [Full Name]\nPhone: [WhatsApp number with country code]\nSessions: [Number of sessions 1-50]\n\nExample:\nName: John Doe\nPhone: +1234567890\nSessions: 10';
      } else if (message === '2') {
        adminStates.set(phoneNumber, 'list_trainees');
        const trainees = await getCompletedTrainees();
        response = trainees;
      } else {
        response = 'Invalid option. Please select 1 or 2.';
      }
      break;

    case 'onboarding_details':
      try {
        // Parse the message to extract details
        const nameMatch = message.match(/Name:\s*([^\n]+)/i);
        const phoneMatch = message.match(/Phone:\s*([^\n]+)/i);
        const sessionsMatch = message.match(/Sessions:\s*(\d+)/i);

        if (!nameMatch || !phoneMatch || !sessionsMatch) {
          response = 'Invalid format. Please use the exact format:\n\nName: [Full Name]\nPhone: [WhatsApp number with country code]\nSessions: [Number of sessions 1-50]';
          break;
        }

        const traineeName = nameMatch[1].trim();
        const traineePhone = formatPhoneNumber(phoneMatch[1].trim());
        const sessions = parseInt(sessionsMatch[1]);

        if (traineeName.length < 2) {
          response = 'Name is too short. Please enter a valid full name.';
          break;
        }

        if (!traineePhone.match(/^\+?[1-9]\d{1,14}$/)) {
          response = 'Invalid phone number format. Please enter a valid WhatsApp number with country code.';
          break;
        }

        if (isNaN(sessions) || sessions < 1 || sessions > 50) {
          response = 'Please enter a valid number of sessions (1-50).';
          break;
        }

        // Generate join link
        const joinLink = generateJoinLink(traineePhone);
        
        // Store in pending trainees
        await db.collection("pendingTrainees").add({
          name: traineeName,
          phoneNumber: traineePhone,
          totalSessions: sessions,
          remainingSessions: sessions,
          status: 'pending_join',
          createdAt: new Date(),
          sandboxCode: process.env.NODE_ENV === 'development' 
            ? process.env.TWILIO_TEST_SANDBOX_CODE 
            : process.env.TWILIO_SANDBOX_CODE,
          joinLink: joinLink,
          environment: process.env.NODE_ENV
        });

        response = `Trainee details received! Here's the join link to share with ${traineeName}:\n\n${joinLink}\n\nOnce they click this link and join, they'll be automatically added to the system.`;
        adminStates.set(phoneNumber, 'initial');
      } catch (err) {
        console.error("Error processing trainee details:", err);
        response = 'Error processing trainee details. Please try again.';
      }
      break;

    case 'list_trainees':
      response = generateAdminOptions();
      adminStates.set(phoneNumber, 'initial');
      break;

    default:
      response = generateAdminOptions();
      adminStates.set(phoneNumber, 'initial');
  }

  return response;
}

async function getCompletedTrainees() {
  try {
    const traineesSnapshot = await db.collection("trainees")
      .where("status", "==", "completed")
      .get();
    
    if (traineesSnapshot.empty) {
      return "No trainees have completed their sessions yet.";
    }

    let response = "Trainees who have completed their sessions:\n";
    traineesSnapshot.forEach(doc => {
      const trainee = doc.data();
      response += `- ${trainee.name} (${trainee.phoneNumber})\n`;
    });
    return response;
  } catch (err) {
    console.error("Error fetching completed trainees:", err);
    return "Error fetching completed trainees list.";
  }
}

app.post("/webhook", async (req, res) => {
  const { From, Body } = req.body;
  const formattedFrom = formatPhoneNumber(From);
  
  console.log("Webhook received:", {
    from: From,
    formattedFrom: formattedFrom,
    body: Body,
    timestamp: new Date().toISOString(),
    isTestNumber: process.env.NODE_ENV === 'development'
  });

  // Handle sandbox join command
  if (Body.toLowerCase().startsWith('join')) {
    console.log("Received join command from:", formattedFrom);
    
    // Check if this is a pending trainee
    const pendingTrainee = await db.collection("pendingTrainees")
      .where("phoneNumber", "==", formattedFrom)
      .where("status", "==", "pending_join")
      .get();

    if (!pendingTrainee.empty) {
      // Move trainee from pending to active
      const traineeData = pendingTrainee.docs[0].data();
      await db.collection("trainees").add({
        name: traineeData.name,
        phoneNumber: formattedFrom,
        totalSessions: traineeData.totalSessions,
        remainingSessions: traineeData.remainingSessions,
        joinedDate: new Date(),
        status: 'active'
      });

      // Delete from pending
      await pendingTrainee.docs[0].ref.delete();

      // Send welcome message
      const response = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Message>Welcome ${traineeData.name} to the Badminton Training Program! 🏸\n\nYou have ${traineeData.totalSessions} sessions available. Send "Hi" to get started.</Message>
        </Response>`;
      res.set("Content-Type", "text/xml");
      res.send(response);
      return;
    }

    // Regular join response for non-pending users
    const response = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Message>Welcome to the Badminton Training Program! You can now interact with our chatbot. Send "Hi" to get started.</Message>
      </Response>`;
    res.set("Content-Type", "text/xml");
    res.send(response);
    return;
  }

  const date = getNextBusinessDay();

  // Check if the message is "Hi" and if the user is a super admin
  if (Body.trim().toLowerCase() === "hi") {
    console.log("Received 'Hi' message, checking admin status...");
    const isAdmin = await isSuperAdmin(formattedFrom);
    console.log("Admin check result:", {
      phoneNumber: formattedFrom,
      isAdmin: isAdmin
    });
    
    if (isAdmin) {
      console.log("User is admin, sending admin options...");
      adminStates.set(formattedFrom, 'initial');
      const response = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Message>${generateAdminOptions()}</Message>
        </Response>`;
      res.set("Content-Type", "text/xml");
      res.send(response);
      return;
    } else {
      console.log("User is not admin, proceeding with regular flow...");
      // Send welcome message for regular users
      const response = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Message>Welcome to Badminton Training! Are you attending training tomorrow?\n\n1. Yes\n2. No</Message>
        </Response>`;
      res.set("Content-Type", "text/xml");
      res.send(response);
      return;
    }
  }

  // Handle admin responses if user is in admin state
  if (adminStates.has(formattedFrom)) {
    console.log("Processing admin response...");
    const adminResponse = await handleAdminResponse(formattedFrom, Body.trim());
    const response = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Message>${adminResponse}</Message>
      </Response>`;
    res.set("Content-Type", "text/xml");
    res.send(response);
    return;
  }

  // Regular attendance flow - only if not in admin conversation
  let response = Body.trim();
  let attendance = "Unknown";
  
  if (response === "1") {
    attendance = "Yes";
  } else if (response === "2") {
    attendance = "No";
  }

  try {
    await db.collection("attendance").add({
      user: formattedFrom,
      message: attendance,
      date: date,
      timestamp: new Date(),
    });
    console.log(`Saved attendance from ${formattedFrom}: "${attendance}" for ${date}`);
  } catch (err) {
    console.error("Error saving to Firestore:", err);
  }

  // Always send a response, even if we hit rate limits
  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));