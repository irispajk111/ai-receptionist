/**
 * Run this to deploy a new client's AI receptionist.
 * node deploy-client.js client-template.json
 */
const fs = require("fs");
const axios = require("axios");
const { buildVapiAssistant } = require("./vapi-config");
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

async function deployClient(configPath) {
  const client = JSON.parse(fs.readFileSync(configPath, "utf8"));
  console.log(`Deploying receptionist for: ${client.businessName}`);

  // 1. Create Vapi assistant
  const assistantConfig = buildVapiAssistant(client);
  const { data: assistant } = await axios.post(
    "https://api.vapi.ai/assistant",
    assistantConfig,
    { headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` } }
  );
  console.log(`✓ Vapi assistant created: ${assistant.id}`);

  // 2. Assign Twilio phone number to this assistant
  const { data: phone } = await axios.post(
    "https://api.vapi.ai/phone-number",
    {
      provider: "twilio",
      number: client.twilioPhoneNumber,
      twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
      twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
      assistantId: assistant.id,
      name: `${client.businessName} — Main Line`,
    },
    { headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` } }
  );
  console.log(`✓ Phone number linked: ${phone.number}`);

  // 3. Save to local DB
  const db = require("../db");
  await db.saveClient({ ...client, vapiAssistantId: assistant.id });
  console.log(`✓ Client saved to database`);

  console.log(`\nReceptionist is LIVE for ${client.businessName}`);
  console.log(`Phone: ${client.twilioPhoneNumber}`);
  console.log(`Vapi ID: ${assistant.id}`);
}

deployClient(process.argv[2] || "./client-template.json").catch(console.error);
