import express, { Request, Response } from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore, Firestore, DocumentData } from "firebase-admin/firestore";
import { twilioClient } from "./config/twilio.config.js";
import { formatPhoneNumber } from "./utils/phoneUtils.js";
import { getNextBusinessDay, formatDate } from "./utils/dateUtils.js";
import { 
  setAdminState, 
  getAdminState, 
  setAdminTempData, 
  getAdminTempData, 
  clearAdminTempData 
} from "./services/StateService.js";
import { 
  getSuperAdminDetails, 
  generateAdminOptions, 
  generateHelpMessage,
  handleAdminResponse 
} from "./services/AdminService.js";
import { 
  isDuplicatePendingTrainee, 
  isDuplicateTrainee, 
  sendWelcomeMessage 
} from "./services/TraineeService.js";
import { InteractiveMessageService } from "./services/InteractiveMessageService.js";
import { TemplateService } from "./services/TemplateService.js";
import { AdminState, AdminTempData, Trainee, TwilioMessage } from "./types/index.js";

dotenv.config();

// Initialize Firebase Admin
const app = initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
  })
});

// Initialize Firestore
const db = getFirestore(app);

// Move environment checks outside of request handlers
console.log("Environment variables check:");
console.log("TWILIO_ACCOUNT_SID:", process.env.TWILIO_ACCOUNT_SID ? "Set" : "Not set");
console.log("TWILIO_AUTH_TOKEN:", process.env.TWILIO_AUTH_TOKEN ? "Set" : "Not set");
console.log("TWILIO_FROM_WHATSAPP:", process.env.TWILIO_FROM_WHATSAPP ? "Set" : "Not set");

const expressApp = express();
expressApp.use(bodyParser.urlencoded({ extended: false }));
expressApp.use(bodyParser.json());

// Health check endpoint
expressApp.get("/health", (req: Request, res: Response) => {
  res.status(200).json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  });
});

// Test Firestore connection and list super admins
expressApp.get("/test-firestore", async (req: Request, res: Response) => {
  try {
    console.log("Testing Firestore connection...");
    
    // Test basic connection
    const testRef = db.collection("test");
    await testRef.add({
      test: true,
      timestamp: new Date()
    });
    console.log("✅ Firestore write test successful");
    
    // List all super admins with detailed info
    const adminRef = db.collection("superAdmin");
    console.log("🔍 Querying superAdmin collection...");
    
    const adminSnapshot = await adminRef.get();
    console.log(`📊 Found ${adminSnapshot.size} documents in superAdmin collection`);
    
    const admins: Array<{id: string, [key: string]: any}> = [];
    adminSnapshot.forEach(doc => {
      const data = doc.data();
      console.log(`📄 Document ${doc.id}:`, data);
      admins.push({
        id: doc.id,
        ...data
      });
    });
    
    console.log("✅ Super admins found:", admins);
    
    // Clean up test document
    const testDocs = await testRef.get();
    testDocs.forEach(doc => doc.ref.delete());
    
    res.status(200).json({
      success: true,
      message: "Firestore connection successful",
      superAdmins: admins,
      adminCount: admins.length,
      totalDocuments: adminSnapshot.size,
      collectionName: "superAdmin"
    });
    
  } catch (error) {
    console.error("❌ Firestore test failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
  }
});

// Helper endpoint to list Twilio phone numbers
expressApp.get("/list-phone-numbers", async (req: Request, res: Response) => {
  try {
    const numbers = await twilioClient.incomingPhoneNumbers.list();
    
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
      error: err instanceof Error ? err.message : 'Unknown error'
    });
  }
});

// Helper functions
async function isDuplicateAttendance(phoneNumber: string, date: string, db: Firestore): Promise<boolean> {
  const attendanceRef = db.collection("attendance");
  const querySnapshot = await attendanceRef
    .where("phoneNumber", "==", phoneNumber)
    .where("date", "==", date)
    .get();

  return !querySnapshot.empty;
}

async function isDuplicateAttendanceRequest(phoneNumber: string, date: string, db: Firestore): Promise<boolean> {
  const attendanceRequestsRef = db.collection("attendanceRequests");
  const querySnapshot = await attendanceRequestsRef
    .where("phoneNumber", "==", phoneNumber)
    .where("date", "==", date)
    .get();

  return !querySnapshot.empty;
}

async function getActiveTrainees(page: number = 1, pageSize: number = 10, db: Firestore) {
  try {
    const traineesRef = db.collection("trainees");
    const querySnapshot = await traineesRef
      .where("status", "==", "active")
      .orderBy("createdAt", "desc")
      .limit(pageSize)
      .offset((page - 1) * pageSize)
      .get();

    const totalSnapshot = await traineesRef
      .where("status", "==", "active")
      .count()
      .get();

    const total = totalSnapshot.data().count;
    const trainees = querySnapshot.docs.map((doc: DocumentData) => {
      const data = doc.data();
      return {
        name: data.name,
        phone: data.phoneNumber,
        remainingSessions: data.remainingSessions,
        joinedDate: formatDate(data.createdAt.toDate())
      };
    });

    return {
      trainees,
      total,
      page,
      hasMore: total > page * pageSize
    };
  } catch (error) {
    console.error("Error getting active trainees:", error);
    throw error;
  }
}

