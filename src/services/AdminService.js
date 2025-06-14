import db from "../config/firebase.js";

export async function getSuperAdminDetails(phoneNumber) {
  try {
    const adminSnapshot = await db.collection("superAdmin").where("phoneNumber", "==", phoneNumber).get();
    if(!adminSnapshot.empty) {
      return {
        name: adminSnapshot.docs[0].data().name,
        isAdmin: true
      }
    }
    console.log(`No super admin found for phone number: ${phoneNumber}`);
    return {
        name: null,
        isAdmin: false
    }
  } catch (err) {
    console.error("Error checking super admin status:", err);
    return false;
  }
}

export function generateAdminOptions() {
  return `Please select an option:\n
1. Add a new trainee
2. List all trainees
3. Update trainee details
4. Remove trainee
5. List active trainees
6. Generate CSV of active trainees
7. List expiring memberships
8. Generate sample test data
9. Help
0. Exit`;
}

export function generateHelpMessage() {
  return `Here are the available commands:\n
1. Add a new trainee: Follow the prompts to add a new trainee
2. List all trainees: View all trainees in the system
3. Update trainee details: Update trainee information
4. Remove trainee: Remove a trainee from the system
5. List active trainees: View all active trainees
6. Generate CSV: Get a CSV file of active trainees
7. List expiring memberships: View trainees with expiring memberships
8. Generate sample data: Create test data
9. Help: Show this help message
0. Exit: Return to main menu

At any point, you can:
- Send 'Hi' to return to the main menu
- Send 'Help' to see this help message
- Send 'Exit' to end the conversation`;
} 