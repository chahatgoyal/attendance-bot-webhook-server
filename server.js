import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import db from "./firebase.js"; // Import Firestore
import twilio from "twilio";
import cron from "node-cron";
import https from 'https';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Move environment checks outside of request handlers
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Helper function to check for duplicate pending trainee
async function isDuplicatePendingTrainee(phoneNumber) {
  const existingTrainee = await db.collection("pendingTrainees")
    .where("phoneNumber", "==", phoneNumber)
    .where("status", "==", "pending_join")
    .get();
  return !existingTrainee.empty;
}

// Helper function to check for duplicate trainee
async function isDuplicateTrainee(phoneNumber) {
  const existingTrainee = await db.collection("trainees")
    .where("phoneNumber", "==", phoneNumber)
    .get();
  return !existingTrainee.empty;
}

// Helper function to check for duplicate attendance
async function isDuplicateAttendance(phoneNumber, date) {
  const existingAttendance = await db.collection("attendance")
    .where("user", "==", phoneNumber)
    .where("date", "==", date)
    .get();
  return !existingAttendance.empty;
}

// Helper function to check for duplicate attendance request
async function isDuplicateAttendanceRequest(phoneNumber, date) {
  const existingRequest = await db.collection("attendanceRequests")
    .where("traineePhone", "==", phoneNumber)
    .where("date", "==", date)
    .where("status", "==", "pending")
    .get();
  return !existingRequest.empty;
}

// Modify the sendWelcomeMessage function to remove TTL references
async function sendWelcomeMessage(phoneNumber, traineeName) {
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

// Add this helper function to get pending trainees
async function getPendingTrainees() {
  try {
    const pendingSnapshot = await db.collection("pendingTrainees")
      .where("status", "==", "pending_join")
      .orderBy("createdAt", "desc")
      .get();
    
    if (pendingSnapshot.empty) {
      return {
        trainees: [],
        total: 0
      };
    }

    const pendingTrainees = pendingSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        createdAt: data.createdAt.toDate(),
        daysPending: Math.floor((new Date() - data.createdAt.toDate()) / (1000 * 60 * 60 * 24))
      };
    });

    return {
      trainees: pendingTrainees,
      total: pendingTrainees.length
    };
  } catch (err) {
    console.error("Error fetching pending trainees:", err);
    throw err;
  }
}

function formatPendingTraineesList(data) {
  if (data.trainees.length === 0) {
    return "No pending trainees found.";
  }

  let response = `⏳ Pending Trainees\n\n`;
  data.trainees.forEach((trainee, index) => {
    response += `${index + 1}. ${trainee.name}\n`;
    response += `   📱 ${trainee.phoneNumber}\n`;
    response += `   🎯 ${trainee.totalSessions} sessions\n`;
    response += `   📅 Created: ${trainee.createdAt.toLocaleDateString()}\n`;
    response += `   ⏳ Pending for: ${trainee.daysPending} days\n`;
    response += `   🔗 Join Link: ${trainee.joinLink}\n\n`;
  });

  response += `\nTotal: ${data.total} pending trainees`;

  return response;
}

// Update the admin options
function generateAdminOptions() {
  return `🎯 Admin Panel\n
Options (reply with number):
1. Onboard trainee
2. View completed trainees
3. Update trainee
4. Remove trainee
5. List active trainees
6. Export trainees to CSV
7. View trainees with low sessions
8. View pending trainees
9. Help
10. Create sample test data

Example: Send "1" to onboard a new trainee.`;
}

// Update the help message
function generateHelpMessage() {
  return `📚 Admin Panel Help\n
1. Onboard trainee
   - Add new trainee details
   - Generate join link
   - Set initial sessions\n
2. View completed trainees
   - See list of trainees who finished all sessions
   - Check their history\n
3. Update trainee
   - Modify trainee information
   - Update remaining sessions\n
4. Remove trainee
   - Remove trainee from the system
   - Archive their data\n
5. List active trainees
   - View all current trainees
   - See their session status
   - Navigate through pages\n
6. Export trainees to CSV
   - Download list of active trainees
   - Includes all trainee details\n
7. View trainees with low sessions
   - Check trainees with few sessions remaining
   - Set custom session threshold
   - See who needs to renew\n
8. View pending trainees
   - See trainees who haven't joined yet
   - Check pending duration
   - Access join links\n
9. Help
   - Show this help message\n
10. Create sample test data
   - Add 10 sample trainees
   - Useful for testing features\n
Send "back" to return to main menu.`;
}

// Add this helper function for logging
function logStateChange(phoneNumber, oldState, newState, message) {
  console.log(`[State Change] ${phoneNumber}:
    Old State: ${oldState}
    New State: ${newState}
    Message: ${message}
    Timestamp: ${new Date().toISOString()}
  `);
}