function formatTraineesList(data: { 
  trainees: Array<{ 
    name: string; 
    phone: string; 
    remainingSessions: number; 
    joinedDate: string; 
  }>; 
  total: number; 
  page: number; 
  hasMore: boolean; 
}): string {
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

async function getCompletedTrainees(db: Firestore): Promise<string> {
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

// Message handlers
async function handleHiCommand(phoneNumber: string, db: Firestore): Promise<void> {
  console.log(`Received Hi message from ${phoneNumber}`);
  const adminDetails = await getSuperAdminDetails(phoneNumber, db);
  
  // Reset admin state and temp data
  setAdminState(phoneNumber, adminDetails);
  clearAdminTempData(phoneNumber);

  if (adminDetails.isAdmin) {
    // Send the approved admin panel template using the HTTP API
    await TemplateService.sendAdminPanelTemplate(phoneNumber, adminDetails.name ?? "Coach");
    // Optionally, you can still send the interactive menu after the template if you want
    // const interactiveService = new InteractiveMessageService(db);
    // await interactiveService.sendAdminMenu(phoneNumber, adminDetails.name ?? undefined);
  } else {
    await handleTraineeOptions(phoneNumber, db);
  }
}

async function handleTraineeOptions(phoneNumber: string, db: Firestore): Promise<void> {
  try {
    const traineeRef = db.collection("trainees");
    const querySnapshot = await traineeRef.where("phoneNumber", "==", phoneNumber).get();

    if (querySnapshot.empty) {
      // Send welcome template for unregistered users
      await TemplateService.sendWelcomeTemplate(phoneNumber, "there");
      return;
    }

    const traineeDoc = querySnapshot.docs[0];
    const traineeData = traineeDoc.data();
    const remainingSessions = traineeData.remainingSessions || 0;

    if (traineeData.status === "active") {
      // Send welcome template first
      await TemplateService.sendWelcomeTemplate(phoneNumber, traineeData.name);
      
      // Then send interactive menu
      const interactiveService = new InteractiveMessageService(db);
      await interactiveService.sendAttendanceConfirmation(phoneNumber, traineeData.name, remainingSessions);
    } else if (traineeData.status === "pending") {
      await twilioClient.messages.create({
        body: `Welcome ${traineeData.name}! Your account is pending activation. Please wait for an admin to activate your account.`,
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
    } else {
      await twilioClient.messages.create({
        body: `Welcome ${traineeData.name}! Your account is inactive. Please contact an admin for assistance.`,
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
    }
  } catch (error) {
    console.error("Error handling trainee options:", error);
    await twilioClient.messages.create({
      body: "Sorry, there was an error processing your request. Please try again later.",
      from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
      to: `whatsapp:${phoneNumber}`
    });
  }
}

async function handleAttendanceResponse(phoneNumber: string, message: string, db: Firestore): Promise<void> {
  try {
    const tomorrow = new Date(getNextBusinessDay());
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Handle interactive button responses
    if (message === 'confirm_yes' || message.toLowerCase() === 'yes') {
      await processAttendanceConfirmation(phoneNumber, tomorrowStr, db, true);
      return;
    }

    if (message === 'confirm_no' || message.toLowerCase() === 'no') {
      await processAttendanceConfirmation(phoneNumber, tomorrowStr, db, false);
      return;
    }

    if (message === 'cancel') {
      await twilioClient.messages.create({
        body: "Attendance confirmation cancelled. Type 'Hi' to start again.",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      return;
    }

    // Check for pending attendance request
    const attendanceRequestsRef = db.collection("attendanceRequests");
    const querySnapshot = await attendanceRequestsRef
      .where("phoneNumber", "==", phoneNumber)
      .where("date", "==", tomorrowStr)
      .where("status", "==", "pending")
      .get();

    if (querySnapshot.empty) {
      await twilioClient.messages.create({
        body: "No pending attendance request found for tomorrow.",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      return;
    }

    const requestDoc = querySnapshot.docs[0];
    const requestData = requestDoc.data();

    // Check for duplicate attendance
    const isDuplicate = await isDuplicateAttendance(phoneNumber, tomorrowStr, db);
    if (isDuplicate) {
      await twilioClient.messages.create({
        body: "You have already confirmed your attendance for tomorrow.",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      return;
    }

    // Update attendance request
    await requestDoc.ref.update({
      status: message.toLowerCase() === "yes" ? "confirmed" : "declined",
      responseTime: new Date()
    });

    if (message.toLowerCase() === "yes") {
      // Update trainee's remaining sessions
      const traineeRef = db.collection("trainees").doc(requestData.traineeId);
      const traineeDoc = await traineeRef.get();
      const traineeData = traineeDoc.data();

      if (traineeData && traineeData.remainingSessions > 0) {
        await traineeRef.update({
          remainingSessions: traineeData.remainingSessions - 1
        });

        // Add to attendance collection
        await db.collection("attendance").add({
          traineeId: requestData.traineeId,
          phoneNumber,
          date: tomorrowStr,
          createdAt: new Date()
        });

        await twilioClient.messages.create({
          body: "Thank you for confirming your attendance! Your remaining sessions have been updated.",
          from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
          to: `whatsapp:${phoneNumber}`
        });
      } else {
        await twilioClient.messages.create({
          body: "Sorry, you have no remaining sessions. Please contact an admin to purchase more sessions.",
          from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
          to: `whatsapp:${phoneNumber}`
        });
      }
    } else {
      await twilioClient.messages.create({
        body: "Thank you for your response. We'll see you next time!",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
    }
  } catch (error) {
    console.error("Error handling attendance response:", error);
    await twilioClient.messages.create({
      body: "Sorry, there was an error processing your attendance. Please try again later.",
      from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
      to: `whatsapp:${phoneNumber}`
    });
  }
}

async function processAttendanceConfirmation(phoneNumber: string, date: string, db: Firestore, confirmed: boolean): Promise<void> {
  try {
    // Check for pending attendance request
    const attendanceRequestsRef = db.collection("attendanceRequests");
    const querySnapshot = await attendanceRequestsRef
      .where("phoneNumber", "==", phoneNumber)
      .where("date", "==", date)
      .where("status", "==", "pending")
      .get();

    if (querySnapshot.empty) {
      await twilioClient.messages.create({
        body: "No pending attendance request found for tomorrow.",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      return;
    }

    const requestDoc = querySnapshot.docs[0];
    const requestData = requestDoc.data();

    // Check for duplicate attendance
    const isDuplicate = await isDuplicateAttendance(phoneNumber, date, db);
    if (isDuplicate) {
      await twilioClient.messages.create({
        body: "You have already confirmed your attendance for tomorrow.",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      return;
    }

    // Update attendance request
    await requestDoc.ref.update({
      status: confirmed ? "confirmed" : "declined",
      responseTime: new Date()
    });

    if (confirmed) {
      // Update trainee's remaining sessions
      const traineeRef = db.collection("trainees").doc(requestData.traineeId);
      const traineeDoc = await traineeRef.get();
      const traineeData = traineeDoc.data();

      if (traineeData && traineeData.remainingSessions > 0) {
        await traineeRef.update({
          remainingSessions: traineeData.remainingSessions - 1
        });

        // Add to attendance collection
        await db.collection("attendance").add({
          traineeId: requestData.traineeId,
          phoneNumber,
          date: date,
          createdAt: new Date()
        });

        await twilioClient.messages.create({
          body: "✅ Thank you for confirming your attendance! Your remaining sessions have been updated.",
          from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
          to: `whatsapp:${phoneNumber}`
        });
      } else {
        await twilioClient.messages.create({
          body: "❌ Sorry, you have no remaining sessions. Please contact an admin to purchase more sessions.",
          from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
          to: `whatsapp:${phoneNumber}`
        });
      }
    } else {
      await twilioClient.messages.create({
        body: "👋 Thank you for your response. We'll see you next time!",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
    }
  } catch (error) {
    console.error("Error processing attendance confirmation:", error);
    await twilioClient.messages.create({
      body: "Sorry, there was an error processing your attendance. Please try again later.",
      from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
      to: `whatsapp:${phoneNumber}`
    });
  }
}

// Webhook handler
expressApp.post("/webhook", async (req: Request, res: Response) => {
  const { From, Body, ButtonText, ButtonPayload } = req.body;
  const formattedFrom = formatPhoneNumber(From);
  
  // Handle interactive button responses
  const message = ButtonPayload || Body;
  
  console.log(`Received message from ${formattedFrom}: ${message}`);
  if (ButtonText) {
    console.log(`Button clicked: ${ButtonText}`);
  }

  try {
    if (message.toLowerCase() === "hi") {
      await handleHiCommand(formattedFrom, db);
    } else {
      const adminState = getAdminState(formattedFrom);
      if (adminState?.isAdmin) {
        await handleAdminResponse(formattedFrom, message, db);
      } else {
        await handleAttendanceResponse(formattedFrom, message, db);
      }
    }
    res.status(200).send("OK");
  } catch (error) {
    console.error("Error processing webhook:", error);
    res.status(500).send("Internal Server Error");
  }
});

// Start server
const PORT = process.env.PORT || 3000;
expressApp.listen(PORT, () => console.log(`Server running on port ${PORT}`)); 