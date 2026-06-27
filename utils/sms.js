require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const twilio = require("twilio");

let client;
function getClient() {
  if (!client) client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client;
}

async function sendSMS(to, body) {
  return getClient().messages.create({
    from: process.env.TWILIO_FROM_NUMBER,
    to,
    body,
  });
}

module.exports = { sendSMS };
