import { twilioClient } from "../config/twilio.config.js";
import { setAdminState, getAdminState, setAdminTempData, getAdminTempData, clearAdminTempData } from "./StateService.js";
import { InteractiveMessageService } from "./InteractiveMessageService.js";
export async function getSuperAdminDetails(phoneNumber, db) {
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
export function generateAdminOptions() {
    return `Please select an option:
1. Add new trainee
2. List active trainees
3. List completed trainees
4. Help
5. Exit`;
}
export function generateHelpMessage() {
    return `Available commands:
1. Add new trainee - Add a new trainee to the system
2. List active trainees - View all active trainees
3. List completed trainees - View trainees who have completed their sessions
4. Help - Show this help message
5. Exit - Exit admin mode

To return to the main menu, type "menu"
To exit admin mode, type "exit"`;
}
export async function handleAdminResponse(phoneNumber, message, db) {
    const adminState = getAdminState(phoneNumber);
    const adminTempData = getAdminTempData(phoneNumber);
    const interactiveService = new InteractiveMessageService(db);
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
        }
        else if (!adminTempData.traineePhone) {
            // Second step: get phone
            setAdminTempData(phoneNumber, { ...adminTempData, traineePhone: message.trim() });
            await twilioClient.messages.create({
                body: "🔢 Please enter the number of sessions (1-50):",
                from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
                to: `whatsapp:${phoneNumber}`
            });
            return;
        }
        else if (!adminTempData.sessions) {
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
            // All data collected, add trainee
            const { traineeName, traineePhone } = adminTempData;
            try {
                await db.collection('trainees').add({
                    name: traineeName,
                    phoneNumber: traineePhone,
                    remainingSessions: sessions,
                    status: 'active',
                    createdAt: new Date()
                });
                clearAdminTempData(phoneNumber);
                await twilioClient.messages.create({
                    body: `✅ Trainee added successfully!\n\nName: ${traineeName}\nPhone: ${traineePhone}\nSessions: ${sessions}`,
                    from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
                    to: `whatsapp:${phoneNumber}`
                });
                // Optionally, send a welcome message to the trainee
                await twilioClient.messages.create({
                    body: `🎉 Welcome to Birdie Badminton, ${traineeName}! You have been registered with ${sessions} sessions.`,
                    from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
                    to: `whatsapp:${traineePhone}`
                });
            }
            catch (error) {
                await twilioClient.messages.create({
                    body: "❌ Failed to add trainee. Please try again or contact support.",
                    from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
                    to: `whatsapp:${phoneNumber}`
                });
            }
            return;
        }
    }
    // Normalize message for button text and payloads
    const normalized = message.trim().toLowerCase();
    // Handle interactive button payloads, button texts, and numeric options
    if (normalized === 'add_trainee' ||
        normalized === 'add new trainee' ||
        normalized === '1') {
        setAdminTempData(phoneNumber, { action: 'add_trainee' });
        await twilioClient.messages.create({
            body: "📝 Add New Trainee\n\nPlease enter the trainee's full name:",
            from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
            to: `whatsapp:${phoneNumber}`
        });
        return;
    }
    if (normalized === 'list_trainees' ||
        normalized === 'list active trainees' ||
        normalized === '2') {
        await handleListTrainees(phoneNumber, db, interactiveService);
        return;
    }
    if (normalized === 'active_trainees' ||
        normalized === 'inspect trainees sessions' ||
        normalized === '3') {
        await handleActiveTrainees(phoneNumber, db, interactiveService);
        return;
    }
    if (normalized === 'remove_trainee' ||
        normalized === 'remove trainee' ||
        normalized === '4') {
        await handleRemoveTrainee(phoneNumber, db, interactiveService);
        return;
    }
    if (normalized === 'generate_csv' ||
        normalized === 'export trainees info' ||
        normalized === '5') {
        await handleGenerateCSV(phoneNumber, db, interactiveService);
        return;
    }
    if (normalized === 'help') {
        console.log('Handling help action');
        await interactiveService.sendHelpMenu(phoneNumber);
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
    if (normalized === 'back_to_menu') {
        setAdminState(phoneNumber, { ...adminState, isAdmin: true });
        clearAdminTempData(phoneNumber);
        await interactiveService.sendAdminMenu(phoneNumber, adminState.name ?? undefined);
        return;
    }
    // Fallback to traditional text responses
    switch (normalized) {
        case "menu":
            setAdminState(phoneNumber, { ...adminState, isAdmin: true });
            clearAdminTempData(phoneNumber);
            await interactiveService.sendAdminMenu(phoneNumber, adminState.name ?? undefined);
            break;
        case "help":
            await interactiveService.sendHelpMenu(phoneNumber);
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
async function handleAddTrainee(phoneNumber, db, interactiveService) {
    setAdminState(phoneNumber, { name: null, isAdmin: true });
    setAdminTempData(phoneNumber, { action: 'add_trainee' });
    await twilioClient.messages.create({
        body: "➕ Add New Trainee\n\nPlease send the trainee's name:",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
    });
}
async function handleListTrainees(phoneNumber, db, interactiveService) {
    try {
        const traineesRef = db.collection("trainees");
        const querySnapshot = await traineesRef.orderBy("createdAt", "desc").limit(8).get();
        const trainees = querySnapshot.docs.map((doc, index) => ({
            id: doc.id,
            name: doc.data().name,
            remainingSessions: doc.data().remainingSessions || 0,
            status: doc.data().status
        }));
        await interactiveService.sendTraineeList(phoneNumber, trainees, 1, querySnapshot.docs.length === 8);
    }
    catch (error) {
        console.error("Error listing trainees:", error);
        await twilioClient.messages.create({
            body: "Sorry, there was an error fetching trainees. Please try again.",
            from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
            to: `whatsapp:${phoneNumber}`
        });
    }
}
async function handleActiveTrainees(phoneNumber, db, interactiveService) {
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
        await interactiveService.sendTraineeList(phoneNumber, trainees, 1, querySnapshot.docs.length === 8);
    }
    catch (error) {
        console.error("Error listing active trainees:", error);
        await twilioClient.messages.create({
            body: "Sorry, there was an error fetching active trainees. Please try again.",
            from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
            to: `whatsapp:${phoneNumber}`
        });
    }
}
async function handleUpdateTrainee(phoneNumber, db, interactiveService) {
    setAdminState(phoneNumber, { name: null, isAdmin: true });
    setAdminTempData(phoneNumber, { action: 'update_trainee' });
    await twilioClient.messages.create({
        body: "✏️ Update Trainee\n\nPlease send the trainee's phone number:",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
    });
}
async function handleRemoveTrainee(phoneNumber, db, interactiveService) {
    setAdminState(phoneNumber, { name: null, isAdmin: true });
    setAdminTempData(phoneNumber, { action: 'remove_trainee' });
    await twilioClient.messages.create({
        body: "🗑️ Remove Trainee\n\nPlease send the trainee's phone number:",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
    });
}
async function handleGenerateCSV(phoneNumber, db, interactiveService) {
    try {
        const traineesRef = db.collection("trainees");
        const querySnapshot = await traineesRef.where("status", "==", "active").get();
        let csvContent = "Name,Phone Number,Remaining Sessions,Status,Joined Date\n";
        querySnapshot.forEach(doc => {
            const data = doc.data();
            csvContent += `"${data.name}","${data.phoneNumber}",${data.remainingSessions || 0},"${data.status}","${data.createdAt?.toDate?.() || 'N/A'}"\n`;
        });
        // For now, just send the CSV content as text
        // In a real implementation, you'd upload this to a file service and send a link
        await twilioClient.messages.create({
            body: `📊 CSV Generated\n\n${csvContent}`,
            from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
            to: `whatsapp:${phoneNumber}`
        });
    }
    catch (error) {
        console.error("Error generating CSV:", error);
        await twilioClient.messages.create({
            body: "Sorry, there was an error generating the CSV. Please try again.",
            from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
            to: `whatsapp:${phoneNumber}`
        });
    }
}
