import { Firestore } from 'firebase-admin/firestore';
import { twilioClient } from "../config/twilio.config.js";
import { formatPhoneNumber } from "../utils/phoneUtils.js";
import { AdminState, AdminTempData } from '../types/index.js';
import { 
  setAdminState, 
  getAdminState, 
  setAdminTempData, 
  getAdminTempData, 
  clearAdminTempData 
} from "./StateService.js";
import { TemplateService } from "./TemplateService.js";
import fs from 'fs';
import path from 'path';

export async function getSuperAdminDetails(phoneNumber: string, db: Firestore): Promise<AdminState> {
  const adminRef = db.collection("superAdmin");
  const querySnapshot = await adminRef.where("phoneNumber", "==", phoneNumber).get();

  if (!querySnapshot.empty) {
    const adminDoc = querySnapshot.docs[0];
    return {
      name: adminDoc.data().name,
      isAdmin: true
    };
  }

  console.log(`No super admin found for phone number: ${phoneNumber}`);
  return { name: null, isAdmin: false };
}

export function generateAdminOptions(): string {
  return `Please select an option:
1. Add new trainee
2. List active trainees
3. List completed trainees
4. Help
5. Exit`;
}

export function generateHelpMessage(): string {
  return `Available commands:
1. Add new trainee - Add a new trainee to the system
2. List active trainees - View all active trainees
3. List completed trainees - View trainees who have completed their sessions
4. Help - Show this help message
5. Exit - Exit admin mode

To return to the main menu, type "menu"
To exit admin mode, type "exit"`;
}