// Add this helper function to manage state
function setAdminState(phoneNumber, newState, message = '') {
  const oldState = adminStates.get(phoneNumber) || 'initial';
  adminStates.set(phoneNumber, newState);
  logStateChange(phoneNumber, oldState, newState, message);
  console.log(`[State Management] State set for ${phoneNumber}:`, {
    oldState,
    newState,
    message,
    timestamp: new Date().toISOString()
  });
}

// Modify handleAdminResponse to include logging
async function handleAdminResponse(phoneNumber, message) {
  const oldState = adminStates.get(phoneNumber) || 'initial';
  let response = '';

  console.log(`[Admin Response] Processing message from ${phoneNumber}:
    Current State: ${oldState}
    Message: ${message}
    Timestamp: ${new Date().toISOString()}
  `);

  switch (oldState) {
    case 'initial':
      if (message === '1') {
        adminStates.set(phoneNumber, 'onboarding_details');
        logStateChange(phoneNumber, oldState, 'onboarding_details', message);
        response = `📝 New Trainee\n
Enter details:
Name: [Full Name]
Phone: [WhatsApp number with country code]
Sessions: [Number 1-50]

Example:
Name: John Doe
Phone: +1234567890
Sessions: 10`;
      } else if (message === '2') {
        console.log(`[Operation] Fetching completed trainees for ${phoneNumber}`);
        const trainees = await getCompletedTrainees();
        response = trainees;
        adminStates.set(phoneNumber, 'initial');
        logStateChange(phoneNumber, oldState, 'initial', 'Completed trainees fetch');
      } else if (message === '3') {
        adminStates.set(phoneNumber, 'update_trainee');
        logStateChange(phoneNumber, oldState, 'update_trainee', message);
        response = `📝 Update Trainee\n
Enter phone number:
Phone: [WhatsApp number with country code]`;
      } else if (message === '4') {
        adminStates.set(phoneNumber, 'remove_trainee');
        logStateChange(phoneNumber, oldState, 'remove_trainee', message);
        response = `🗑️ Remove Trainee\n
Enter phone number:
Phone: [WhatsApp number with country code]`;
      } else if (message === '5') {
        console.log(`[Operation] Fetching active trainees for ${phoneNumber}`);
        const data = await getActiveTrainees(1);
        adminTempData.set(phoneNumber, { page: 1 });
        response = formatTraineesList(data);
        adminStates.set(phoneNumber, 'list_active_trainees');
        logStateChange(phoneNumber, oldState, 'list_active_trainees', message);
      } else if (message === '6') {
        try {
          console.log(`[Operation] Generating CSV for ${phoneNumber}`);
          const csvContent = await generateTraineesCSV();
          if (!csvContent) {
            response = `❌ No active trainees found to export.`;
            adminStates.set(phoneNumber, 'initial');
            logStateChange(phoneNumber, oldState, 'initial', 'No trainees found for CSV');
          } else {
            const downloadUrl = `${process.env.NGROK_URL || 'http://localhost:3000'}/download-csv`;
            const message = await twilioClient.messages.create({
              body: `📊 Click the link below to download the trainees CSV file:\n${downloadUrl}\n\nThis link will expire in 5 minutes.`,
              from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
              to: `whatsapp:${phoneNumber}`
            });
            response = `✅ Download link has been sent to your WhatsApp.`;
            adminStates.set(phoneNumber, 'initial');
            logStateChange(phoneNumber, oldState, 'initial', 'CSV link sent');
          }
        } catch (err) {
          console.error("[Error] CSV Generation:", err);
          response = `❌ Error generating CSV file: ${err.message}`;
          adminStates.set(phoneNumber, 'initial');
          logStateChange(phoneNumber, oldState, 'initial', 'CSV generation error');
        }
      } else if (message === '7') {
        adminStates.set(phoneNumber, 'expiring_memberships');
        logStateChange(phoneNumber, oldState, 'expiring_memberships', message);
        response = `📊 View Trainees with Low Sessions\n
Enter the maximum number of remaining sessions to check (1-50):

Example: 5 (to see trainees with 5 or fewer sessions remaining)`;
      } else if (message === '8') {
        console.log(`[Operation] Fetching pending trainees for ${phoneNumber}`);
        const data = await getPendingTrainees();
        response = formatPendingTraineesList(data);
        adminStates.set(phoneNumber, 'initial');
        logStateChange(phoneNumber, oldState, 'initial', 'Pending trainees viewed');
      } else if (message === '9') {
        adminStates.set(phoneNumber, 'help');
        logStateChange(phoneNumber, oldState, 'help', message);
        response = generateHelpMessage();
      } else if (message === '10') {
        try {
          console.log(`[Operation] Creating sample data for ${phoneNumber}`);
          response = await createSampleTestData();
          adminStates.set(phoneNumber, 'initial');
          logStateChange(phoneNumber, oldState, 'initial', 'Sample data created');
        } catch (err) {
          console.error("[Error] Sample Data Creation:", err);
          response = `❌ Error creating sample data: ${err.message}`;
          adminStates.set(phoneNumber, 'initial');
          logStateChange(phoneNumber, oldState, 'initial', 'Sample data error');
        }
      } else {
        console.log(`[Invalid Option] ${phoneNumber} sent: ${message}`);
        response = `❌ Invalid option. Please reply with a number (1-10).`;
      }
      break;

    case 'list_active_trainees':
      console.log(`[List Active] ${phoneNumber} sent: ${message}`);
      if (message.toLowerCase() === 'back') {
        adminStates.set(phoneNumber, 'initial');
        logStateChange(phoneNumber, oldState, 'initial', 'Back from list view');
        response = "Returned to main menu. Send 'Hi' to see options.";
      } else if (message.toLowerCase() === 'next') {
        const currentPage = adminTempData.get(phoneNumber)?.page || 1;
        console.log(`[List Active] Fetching page ${currentPage + 1} for ${phoneNumber}`);
        const data = await getActiveTrainees(currentPage + 1);
        adminTempData.set(phoneNumber, { page: data.page });
        response = formatTraineesList(data);
      } else {
        response = `Please send "next" for more trainees or "back" to return to main menu.\n\n${formatTraineesList(await getActiveTrainees(1))}`;
      }
      break;

    case 'help':
      if (message.toLowerCase() === 'back') {
        adminStates.set(phoneNumber, 'initial');
        response = "Returned to main menu. Send 'Hi' to see options.";
      } else {
        response = `Please send "back" to return to main menu.\n\n${generateHelpMessage()}`;
      }
      break;

    case 'onboarding_details':
      try {
        // Debug log the original message
        console.log("Original message received:", message);

        // Clean up the message by normalizing line breaks and spaces
        const cleanMessage = message
          .split(/[\r\n]+/)         // Split on any combination of line breaks
          .map(line => line.trim()) // Trim each line
          .filter(line => {         // Remove empty lines and lines with only whitespace
            const trimmed = line.trim();
            return trimmed && trimmed.length > 0;
          })
          .map(line => {
            // Handle any number of spaces around the colon
            return line.replace(/\s*:\s*/, ': ');
          })
          .join('\n');

        console.log("Cleaned message:", cleanMessage);

        // More forgiving regex patterns that handle various whitespace
        const nameMatch = cleanMessage.match(/^[Nn]ame\s*:\s*(.+?)[\n\s]*$/m);
        const phoneMatch = cleanMessage.match(/^[Pp]hone\s*:\s*(.+?)[\n\s]*$/m);
        const sessionsMatch = cleanMessage.match(/^[Ss]essions\s*:\s*(\d+)[\n\s]*$/m);

        // Debug logging
        console.log("Parsing results:", {
          originalMessage: message,
          cleanMessage: cleanMessage,
          nameMatch: nameMatch ? nameMatch[1] : null,
          phoneMatch: phoneMatch ? phoneMatch[1] : null,
          sessionsMatch: sessionsMatch ? sessionsMatch[1] : null
        });

        if (!nameMatch || !phoneMatch || !sessionsMatch) {
          console.log("Failed to parse one or more fields:", {
            hasName: !!nameMatch,
            hasPhone: !!phoneMatch,
            hasSessions: !!sessionsMatch
          });
          
          response = `❌ Invalid format detected!\n
Please use exactly this format:

Name: [Full Name]
Phone: [WhatsApp number with country code]
Sessions: [Number 1-50]

✨ Example:
Name: John Doe
Phone: +1234567890
Sessions: 10

Make sure:
- Each field starts with "Name:", "Phone:", or "Sessions:"
- You can use spaces or empty lines between fields
- No extra text before or after the values

Try again...`;
          break;
        }

        // Clean up the matched values
        const traineeName = nameMatch[1].trim();
        const traineePhone = formatPhoneNumber(phoneMatch[1].trim());
        const sessions = parseInt(sessionsMatch[1].trim());

        console.log("Parsed values:", {
          name: traineeName,
          phone: traineePhone,
          sessions: sessions
        });

        // Check for duplicate trainee before proceeding
        if (await isDuplicateTrainee(traineePhone)) {
          response = `❌ A trainee with this phone number already exists. Please verify the phone number and try again.`;
          adminStates.set(phoneNumber, 'initial');
          break;
        }

        // Check for duplicate pending trainee
        if (await isDuplicatePendingTrainee(traineePhone)) {
          response = `❌ A pending trainee with this phone number already exists. Please wait for them to complete the joining process or verify the phone number.`;
          adminStates.set(phoneNumber, 'initial');
          break;
        }

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

        // Only reset state after successful completion
        const joinLink = generateJoinLink(traineePhone);
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

        response = `✅ Success! Trainee details received!\n
📱 Share this join link with ${traineeName}:
${joinLink}\n
⚠️ Important:
- Trainee must click this link to join
- They will be automatically added once they join
- Their ${sessions} sessions will be activated after joining`;
        adminStates.set(phoneNumber, 'initial');
        logStateChange(phoneNumber, oldState, 'initial', 'Trainee onboarded successfully');
      } catch (err) {
        console.error("[Error] Onboarding:", err);
        response = `❌ Error processing trainee details. Please try again.\n
Make sure to follow the exact format shown above.`;
        // Don't reset state on error
      }
      break;

    case 'list_trainees':
      response = await getCompletedTrainees();
      adminStates.set(phoneNumber, 'initial');
      break;

    case 'update_trainee':
      console.log(`[Update Trainee] Processing message: ${message} for ${phoneNumber}`);
      if (message.startsWith('Phone:')) {
        const traineePhone = formatPhoneNumber(message.split('Phone:')[1].trim());
        console.log(`[Update Trainee] Looking for trainee with phone: ${traineePhone}`);
        
        const traineeSnapshot = await db.collection("trainees")
          .where("phoneNumber", "==", traineePhone)
          .get();

        if (traineeSnapshot.empty) {
          console.log(`[Update Trainee] No trainee found for phone: ${traineePhone}`);
          response = `❌ No trainee found with phone number ${traineePhone}. Please try again.`;
        } else {
          const traineeData = traineeSnapshot.docs[0].data();
          console.log(`[Update Trainee] Found trainee: ${traineeData.name}`);
          
          // Store the data using admin's phone number
          adminTempData.set(phoneNumber, { 
            traineeDoc: traineeSnapshot.docs[0], 
            traineePhone: traineePhone 
          });
          
          // Set new state using admin's phone number
          setAdminState(phoneNumber, 'update_trainee_details', 'Found trainee to update');
          
          console.log(`[Update Trainee] Current state after change:`, adminStates.get(phoneNumber));
          
          response = `📝 Update details for ${traineeData.name}\n
Current details:
- Name: ${traineeData.name}
- Phone: ${traineeData.phoneNumber}
- Remaining Sessions: ${traineeData.remainingSessions}

Please enter new details in this format:
Name: [New Name]
Sessions: [New number of remaining sessions]

Note: Phone number cannot be changed.`;
        }
      } else {
        console.log(`[Update Trainee] Invalid format received: ${message}`);
        response = `❌ Invalid format. Please enter the phone number in this format:\n
Phone: [WhatsApp number with country code]`;
      }
      break;

    case 'update_trainee_details':
      console.log(`[Update Details] Processing message in state ${oldState}: ${message}`);
      try {
        const tempData = adminTempData.get(phoneNumber);
        if (!tempData || !tempData.traineeDoc) {
          console.error("[Error] Missing temp data for update:", { adminPhone: phoneNumber, tempData });
          response = "❌ Error: Session expired. Please start the update process again by sending 'Hi'.";
          setAdminState(phoneNumber, 'initial', 'Session expired');
          break;
        }

        const traineeDoc = tempData.traineeDoc;
        const traineePhone = tempData.traineePhone;

        // More forgiving regex patterns that handle various whitespace
        const nameMatch = message.match(/^[Nn]ame\s*:\s*(.+?)(?:\n|$)/m);
        const sessionsMatch = message.match(/^[Ss]essions\s*:\s*(\d+)(?:\n|$)/m);

        console.log("[Update Details] Parsing input:", {
          message,
          nameMatch: nameMatch ? nameMatch[1] : null,
          sessionsMatch: sessionsMatch ? sessionsMatch[1] : null,
          adminPhone: phoneNumber,
          traineePhone: traineePhone
        });

        if (!nameMatch || !sessionsMatch) {
          response = `❌ Invalid format. Please use exactly this format:\n
Name: [New Name]
Sessions: [New number of remaining sessions]

Example:
Name: John Doe
Sessions: 10`;
          break;
        }

        const newName = nameMatch[1].trim();
        const newSessions = parseInt(sessionsMatch[1].trim());

        if (newName.length < 2) {
          response = '❌ Name is too short. Please enter a valid full name (at least 2 characters).';
          break;
        }

        if (isNaN(newSessions) || newSessions < 0) {
          response = '❌ Please enter a valid number of remaining sessions (0 or more).';
          break;
        }

        // Only reset state after successful update
        await traineeDoc.ref.update({
          name: newName,
          remainingSessions: newSessions,
          status: newSessions === 0 ? "completed" : "active"
        });

        response = `✅ Trainee details updated successfully!\n
New details:
- Name: ${newName}
- Phone: ${traineePhone}
- Remaining Sessions: ${newSessions}`;
        setAdminState(phoneNumber, 'initial', 'Trainee updated successfully');
        adminTempData.delete(phoneNumber);
      } catch (err) {
        console.error("[Error] Update Trainee:", err);
        response = `❌ Error updating trainee details. Please try again with the correct format:\n
Name: [New Name]
Sessions: [New number of remaining sessions]`;
        // Don't reset state on error
      }
      break;

    case 'remove_trainee':
      if (message.startsWith('Phone:')) {
        const phoneNumber = formatPhoneNumber(message.split('Phone:')[1].trim());
        const traineeSnapshot = await db.collection("trainees")
          .where("phoneNumber", "==", phoneNumber)
          .get();

        if (traineeSnapshot.empty) {
          response = `❌ No trainee found with phone number ${phoneNumber}. Please try again.`;
          // Don't reset state on error
        } else {
          const traineeData = traineeSnapshot.docs[0].data();
          await db.collection("archivedTrainees").add({
            ...traineeData,
            archivedAt: new Date(),
            archivedBy: phoneNumber
          });
          await traineeSnapshot.docs[0].ref.delete();
          response = `✅ Trainee ${traineeData.name} has been removed and archived.`;
          adminStates.set(phoneNumber, 'initial');
          logStateChange(phoneNumber, oldState, 'initial', 'Trainee removed successfully');
        }
      } else {
        response = `❌ Invalid format. Please enter the phone number in this format:\n
Phone: [WhatsApp number with country code]`;
        // Don't reset state on invalid format
      }
      break;

    case 'expiring_memberships':
      try {
        const sessions = parseInt(message.trim());
        if (isNaN(sessions) || sessions < 1 || sessions > 50) {
          response = `❌ Please enter a valid number of sessions (1-50).`;
          break;
        }

        console.log(`[Low Sessions] Fetching trainees with ${sessions} or fewer sessions`);
        const data = await getExpiringMemberships(sessions);
        response = formatExpiringMembersList(data);
        adminStates.set(phoneNumber, 'initial');
        logStateChange(phoneNumber, oldState, 'initial', 'Low sessions list viewed');
      } catch (err) {
        console.error("[Error] Low Sessions List:", err);
        response = `❌ Error fetching trainees list. Please try again.`;
      }
      break;

    default:
      console.log(`[Default State] ${phoneNumber} in unknown state: ${oldState}`);
      response = "Returned to main menu. Send 'Hi' to see options.";
      adminStates.set(phoneNumber, 'initial');
      logStateChange(phoneNumber, oldState, 'initial', 'Reset to initial');
  }

  console.log(`[Response] Sending to ${phoneNumber}:
    State: ${adminStates.get(phoneNumber)}
    Response Length: ${response.length}
    Timestamp: ${new Date().toISOString()}
  `);

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

// Modify the handleSandboxJoin function to remove TTL check
async function handleSandboxJoin(phoneNumber, message, res) {
  console.log("Received join command from:", phoneNumber);
  
  // Check if this is a pending trainee
  const pendingTrainee = await db.collection("pendingTrainees")
    .where("phoneNumber", "==", phoneNumber)
    .where("status", "==", "pending_join")
    .get();

  if (!pendingTrainee.empty) {
    // Check for duplicate trainee before moving from pending to active
    if (await isDuplicateTrainee(phoneNumber)) {
      console.log(`Duplicate trainee found for ${phoneNumber}, skipping activation`);
      const response = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Message>You are already registered as a trainee. Send "Hi" to get started.</Message>
        </Response>`;
      res.set("Content-Type", "text/xml");
      res.send(response);
      return;
    }

    // Move trainee from pending to active
    const traineeData = pendingTrainee.docs[0].data();
    await db.collection("trainees").add({
      name: traineeData.name,
      phoneNumber: phoneNumber,
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
}

// Handler for admin in conversation
async function handleAdminInConversation(phoneNumber, message, res) {
  console.log("Processing admin response from:", phoneNumber);
  const adminResponse = await handleAdminResponse(phoneNumber, message.trim());
  const response = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Message>${adminResponse}</Message>
    </Response>`;
  res.set("Content-Type", "text/xml");
  res.send(response);
}

// Handler for attendance responses
async function handleAttendanceResponse(phoneNumber, message, res) {
  console.log(`Checking if "${message}" is an attendance response from ${phoneNumber}`);
  
  // Get tomorrow's date
  const tomorrow = getNextBusinessDay();
  
  // Check if we have a pending attendance request for this trainee
  const requestsSnapshot = await db.collection("attendanceRequests")
    .where("traineePhone", "==", phoneNumber)
    .where("date", "==", tomorrow)
    .where("status", "==", "pending")
    .get();
  
  if (requestsSnapshot.empty) {
    console.log(`No pending attendance request found for ${phoneNumber}`);
    return false; // Not handled, continue to other handlers
  }
  
  console.log(`Found attendance request for ${phoneNumber}, processing response`);
  
  // Check for duplicate attendance before proceeding
  if (await isDuplicateAttendance(phoneNumber, tomorrow)) {
    console.log(`Duplicate attendance found for ${phoneNumber} on ${tomorrow}`);
    const response = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Message>You have already responded to today's attendance request.</Message>
      </Response>`;
    res.set("Content-Type", "text/xml");
    res.send(response);
    return true;
  }
  
  // Found a pending request, update it
  const requestDoc = requestsSnapshot.docs[0];
  const requestData = requestDoc.data();
  
  // Update the attendance request
  await requestDoc.ref.update({
    response: message === "1" ? "Yes" : "No",
    responseTime: new Date(),
    status: "responded"
  });
  
  // Save to attendance collection
  await db.collection("attendance").add({
    user: phoneNumber,
    traineeName: requestData.traineeName,
    message: message === "1" ? "Yes" : "No", 
    date: tomorrow,
    timestamp: new Date(),
  });
  
  // If the trainee is attending, decrement their remaining sessions
  if (message === "1") {
    const traineeSnapshot = await db.collection("trainees")
      .where("phoneNumber", "==", phoneNumber)
      .get();
    
    if (!traineeSnapshot.empty) {
      const traineeDoc = traineeSnapshot.docs[0];
      const traineeData = traineeDoc.data();
      
      if (traineeData.remainingSessions > 0) {
        const newRemaining = traineeData.remainingSessions - 1;
        await traineeDoc.ref.update({
          remainingSessions: newRemaining,
          status: newRemaining === 0 ? "completed" : "active"
        });
        
        // Send confirmation with updated session count
        const response = `<?xml version="1.0" encoding="UTF-8"?>
          <Response>
            <Message>Thank you! You're confirmed for tomorrow's training (${formatDate(tomorrow)}). You now have ${newRemaining} sessions remaining.</Message>
          </Response>`;
        res.set("Content-Type", "text/xml");
        res.send(response);
        return true;
      }
    }
  }
  
  // Send confirmation response
  const response = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Message>Thank you for your response. ${message === "1" ? "We'll see you tomorrow!" : "Maybe next time!"}</Message>
    </Response>`;
  res.set("Content-Type", "text/xml");
  res.send(response);
  return true;
}

// Handler for "Hi" command
async function handleHiCommand(phoneNumber, res) {
  console.log("Received 'Hi' message from:", phoneNumber, "checking admin status...");
  
  // Check if the user is a super admin
  const isAdmin = await isSuperAdmin(phoneNumber);
  console.log("Admin check result:", {
    phoneNumber: phoneNumber,
    isAdmin: isAdmin
  });
  
  // Always reset admin state and temp data when receiving "Hi"
  console.log(`Resetting admin state for ${phoneNumber}`);
  adminStates.delete(phoneNumber);
  if (adminTempData.has(phoneNumber)) {
    adminTempData.delete(phoneNumber);
  }
  
  if (isAdmin) {
    // Handle admin "Hi"
    console.log("User is admin, sending admin options...");
    const response = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Message>👋 Hello Admin!\n\n${generateAdminOptions()}</Message>
      </Response>`;
    res.set("Content-Type", "text/xml");
    res.send(response);
  } else {
    // Handle trainee "Hi"
    console.log("User is trainee, providing trainee options...");
    await handleTraineeOptions(phoneNumber, res);
  }
}

// Handler for trainee options after saying "Hi"
async function handleTraineeOptions(phoneNumber, res) {
  try {
    // Get trainee information
    const traineeSnapshot = await db.collection("trainees")
      .where("phoneNumber", "==", phoneNumber)
      .where("status", "==", "active")
      .get();
    
    if (traineeSnapshot.empty) {
      // Not found or not active
      const response = `<?xml version="1.0" encoding="UTF-8"?>
        <Response>
          <Message>Welcome to Badminton Training! Are you attending training tomorrow?\n\n1. Yes\n2. No</Message>
        </Response>`;
      res.set("Content-Type", "text/xml");
      res.send(response);
      return;
    }
    
    // Found active trainee
    const traineeData = traineeSnapshot.docs[0].data();
    const response = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Message>Hello ${traineeData.name}!\n\nYou have ${traineeData.remainingSessions} sessions remaining.\n\nBadminton Training Options:\n1. Check remaining sessions\n2. Update your profile\n\nOr simply wait for the daily attendance check.</Message>
      </Response>`;
    res.set("Content-Type", "text/xml");
    res.send(response);
    
  } catch (err) {
    console.error("Error handling trainee options:", err);
    const response = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Message>Sorry, there was an error retrieving your information. Please try again later.</Message>
      </Response>`;
    res.set("Content-Type", "text/xml");
    res.send(response);
  }
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Helper endpoint to list Twilio phone numbers
app.get("/list-phone-numbers", async (req, res) => {
  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const numbers = await client.incomingPhoneNumbers.list();
    
    const formattedNumbers = numbers.map(number => ({
      phoneNumber: number.phoneNumber,
      sid: number.sid,
      friendlyName: number.friendlyName,
      capabilities: number.capabilities
    }));
    
    res.json({
      success: true,
      numbers: formattedNumbers
    });
  } catch (err) {
    console.error("Error listing phone numbers:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Add these helper functions after the existing helper functions
async function getActiveTrainees(page = 1, pageSize = 10) {
  try {
    const traineesSnapshot = await db.collection("trainees")
      .where("status", "==", "active")
      .orderBy("joinedDate", "desc")
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .get();
    
    if (traineesSnapshot.empty) {
      return {
        trainees: [],
        total: 0,
        page: page,
        hasMore: false
      };
    }

    // Get total count
    const totalSnapshot = await db.collection("trainees")
      .where("status", "==", "active")
      .count()
      .get();
    
    const total = totalSnapshot.data().count;
    const trainees = traineesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        name: data.name,
        phone: data.phoneNumber,
        remainingSessions: data.remainingSessions,
        joinedDate: data.joinedDate.toDate().toLocaleDateString()
      };
    });

    return {
      trainees,
      total,
      page,
      hasMore: (page * pageSize) < total
    };
  } catch (err) {
    console.error("Error fetching active trainees:", err);
    throw err;
  }
}

function formatTraineesList(data) {
  if (data.trainees.length === 0) {
    return "No active trainees found.";
  }

  let response = `📋 Active Trainees (Page ${data.page})\n\n`;
  data.trainees.forEach((trainee, index) => {
    response += `${index + 1}. ${trainee.name}\n`;
    response += `   📱 ${trainee.phone}\n`;
    response += `   🎯 ${trainee.remainingSessions} sessions left\n`;
    response += `   📅 Joined: ${trainee.joinedDate}\n\n`;
  });

  response += `\nTotal: ${data.total} trainees`;
  if (data.hasMore) {
    response += `\n\nSend "next" for more trainees`;
  }
  response += `\nSend "back" to return to main menu`;

  return response;
}

// Add these helper functions after the existing helper functions
async function generateTraineesCSV() {
  try {
    // First get all active trainees without ordering
    const traineesSnapshot = await db.collection("trainees")
      .where("status", "==", "active")
      .get();
    
    if (traineesSnapshot.empty) {
      return null;
    }

    // Create CSV header
    let csvContent = "Name,Phone Number,Remaining Sessions,Join Date\n";
    
    // Add trainee data and sort in memory
    const trainees = traineesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        joinedDate: data.joinedDate.toDate()
      };
    }).sort((a, b) => b.joinedDate - a.joinedDate); // Sort by join date descending
    
    // Generate CSV content
    trainees.forEach(data => {
      const joinDate = data.joinedDate.toLocaleDateString();
      // Escape fields that might contain commas
      const name = `"${data.name.replace(/"/g, '""')}"`;
      const phone = `"${data.phoneNumber}"`;
      csvContent += `${name},${phone},${data.remainingSessions},${joinDate}\n`;
    });

    return csvContent;
  } catch (err) {
    console.error("Error generating CSV:", err);
    throw err;
  }
}

