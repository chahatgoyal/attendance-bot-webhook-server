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

export async function getSuperAdminDetails(phoneNumber: string, db: Firestore): Promise<AdminState> {
  const adminRef = db.collection("superAdmins");
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

  switch (message.toLowerCase()) {
    case "menu":
      setAdminState(phoneNumber, { ...adminState, isAdmin: true });
      clearAdminTempData(phoneNumber);
      await twilioClient.messages.create({
        body: generateAdminOptions(),
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      break;

    case "help":
      await twilioClient.messages.create({
        body: generateHelpMessage(),
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
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
        await twilioClient.messages.create({
          body: "Invalid option. Please select a valid option or type 'help' for assistance.",
          from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
          to: `whatsapp:${phoneNumber}`
        });
      }
      break;
  }
} 