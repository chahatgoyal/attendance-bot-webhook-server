import { twilioClient } from '../config/twilio.config.js';
export class TemplateService {
    /**
     * Send a welcome template message to new users
     */
    static async sendWelcomeTemplate(phoneNumber, userName) {
        try {
            await twilioClient.messages.create({
                body: `Welcome to Birdie Badminton! 🏸\n\nHi ${userName}, welcome to our attendance system. Please reply with "Hi" to get started.\n\nReply "Hi" to begin.`,
                from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
                to: `whatsapp:${phoneNumber}`
            });
            console.log(`Welcome template sent to ${phoneNumber}`);
        }
        catch (error) {
            console.error('Error sending welcome template:', error);
            throw error;
        }
    }
    /**
     * Send attendance confirmation template
     */
    static async sendAttendanceConfirmationTemplate(phoneNumber, userName, sessionDate) {
        try {
            await twilioClient.messages.create({
                body: `Attendance Confirmation Request 🏸\n\nHi ${userName}, please confirm your attendance for tomorrow's session (${sessionDate}).\n\nReply "Yes" to confirm or "No" to decline.`,
                from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
                to: `whatsapp:${phoneNumber}`
            });
            console.log(`Attendance confirmation template sent to ${phoneNumber}`);
        }
        catch (error) {
            console.error('Error sending attendance confirmation template:', error);
            throw error;
        }
    }
    /**
     * Send admin welcome template
     */
    static async sendAdminWelcomeTemplate(phoneNumber, adminName) {
        try {
            await twilioClient.messages.create({
                body: `Admin Panel Access 🔧\n\nWelcome ${adminName}! You have admin access to the Birdie Badminton system.\n\nUse the interactive menu below to manage trainees and attendance.`,
                from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
                to: `whatsapp:${phoneNumber}`
            });
            console.log(`Admin welcome template sent to ${phoneNumber}`);
        }
        catch (error) {
            console.error('Error sending admin welcome template:', error);
            throw error;
        }
    }
    /**
     * Send session reminder template
     */
    static async sendSessionReminderTemplate(phoneNumber, userName, sessionDate, remainingSessions) {
        try {
            await twilioClient.messages.create({
                body: `Session Reminder 🏸\n\nHi ${userName}, this is a reminder for your badminton session on ${sessionDate}.\n\nRemaining sessions: ${remainingSessions}\n\nReply "Hi" to manage your attendance.`,
                from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
                to: `whatsapp:${phoneNumber}`
            });
            console.log(`Session reminder template sent to ${phoneNumber}`);
        }
        catch (error) {
            console.error('Error sending session reminder template:', error);
            throw error;
        }
    }
    /**
     * Send low sessions warning template
     */
    static async sendLowSessionsWarningTemplate(phoneNumber, userName, remainingSessions) {
        try {
            await twilioClient.messages.create({
                body: `Low Sessions Warning ⚠️\n\nHi ${userName}, you have ${remainingSessions} session(s) remaining.\n\nPlease contact an admin to purchase more sessions.\n\nReply "Hi" to check your status.`,
                from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
                to: `whatsapp:${phoneNumber}`
            });
            console.log(`Low sessions warning template sent to ${phoneNumber}`);
        }
        catch (error) {
            console.error('Error sending low sessions warning template:', error);
            throw error;
        }
    }
    /**
     * Send the admin_panel_v2 WhatsApp template to an admin using Twilio SDK v4+ (contentSid/templateParameters)
     */
    static async sendAdminPanelTemplate(phoneNumber, coachName) {
        try {
            const response = await twilioClient.messages.create({
                from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
                to: `whatsapp:${phoneNumber}`,
                contentSid: 'HX352a3822681ff2a7efe4cea37dc28922',
                templateParameters: { '1': coachName }
            });
            console.log('Admin panel template sent via Twilio SDK (contentSid):', response.sid);
        }
        catch (error) {
            console.error('Error sending admin panel template via Twilio SDK (contentSid):', error?.message || error);
            throw error;
        }
    }
}