// Update the getExpiringMemberships function
async function getExpiringMemberships(sessions) {
  try {
    const traineesSnapshot = await db.collection("trainees")
      .where("status", "==", "active")
      .where("remainingSessions", "<=", sessions)
      .orderBy("remainingSessions", "asc")
      .get();
    
    if (traineesSnapshot.empty) {
      return {
        trainees: [],
        total: 0
      };
    }

    const expiringTrainees = traineesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        remainingSessions: data.remainingSessions
      };
    });

    return {
      trainees: expiringTrainees,
      total: expiringTrainees.length
    };
  } catch (err) {
    console.error("Error fetching expiring memberships:", err);
    throw err;
  }
}

function formatExpiringMembersList(data) {
  if (data.trainees.length === 0) {
    return "No trainees found with the specified number of remaining sessions.";
  }

  let response = `📊 Trainees with Low Sessions\n\n`;
  data.trainees.forEach((trainee, index) => {
    response += `${index + 1}. ${trainee.name}\n`;
    response += `   📱 ${trainee.phoneNumber}\n`;
    response += `   🎯 ${trainee.remainingSessions} sessions left\n`;
    response += `   📅 Joined: ${trainee.joinedDate.toDate().toLocaleDateString()}\n\n`;
  });

  response += `\nTotal: ${data.total} trainees`;

  return response;
}