export async function handleAdminResponse(
  phoneNumber: string,
  message: string,
  db: Firestore
): Promise<void> {
  const adminState = getAdminState(phoneNumber);
  const adminTempData = getAdminTempData(phoneNumber);

  if (!adminState) {
    console.log(`No admin state found for ${phoneNumber}`);
    return;
  }

  // Multi-step onboarding for Add Trainee
  if (adminTempData?.action === 'add_trainee') {
    if (!adminTempData.traineeName) {
      // First step: get name
      setAdminTempData(phoneNumber, { ...adminTempData, traineeName: message.trim() });
      await twilioClient.messages.create({
        body: "📱 Please enter the trainee's phone number (with country code, e.g. +1234567890):",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      return;
    } else if (!adminTempData.traineePhone) {
      // Second step: get phone
      const phoneInputRaw = message.trim();
      const phoneInput = phoneInputRaw.replace(/\s+/g, '');
      const phoneRegex = /^\+[1-9]\d{9,14}$/;
      if (!phoneRegex.test(phoneInput)) {
        await twilioClient.messages.create({
          body: "❌ Invalid phone number format. Please enter a valid WhatsApp number with country code (e.g. +1234567890):",
          from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
          to: `whatsapp:${phoneNumber}`
        });
        return;
      }
      // Check for existing active trainee with this number
      const existing = await db.collection('trainees')
        .where('phoneNumber', '==', phoneInput)
        .where('status', '==', 'active')
        .get();
      if (!existing.empty) {
        await twilioClient.messages.create({
          body: "❌ A trainee with this phone number is already active in the system. Please enter a different number:",
          from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
          to: `whatsapp:${phoneNumber}`
        });
        return;
      }
      // Check if this phone number belongs to an admin
      const adminSnapshot = await db.collection('superAdmin')
        .where('phoneNumber', '==', phoneInput)
        .get();
      if (!adminSnapshot.empty) {
        await twilioClient.messages.create({
          body: "❌ This phone number belongs to an admin and cannot be onboarded as a trainee. Please enter a different number:",
          from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
          to: `whatsapp:${phoneNumber}`
        });
        return;
      }
      setAdminTempData(phoneNumber, { ...adminTempData, traineePhone: phoneInput });
      await twilioClient.messages.create({
        body: "🔢 Please enter the number of sessions (1-50):",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      return;
    } else if (!adminTempData.sessions) {
      // Third step: get sessions
      const sessions = parseInt(message.trim(), 10);
      if (isNaN(sessions) || sessions < 1 || sessions > 50) {
        await twilioClient.messages.create({
          body: "❌ Invalid number of sessions. Please enter a number between 1 and 50:",
          from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
          to: `whatsapp:${phoneNumber}`
        });
        return;
      }
      setAdminTempData(phoneNumber, { ...adminTempData, sessions });
      await twilioClient.messages.create({
        body: "📅 Please enter the number of months (1-24):",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      return;
    } else if (!adminTempData.months) {
      // Fourth step: get months
      const months = parseInt(message.trim(), 10);
      if (isNaN(months) || months < 1 || months > 24) {
        await twilioClient.messages.create({
          body: "❌ Invalid number of months. Please enter a number between 1 and 24:",
          from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
          to: `whatsapp:${phoneNumber}`
        });
        return;
      }
      // All data collected, add trainee
      const { traineeName, traineePhone, sessions } = adminTempData;
      try {
        await db.collection('trainees').add({
          name: traineeName,
          phoneNumber: traineePhone,
          remainingSessions: sessions,
          months: months,
          status: 'active',
          createdAt: new Date()
        });
        clearAdminTempData(phoneNumber);
        await twilioClient.messages.create({
          body: `✅ Trainee added successfully!\n\nName: ${traineeName}\nPhone: ${traineePhone}\nSessions: ${sessions}\nMonths: ${months}`,
          from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
          to: `whatsapp:${phoneNumber}`
        });
        // Optionally, send a welcome message to the trainee
        await twilioClient.messages.create({
          body: `🎉 Welcome to Birdie Badminton, ${traineeName}! You have been registered with ${sessions} sessions for ${months} month(s).`,
          from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
          to: `whatsapp:${traineePhone}`
        });
      } catch (error) {
        await twilioClient.messages.create({
          body: "❌ Failed to add trainee. Please try again or contact support.",
          from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
          to: `whatsapp:${phoneNumber}`
        });
      }
      return;
    }
  }

  // Multi-step flow for Inspect Trainee Sessions
  if (adminTempData?.action === 'inspect_sessions') {
    const threshold = parseInt(message.trim(), 10);
    if (isNaN(threshold) || threshold < 1) {
      await twilioClient.messages.create({
        body: "❌ Invalid threshold. Please enter a positive number:",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      return;
    }
    // Query trainees with remainingSessions < threshold
    try {
      const traineesRef = db.collection("trainees");
      const querySnapshot = await traineesRef
        .where("status", "==", "active")
        .where("remainingSessions", "<", threshold)
        .get();
      const trainees = querySnapshot.docs.map((doc, index) => ({
        id: doc.id,
        name: doc.data().name,
        remainingSessions: doc.data().remainingSessions || 0,
        status: doc.data().status
      }));
      clearAdminTempData(phoneNumber);
      await TemplateService.sendTraineeList(phoneNumber, trainees, 1, false);
    } catch (error) {
      await twilioClient.messages.create({
        body: "Sorry, there was an error fetching trainees. Please try again.",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
    }
    return;
  }

  // Multi-step flow for Remove Trainee
  if (adminTempData?.action === 'remove_trainee') {
    const phoneInputRaw = message.trim();
    const phoneInput = phoneInputRaw.replace(/\s+/g, '');
    const phoneRegex = /^\+[1-9]\d{9,14}$/;
    if (!phoneRegex.test(phoneInput)) {
      await twilioClient.messages.create({
        body: "❌ Invalid phone number format. Please enter a valid WhatsApp number with country code (e.g. +1234567890):",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      return;
    }
    // Check for active trainee
    const traineeQuery = await db.collection('trainees')
      .where('phoneNumber', '==', phoneInput)
      .where('status', '==', 'active')
      .get();
    if (traineeQuery.empty) {
      await twilioClient.messages.create({
        body: "❌ No active trainee found with this phone number. Please check the number and try again.",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      return;
    }
    // Soft delete: set status to inactive and add deactivationTime
    const traineeDoc = traineeQuery.docs[0];
    await traineeDoc.ref.update({ status: 'inactive', deactivationTime: new Date() });
    clearAdminTempData(phoneNumber);
    await twilioClient.messages.create({
      body: `✅ Trainee with phone number ${phoneInput} has been deactivated (soft deleted).`,
      from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
      to: `whatsapp:${phoneNumber}`
    });
    return;
  }

  // Normalize message for button text and payloads
  const normalized = message.trim().toLowerCase();

  // Handle interactive button payloads, button texts, and numeric options
  if (
    normalized === 'add_trainee' ||
    normalized === 'add new trainee' ||
    normalized === '1'
  ) {
    setAdminTempData(phoneNumber, { action: 'add_trainee' });
    await twilioClient.messages.create({
      body: "📝 Add New Trainee\n\nPlease enter the trainee's full name:",
      from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
      to: `whatsapp:${phoneNumber}`
    });
    return;
  }
  if (
    normalized === 'list_trainees' ||
    normalized === 'list active trainees' ||
    normalized === '2'
  ) {
    await handleListTrainees(phoneNumber, db);
    return;
  }
  if (
    normalized === 'active_trainees' ||
    normalized === 'inspect trainees sessions' ||
    normalized === '3'
  ) {
    setAdminTempData(phoneNumber, { action: 'inspect_sessions' });
    await twilioClient.messages.create({
      body: "🔍 Please enter the session threshold (e.g., 3 to see trainees with less than 3 sessions):",
      from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
      to: `whatsapp:${phoneNumber}`
    });
    return;
  }
  if (
    normalized === 'remove_trainee' ||
    normalized === 'remove trainee' ||
    normalized === '4'
  ) {
    setAdminTempData(phoneNumber, { action: 'remove_trainee' });
    await twilioClient.messages.create({
      body: "🗑️ Remove Trainee\n\nPlease enter the trainee's phone number (with country code, e.g. +1234567890):",
      from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
      to: `whatsapp:${phoneNumber}`
    });
    return;
  }
  if (
    normalized === 'generate_csv' ||
    normalized === 'export trainees info' ||
    normalized === '5'
  ) {
    await handleGenerateCSV(phoneNumber, db);
    return;
  }
  if (normalized === 'help') {
    console.log('Handling help action');
    await TemplateService.sendHelpMenu(phoneNumber);
    return;
  }
  if (normalized === 'exit') {
    console.log('Handling exit action');
    setAdminState(phoneNumber, { ...adminState, isAdmin: false });
    clearAdminTempData(phoneNumber);
    await twilioClient.messages.create({
      body: "You have exited admin mode. Type 'Hi' to start again.",
      from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
      to: `whatsapp:${phoneNumber}`
    });
    return;
  }
  if (normalized === 'back' || normalized === 'back_to_menu') {
    setAdminState(phoneNumber, { ...adminState, isAdmin: true });
    clearAdminTempData(phoneNumber);
    await TemplateService.sendAdminPanelTemplate(phoneNumber, adminState.name ?? "Coach");
    return;
  }

  // Fallback to traditional text responses
  switch (normalized) {
    case "menu":
      setAdminState(phoneNumber, { ...adminState, isAdmin: true });
      clearAdminTempData(phoneNumber);
      await TemplateService.sendAdminPanelTemplate(phoneNumber, adminState.name ?? "Coach");
      break;
    case "help":
      await TemplateService.sendHelpMenu(phoneNumber);
      break;
    case "exit":
      setAdminState(phoneNumber, { ...adminState, isAdmin: false });
      clearAdminTempData(phoneNumber);
      await twilioClient.messages.create({
        body: "You have exited admin mode. Type 'Hi' to start again.",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      break;
    default:
      if (adminState.isAdmin) {
        console.log('Invalid option received:', message);
        await twilioClient.messages.create({
          body: "Invalid option. Please use the buttons or type a number (1-5) or 'help' for assistance.",
          from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
          to: `whatsapp:${phoneNumber}`
        });
      }
      break;
  }
}

// Handler functions for different admin actions
async function handleAddTrainee(phoneNumber: string, db: Firestore): Promise<void> {
  setAdminState(phoneNumber, { name: null, isAdmin: true });
  setAdminTempData(phoneNumber, { action: 'add_trainee' });
  
  await twilioClient.messages.create({
    body: "➕ Add New Trainee\n\nPlease send the trainee's name:",
    from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
    to: `whatsapp:${phoneNumber}`
  });
}

async function handleListTrainees(phoneNumber: string, db: Firestore): Promise<void> {
  try {
    const traineesRef = db.collection("trainees");
    const querySnapshot = await traineesRef.orderBy("createdAt", "desc").limit(8).get();
    
    const trainees = querySnapshot.docs.map((doc, index) => ({
      id: doc.id,
      name: doc.data().name,
      remainingSessions: doc.data().remainingSessions || 0,
      status: doc.data().status
    }));

    await TemplateService.sendTraineeList(phoneNumber, trainees, 1, querySnapshot.docs.length === 8);
  } catch (error) {
    console.error("Error listing trainees:", error);
    await twilioClient.messages.create({
      body: "Sorry, there was an error fetching trainees. Please try again.",
      from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
      to: `whatsapp:${phoneNumber}`
    });
  }
}

async function handleActiveTrainees(phoneNumber: string, db: Firestore): Promise<void> {
  try {
    const traineesRef = db.collection("trainees");
    const querySnapshot = await traineesRef
      .where("status", "==", "active")
      .orderBy("createdAt", "desc")
      .limit(8)
      .get();
    
    const trainees = querySnapshot.docs.map((doc, index) => ({
      id: doc.id,
      name: doc.data().name,
      remainingSessions: doc.data().remainingSessions || 0,
      status: doc.data().status
    }));

    await TemplateService.sendTraineeList(phoneNumber, trainees, 1, querySnapshot.docs.length === 8);
  } catch (error) {
    console.error("Error listing active trainees:", error);
    await twilioClient.messages.create({
      body: "Sorry, there was an error fetching active trainees. Please try again.",
      from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
      to: `whatsapp:${phoneNumber}`
    });
  }
}

async function handleUpdateTrainee(phoneNumber: string, db: Firestore): Promise<void> {
  setAdminState(phoneNumber, { name: null, isAdmin: true });
  setAdminTempData(phoneNumber, { action: 'update_trainee' });
  
  await twilioClient.messages.create({
    body: "✏️ Update Trainee\n\nPlease send the trainee's phone number:",
    from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
    to: `whatsapp:${phoneNumber}`
  });
}

async function handleRemoveTrainee(phoneNumber: string, db: Firestore): Promise<void> {
  setAdminState(phoneNumber, { name: null, isAdmin: true });
  setAdminTempData(phoneNumber, { action: 'remove_trainee' });
  
  await twilioClient.messages.create({
    body: "🗑️ Remove Trainee\n\nPlease send the trainee's phone number:",
    from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
    to: `whatsapp:${phoneNumber}`
  });
}

async function handleGenerateCSV(phoneNumber: string, db: Firestore): Promise<void> {
  try {
    const traineesRef = db.collection("trainees");
    const querySnapshot = await traineesRef.get();
    let csvContent = "Name,Phone Number,Remaining Sessions,Status,Joined Date\n";
    querySnapshot.forEach(doc => {
      const data = doc.data();
      csvContent += `"${data.name}","${data.phoneNumber}",${data.remainingSessions || 0},"${data.status}","${data.createdAt?.toDate?.() || 'N/A'}"\n`;
    });
    // Write CSV to file in exports directory
    const timestamp = Date.now();
    const fileName = `trainees_${timestamp}.csv`;
    const filePath = path.join(process.cwd(), 'exports', fileName);
    fs.writeFileSync(filePath, csvContent);
    // Public URL for download
    const publicUrl = `${process.env.SERVER_BASE_URL || 'http://localhost:3000'}/exports/${fileName}`;
    // Send WhatsApp message with download link
    await twilioClient.messages.create({
      body: `📊 CSV Generated. Download here: ${publicUrl}`,
      from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
      to: `whatsapp:${phoneNumber}`
    });
    // Send WhatsApp message with CSV as media
    await twilioClient.messages.create({
      from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
      to: `whatsapp:${phoneNumber}`,
      mediaUrl: [publicUrl]
    });
    // Delete the CSV file after sending
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error(`Failed to delete CSV file ${filePath}:`, err);
      } else {
        console.log(`Deleted CSV file ${filePath}`);
      }
    });
  } catch (error) {
    console.error("Error generating CSV:", error);
    await twilioClient.messages.create({
      body: "Sorry, there was an error generating the CSV. Please try again later.",
      from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
      to: `whatsapp:${phoneNumber}`
    });
  }
}