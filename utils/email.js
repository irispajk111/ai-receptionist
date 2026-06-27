require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const axios = require("axios");

async function sendEmail({ to, subject, body }) {
  // Uses SendGrid — free up to 100 emails/day
  await axios.post(
    "https://api.sendgrid.com/v3/mail/send",
    {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: process.env.FROM_EMAIL, name: "Jordan — AI Receptionist Calgary" },
      subject,
      content: [{ type: "text/plain", value: body }],
    },
    { headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}` } }
  );
}

module.exports = { sendEmail };
