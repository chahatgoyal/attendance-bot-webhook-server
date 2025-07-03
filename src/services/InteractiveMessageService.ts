import { twilioClient } from "../config/twilio.config.js";
import { Firestore } from 'firebase-admin/firestore';

export interface InteractiveButton {
  id: string;
  title: string;
  type: 'reply';
}

export interface InteractiveList {
  id: string;
  title: string;
  description?: string;
}

export class InteractiveMessageService {
  private db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  async sendAdminMenu(phoneNumber: string, adminName?: string): Promise<void> {
    // Try interactive message first
    try {
      const message = {
        body: `Welcome ${adminName || 'Admin'}! Please select an option:`,
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`,
        actions: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: 'add_trainee',
                title: 'Add New Trainee'
              }
            },
            {
              type: 'reply',
              reply: {
                id: 'list_trainees',
                title: 'List All Trainees'
              }
            },
            {
              type: 'reply',
              reply: {
                id: 'active_trainees',
                title: 'Active Trainees'
              }
            },
            {
              type: 'reply',
              reply: {
                id: 'help',
                title: 'Help'
              }
            },
            {
              type: 'reply',
              reply: {
                id: 'exit',
                title: 'Exit'
              }
            }
          ]
        }
      };

      console.log('Attempting to send interactive message:', JSON.stringify(message, null, 2));
      await twilioClient.messages.create(message);
      console.log('Interactive message sent successfully');
      
    } catch (error) {
      console.error('Error sending interactive message:', error);
      console.log('Falling back to text message');
      
      // Fallback to text message
      await twilioClient.messages.create({
        body: `Welcome ${adminName || 'Admin'}! Please select an option:\n\n1. Add new trainee\n2. List all trainees\n3. Active trainees\n4. Help\n5. Exit\n\nReply with the number (1-5)`,
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
    }
  }

  async sendTraineeList(phoneNumber: string, trainees: any[], page: number = 1, hasMore: boolean = false): Promise<void> {
    if (trainees.length === 0) {
      await twilioClient.messages.create({
        body: "No trainees found.",
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
      return;
    }

    // For now, use text format since interactive lists are complex
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

  async sendConfirmationButtons(phoneNumber: string, message: string): Promise<void> {
    try {
      const interactiveMessage = {
        body: message,
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`,
        actions: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: 'confirm_yes',
                title: 'Yes'
              }
            },
            {
              type: 'reply',
              reply: {
                id: 'confirm_no',
                title: 'No'
              }
            }
          ]
        }
      };

      console.log('Attempting to send confirmation buttons:', JSON.stringify(interactiveMessage, null, 2));
      await twilioClient.messages.create(interactiveMessage);
      console.log('Confirmation buttons sent successfully');
      
    } catch (error) {
      console.error('Error sending confirmation buttons:', error);
      console.log('Falling back to text message');
      
      // Fallback to text message
      await twilioClient.messages.create({
        body: `${message}\n\nReply with:\n- Yes to confirm\n- No to decline`,
        from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
        to: `whatsapp:${phoneNumber}`
      });
    }
  }

  async sendAttendanceConfirmation(phoneNumber: string, traineeName: string, remainingSessions: number): Promise<void> {
    const message = `Hi ${traineeName}! You have ${remainingSessions} sessions remaining. Please confirm your attendance for tomorrow's session:`;
    
    await this.sendConfirmationButtons(phoneNumber, message);
  }

  async sendHelpMenu(phoneNumber: string): Promise<void> {
    // Use simple text format for help
    await twilioClient.messages.create({
      body: "❓ Help - Available Commands:\n\n1. Add Trainee: Add new trainees to the system\n2. List Trainees: View all trainees\n3. Active Trainees: View active trainees only\n4. Help: Show this help message\n5. Exit: Exit admin mode\n\nSend 'Hi' to return to main menu",
      from: `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`,
      to: `whatsapp:${phoneNumber}`
    });
  }
}

export const interactiveMessageService = new InteractiveMessageService(null as any); 