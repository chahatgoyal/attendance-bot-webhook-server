module.exports = {
  apps: [{
    name: "badminton-bot",
    script: "node",
    args: "dist/server.js",
    watch: false,
    ignore_watch: ["logs/*", "node_modules", ".git", "dist"],
    env: {
      "NODE_ENV": "development",
      "PORT": 3000,
      "TWILIO_ACCOUNT_SID": process.env.TWILIO_ACCOUNT_SID,
      "TWILIO_AUTH_TOKEN": process.env.TWILIO_AUTH_TOKEN,
      "TWILIO_FROM_WHATSAPP": process.env.TWILIO_FROM_WHATSAPP,
      "TWILIO_SANDBOX_CODE": process.env.TWILIO_SANDBOX_CODE,
      "TWILIO_TEST_ACCOUNT_SID": process.env.TWILIO_TEST_ACCOUNT_SID,
      "TWILIO_TEST_AUTH_TOKEN": process.env.TWILIO_TEST_AUTH_TOKEN,
      "TWILIO_TEST_SANDBOX_CODE": process.env.TWILIO_TEST_SANDBOX_CODE,
      "SERVER_URL": process.env.SERVER_URL,
      "PREVENT_SLEEP": process.env.PREVENT_SLEEP
    },
    env_production: {
      "NODE_ENV": "production",
      "PORT": 3000
    },
    exp_backoff_restart_delay: 100,
    max_restarts: 10,
    restart_delay: 4000,
    error_file: "logs/err.log",
    out_file: "logs/out.log",
    log_file: "logs/combined.log",
    time: true,
    kill_timeout: 3000,
    listen_timeout: 3000,
    wait_ready: true,
    max_memory_restart: '500M',
    instances: 1,
    exec_mode: "fork"
  }]
}; 