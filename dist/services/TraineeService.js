import { twilioClient } from '../config/twilio.config.js';
import { TemplateService } from './TemplateService.js';
export async function isDuplicatePendingTrainee(phoneNumber, db) {
    const existingTrainee = await db.collection("pendingTrainees")
        .where("phoneNumber", "==", phoneNumber)
        .where("status", "==", "pending_join")
        .get();
    return !existingTrainee.empty;
}
export async function isDuplicateTrainee(phoneNumber, db) {
    const existingTrainee = await db.collection("trainees")
        .where("phoneNumber", "==", phoneNumber)
        .get();
    return !existingTrainee.empty;
}
export async function sendWelcomeMessage(phoneNumber, traineeName, db) {
    if (!twilioClient) {
        console.error("Twilio client not initialized");
        return;
    }
    try {
        console.log(`Attempting to send welcome message to ${phoneNumber}`);
        // Check for duplicates before proceeding
        if (await isDuplicatePendingTrainee(phoneNumber, db)) {
            console.log(`Duplicate pending trainee found for ${phoneNumber}`);
            return;
        }
        // Use template service for better WhatsApp compliance
        await TemplateService.sendWelcomeTemplate(phoneNumber, traineeName);
        console.log("Welcome template sent successfully to:", phoneNumber);
    }
    catch (err) {
        console.error("Error sending welcome message:", err);
        throw err;
    }
}