// Update the createSampleTestData function
async function createSampleTestData() {
  try {
    const sampleTrainees = [
      {
        name: "John Smith",
        phoneNumber: "+919876543210",
        totalSessions: 20,
        remainingSessions: 2, // Expiring soon
        status: "active",
        joinedDate: new Date(2024, 2, 15)
      },
      {
        name: "Emma Wilson",
        phoneNumber: "+919876543211",
        totalSessions: 30,
        remainingSessions: 25,
        status: "active",
        joinedDate: new Date(2024, 3, 1)
      },
      {
        name: "Michael Brown",
        phoneNumber: "+919876543212",
        totalSessions: 15,
        remainingSessions: 1, // Expiring very soon
        status: "active",
        joinedDate: new Date(2024, 3, 10)
      },
      {
        name: "Sarah Davis",
        phoneNumber: "+919876543213",
        totalSessions: 25,
        remainingSessions: 3, // Expiring soon
        status: "active",
        joinedDate: new Date(2024, 3, 15)
      },
      {
        name: "James Wilson",
        phoneNumber: "+919876543214",
        totalSessions: 40,
        remainingSessions: 35,
        status: "active",
        joinedDate: new Date(2024, 3, 20)
      },
      {
        name: "Lisa Anderson",
        phoneNumber: "+919876543215",
        totalSessions: 10,
        remainingSessions: 1, // Expiring very soon
        status: "active",
        joinedDate: new Date(2024, 3, 25)
      },
      {
        name: "Robert Taylor",
        phoneNumber: "+919876543216",
        totalSessions: 35,
        remainingSessions: 30,
        status: "active",
        joinedDate: new Date(2024, 4, 1)
      },
      {
        name: "Maria Garcia",
        phoneNumber: "+919876543217",
        totalSessions: 20,
        remainingSessions: 4, // Expiring soon
        status: "active",
        joinedDate: new Date(2024, 4, 5)
      },
      {
        name: "David Lee",
        phoneNumber: "+919876543218",
        totalSessions: 15,
        remainingSessions: 12,
        status: "active",
        joinedDate: new Date(2024, 4, 10)
      },
      {
        name: "Jennifer White",
        phoneNumber: "+919876543219",
        totalSessions: 25,
        remainingSessions: 22,
        status: "active",
        joinedDate: new Date(2024, 4, 15)
      }
    ];

    // Add each trainee to Firestore
    for (const trainee of sampleTrainees) {
      await db.collection("trainees").add(trainee);
    }

    return `✅ Successfully added ${sampleTrainees.length} sample trainees to the database.`;
  } catch (err) {
    console.error("Error creating sample data:", err);
    throw err;
  }
}

