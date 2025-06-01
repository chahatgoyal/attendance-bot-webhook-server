# WhatsApp Badminton Training Program

A WhatsApp-based chatbot system for managing badminton training sessions, trainee onboarding, and attendance tracking.

## Features

### Admin Features
- 📝 Onboard new trainees
- 👥 View and manage active trainees
- 📊 View trainees with low sessions
- 📈 Export trainee data to CSV
- ✅ Track completed trainees
- 🔄 Update trainee details
- 🗑️ Remove trainees
- 📋 Create sample test data

### Trainee Features
- 📅 Daily attendance tracking
- 📊 Check remaining sessions
- 👤 Update profile information

## Technical Stack
- Node.js
- Express.js
- Firebase Firestore
- Twilio WhatsApp API
- ngrok (for development)

## Environment Variables
```env
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_FROM_WHATSAPP=your_whatsapp_number
TWILIO_SANDBOX_CODE=your_sandbox_code
TWILIO_TEST_ACCOUNT_SID=your_test_account_sid
TWILIO_TEST_AUTH_TOKEN=your_test_auth_token
TWILIO_TEST_SANDBOX_CODE=your_test_sandbox_code
NODE_ENV=development/production
```

## Setup Instructions

1. Clone the repository
```bash
git clone [repository-url]
cd birdie-chatbot-webhook
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
- Copy `.env.example` to `.env`
- Fill in your Twilio credentials

4. Start the server
```bash
npm start
```

5. For development, start ngrok
```bash
ngrok http 3000
```

## Usage

### Admin Commands
- Send "Hi" to access admin panel
- Follow the numbered menu options
- Use "back" to return to main menu

### Trainee Commands
- Send "Hi" to see available options
- Respond to daily attendance messages
- Check remaining sessions

## Development

### Running Tests
```bash
npm test
```

### Code Style
- Follow ESLint configuration
- Use meaningful commit messages

## Contributing
1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License
[Your License]

## Support
For support, contact [Your Contact Information] 