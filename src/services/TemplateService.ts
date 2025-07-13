import { twilioClient } from '../config/twilio.config.js';
import axios from 'axios';

export class TemplateService {
  /**
   * Send a welcome template message to new users
   */
  static async sendWelcomeTemplate(phoneNumber: string, userName: string): Promise<void> {
    try {
      await twilioClient.messages.create({
        body: `Welcome to Birdie Badminton! 🏸\n\nHi ${userName}, welcome to our attendance system. Please reply with "Hi" to get started.\n\nReply "Hi" to begin.`,
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      console.log(`Welcome template sent to ${phoneNumber}`);
    } catch (error) {
      console.error('Error sending welcome template:', error);
      throw error;
    }
  }

  /**
   * Send attendance confirmation template
   */
  static async sendAttendanceConfirmationTemplate(
    phoneNumber: string, 
    userName: string, 
    sessionDate: string
  ): Promise<void> {
    try {
      await twilioClient.messages.create({
        body: `Attendance Confirmation Request 🏸\n\nHi ${userName}, please confirm your attendance for tomorrow's session (${sessionDate}).\n\nReply "Yes" to confirm or "No" to decline.`,
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      console.log(`Attendance confirmation template sent to ${phoneNumber}`);
    } catch (error) {
      console.error('Error sending attendance confirmation template:', error);
      throw error;
    }
  }

  /**
   * Send admin welcome template
   */
  static async sendAdminWelcomeTemplate(phoneNumber: string, adminName: string): Promise<void> {
    try {
      await twilioClient.messages.create({
        body: `Admin Panel Access 🔧\n\nWelcome ${adminName}! You have admin access to the Birdie Badminton system.\n\nUse the interactive menu below to manage trainees and attendance.`,
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      console.log(`Admin welcome template sent to ${phoneNumber}`);
    } catch (error) {
      console.error('Error sending admin welcome template:', error);
      throw error;
    }
  }

  /**
   * Send session reminder template
   */
  static async sendSessionReminderTemplate(
    phoneNumber: string, 
    userName: string, 
    sessionDate: string,
    remainingSessions: number
  ): Promise<void> {
    try {
      await twilioClient.messages.create({
        body: `Session Reminder 🏸\n\nHi ${userName}, this is a reminder for your badminton session on ${sessionDate}.\n\nRemaining sessions: ${remainingSessions}\n\nReply "Hi" to manage your attendance.`,
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      console.log(`Session reminder template sent to ${phoneNumber}`);
    } catch (error) {
      console.error('Error sending session reminder template:', error);
      throw error;
    }
  }

  /**
   * Send low sessions warning template
   */
  static async sendLowSessionsWarningTemplate(
    phoneNumber: string, 
    userName: string, 
    remainingSessions: number
  ): Promise<void> {
    try {
      await twilioClient.messages.create({
        body: `Low Sessions Warning ⚠️\n\nHi ${userName}, you have ${remainingSessions} session(s) remaining.\n\nPlease contact an admin to purchase more sessions.\n\nReply "Hi" to check your status.`,
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      console.log(`Low sessions warning template sent to ${phoneNumber}`);
    } catch (error) {
      console.error('Error sending low sessions warning template:', error);
      throw error;
    }
  }

  /**
   * Send the admin_panel_v2 WhatsApp template to an admin using Twilio SDK v4+ (contentSid/templateParameters)
   */
  static async sendAdminPanelTemplate(phoneNumber: string, coachName: string): Promise<void> {
    try {
      console.log(`🔍 Sending admin panel template to ${phoneNumber} with coach name: "${coachName}"`);
      const response = await (twilioClient.messages.create as any)({
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`,
        contentSid: 'HX352a3822681ff2a7efe4cea37dc28922',
        templateParameters: { '1': coachName }
      });
      console.log('✅ Admin panel template sent via Twilio SDK (contentSid):', response.sid);
    } catch (error: any) {
      console.error('❌ Error sending admin panel template via Twilio SDK (contentSid):', error?.message || error);
      throw error;
    }
  }

  /**
   * Send the help menu to the admin
   */
  static async sendHelpMenu(phoneNumber: string): Promise<void> {
    try {
      await twilioClient.messages.create({
        body: `❓ Help - Available Commands:\n\n1. Add Trainee: Add new trainees to the system\n2. List Trainees: View all trainees\n3. Active Trainees: View active trainees only\n4. Help: Show this help message\n5. Exit: Exit admin mode\n\nSend 'Hi' to return to main menu`,
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
    } catch (error) {
      console.error('Error sending help menu:', error);
      throw error;
    }
  }

  /**
   * Send the trainee list to the admin
   */
  static async sendTraineeList(phoneNumber: string, trainees: any[], page: number = 1, hasMore: boolean = false): Promise<void> {
    if (trainees.length === 0) {
      await twilioClient.messages.create({
        body: "No trainees found.",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      return;
    }

    let body = `📋 Trainees (Page ${page}):\n\n`;
    trainees.forEach((trainee, index) => {
      body += `${index + 1}. ${trainee.name} (${trainee.remainingSessions || 0} sessions)\n`;
    });
    if (hasMore) body += '\nSend "next" for more';
    body += '\nSend "back" to return to menu';

    await twilioClient.messages.create({
      body,
      from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
      to: `whatsapp:${phoneNumber}`
    });
  }
} 