// Add this new route to serve temporary files
app.use('/temp', express.static(path.join(__dirname, 'temp')));

// Add this new route to handle CSV downloads
app.get('/download-csv', async (req, res) => {
  try {
    const csvContent = await generateTraineesCSV();
    if (!csvContent) {
      res.status(404).send('No active trainees found');
      return;
    }

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=trainees.csv');
    
    // Send the CSV content
    res.send(csvContent);
  } catch (err) {
    console.error('Error downloading CSV:', err);
    res.status(500).send('Error generating CSV file');
  }
});

// Modify the webhook handler to properly handle admin messages
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

  try {
    // CASE 1: Handle "Hi" command (highest priority)
    if (Body.trim().toLowerCase() === "hi") {
      await handleHiCommand(formattedFrom, res);
      return;
    }
    
    // CASE 2: Handle sandbox join command
    if (Body.toLowerCase().startsWith('join')) {
      await handleSandboxJoin(formattedFrom, Body, res);
      return;
    }
    
    // CASE 3: Check if user is admin
    const isAdmin = await isSuperAdmin(formattedFrom);
    
    if (isAdmin) {
      // Handle admin messages
      if (adminStates.has(formattedFrom)) {
        await handleAdminInConversation(formattedFrom, Body, res);
      } else {
        // If admin but no state, treat as new admin command
        await handleAdminInConversation(formattedFrom, Body, res);
      }
      return;
    }
    
    // CASE 4: Handle attendance responses (only for non-admin users)
    if (Body === "1" || Body === "2") {
      const handled = await handleAttendanceResponse(formattedFrom, Body, res);
      if (handled) return;
    }
    
    // CASE 5: Default fallback for unrecognized messages
    console.log(`Unrecognized message pattern from ${formattedFrom}: "${Body}"`);
    res.set("Content-Type", "text/xml");
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Message>I didn't understand that command. Send "Hi" to see available options.</Message>
      </Response>`);
    
  } catch (err) {
    console.error("Error processing webhook:", err);
    res.set("Content-Type", "text/xml");
    res.send("<Response></Response>");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));