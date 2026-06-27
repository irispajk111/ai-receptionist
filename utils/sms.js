require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const twilio = require("twilio");

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function sendSMS(to, body) {
  return client.messages.create({
    from: process.env.TWILIO_FROM_NUMBER,
    to,
    body,
  });
}

module.exports = { sendSMS };
