/**
 * Automated trial onboarding.
 * Called when a trial signup comes in. Runs in background (non-blocking).
 *
 * Steps:
 *  1. Build a custom AI system prompt from their form data
 *  2. Create their Vapi assistant
 *  3. Buy a dedicated Twilio phone number (Calgary 403/587)
 *  4. Register the number with Vapi, linked to their assistant
 *  5. Save everything to DB
 *  6. SMS the client their new AI number + setup instructions
 *  7. Notify Iris (the owner)
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const axios = require("axios");
const twilio = require("twilio");
const db = require("../db");
const { sendSMS } = require("../utils/sms");

const VAPI_KEY = process.env.VAPI_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const SERVER_URL = process.env.SERVER_URL;
const IRIS_PHONE = "+14034397770";

function buildTradesPrompt(lead) {
  const tradeType = lead.tradeType || "trades";
  const services = lead.services || `${tradeType} services`;
  const area = lead.serviceArea || "Calgary";
  const is24_7 = lead.emergency247 === "yes" || lead.emergency247 === true;

  return `You are a professional dispatcher and receptionist for ${lead.businessName}, a ${tradeType} company serving ${area}.

YOUR JOB:
1. Answer every call within one sentence. Sound calm, professional, and like you've done this a thousand times.
2. Find out if it's an emergency or a regular service request.
3. For emergencies (no heat, flooding, gas smell, no hot water): get their address, name, and phone number. Tell them a technician will call back within 15-30 minutes. Express urgency.
4. For regular bookings: collect name, phone, address, what the problem is, and preferred time.
5. Always repeat back the key info to confirm before ending the call.

SERVICES: ${services}
SERVICE AREA: ${area}
${is24_7 ? "HOURS: 24/7 including weekends and holidays. Always available for emergencies." : `HOURS: ${lead.hours || "Monday to Friday, 8am to 5pm"}. After-hours for emergencies only.`}
${lead.notes ? `EXTRA INFO: ${lead.notes}` : ""}

THINGS YOU NEVER DO:
- Never make up prices or timelines you don't know.
- Never promise a specific arrival time — always say "I'll have someone call you back within 15-30 minutes to confirm."
- Never argue with a caller.
- If you truly can't answer something: "Let me have [${lead.businessName}] call you back — can I confirm your number?"

TONE: Efficient, calm, and reliable. Like the best dispatcher in the city. Not chatty — just competent.

END EVERY CALL: "Is there anything else I can help with?" — wait for answer — then "Great, someone will be in touch shortly. Have a good one."`.trim();
}

function buildDentalPrompt(lead) {
  const services = lead.services || "general dentistry, cleanings, fillings, cosmetic dentistry";
  const area = lead.serviceArea || "Calgary";

  return `You are a professional dental receptionist for ${lead.businessName} in ${area}.

YOUR JOB:
1. Answer warmly and professionally. You represent a trusted dental practice.
2. Help callers: book appointments, answer pricing questions, handle cancellations, provide directions/hours.
3. For emergencies (severe pain, dental trauma, broken tooth): get their name and number. Tell them the dentist will call back within the hour.
4. For regular bookings: name, phone, what service they need, preferred date/time, and whether they're a new or existing patient.
5. Always confirm back the key details before hanging up.

SERVICES: ${services}
SERVICE AREA: ${area}
HOURS: ${lead.hours || "Monday to Friday, 8am to 5pm. Saturdays by appointment."}
${lead.notes ? `EXTRA INFO: ${lead.notes}` : ""}

THINGS YOU NEVER DO:
- Never diagnose or give medical advice.
- Never quote exact prices if you don't have them — say "I'll have the front desk follow up with exact pricing."
- Never promise same-day appointments without checking.

TONE: Warm, calm, professional. Like the best dental receptionist you've ever spoken to — makes patients feel at ease.

END EVERY CALL: "Is there anything else I can help you with today?" — wait — then close warmly.`.trim();
}

async function buyPhoneNumber() {
  const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

  // Try 403 first (Calgary), then 587 (also Calgary/Alberta)
  for (const areaCode of ["403", "587"]) {
    try {
      const available = await client.availablePhoneNumbers("CA").local.list({ areaCode, limit: 1 });
      if (available.length > 0) {
        const purchased = await client.incomingPhoneNumbers.create({
          phoneNumber: available[0].phoneNumber,
          friendlyName: "Pronto AI — New Client",
        });
        return purchased.phoneNumber;
      }
    } catch (err) {
      console.error(`No numbers in area code ${areaCode}: ${err.message}`);
    }
  }

  // Fall back to any Alberta number
  const available = await client.availablePhoneNumbers("CA").local.list({ inRegion: "AB", limit: 1 });
  if (available.length === 0) throw new Error("No Canadian phone numbers available to purchase");
  const purchased = await client.incomingPhoneNumbers.create({ phoneNumber: available[0].phoneNumber });
  return purchased.phoneNumber;
}

async function createVapiAssistant(lead) {
  const isTrades = lead.product === "trades";
  const systemPrompt = isTrades ? buildTradesPrompt(lead) : buildDentalPrompt(lead);
  const receptionistName = isTrades ? "Alex" : "Sarah";
  const firstMessage = isTrades
    ? `Thank you for calling ${lead.businessName}, this is ${receptionistName} — are you calling about an emergency or looking to book a service?`
    : `Hi, thank you for calling ${lead.businessName}, this is ${receptionistName}! How can I help you today?`;

  const { data } = await axios.post(
    "https://api.vapi.ai/assistant",
    {
      name: `${lead.businessName} — AI Receptionist (Trial)`,
      model: {
        provider: "anthropic",
        model: "claude-haiku-4-5-20251001",
        temperature: 0.4,
        systemPrompt,
      },
      voice: {
        provider: "11labs",
        voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel — professional female
        stability: 0.5,
        similarityBoost: 0.75,
      },
      transcriber: {
        provider: "deepgram",
        model: "nova-2",
        language: "en-US",
      },
      firstMessage,
      endCallMessage: "Thank you for calling. Have a great day!",
      maxDurationSeconds: 600,
      silenceTimeoutSeconds: 30,
      responseDelaySeconds: 0.5,
      serverUrl: `${SERVER_URL}/webhook/vapi/${lead.id}`,
      serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
    },
    { headers: { Authorization: `Bearer ${VAPI_KEY}` } }
  );

  return data.id;
}

async function registerPhoneWithVapi(phoneNumber, assistantId, businessName) {
  const { data } = await axios.post(
    "https://api.vapi.ai/phone-number",
    {
      provider: "twilio",
      number: phoneNumber,
      twilioAccountSid: TWILIO_ACCOUNT_SID,
      twilioAuthToken: TWILIO_AUTH_TOKEN,
      assistantId,
      name: `${businessName} — Trial`,
    },
    { headers: { Authorization: `Bearer ${VAPI_KEY}` } }
  );
  return data.id;
}

function formatPhoneReadable(e164) {
  // +14035550123 → (403) 555-0123
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11) return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return e164;
}

async function sendWelcomeMessages(lead, aiPhoneNumber) {
  const formatted = formatPhoneReadable(aiPhoneNumber);
  const product = lead.product === "trades" ? "Trades Answer AI" : "Dental Answer AI";

  // SMS to client
  const clientMsg = `Hi ${lead.ownerName}! Your AI receptionist from ${product} is live.

Your AI's phone number: ${formatted}

Next step: Set up call forwarding on your business phone so unanswered calls go to ${aiPhoneNumber}.

Test it now — call ${aiPhoneNumber} and hear your AI answer!

Questions? Reply here or email support@tradesanswerai.site`;

  try {
    await sendSMS(lead.phone, clientMsg);
    console.log(`✓ Welcome SMS sent to ${lead.phone}`);
  } catch (err) {
    console.error(`✗ Welcome SMS failed: ${err.message}`);
  }

  // SMS to Iris
  await sendSMS(
    IRIS_PHONE,
    `AUTO-ONBOARD COMPLETE ✓\n${lead.businessName}\nAI Number: ${formatted}\nVapi ID: ${lead.vapiAssistantId}\nClient: ${lead.phone}`
  );
}

async function autoOnboard(lead) {
  console.log(`[AUTO-ONBOARD] Starting for: ${lead.businessName}`);

  try {
    // Step 1: Create Vapi assistant
    const vapiAssistantId = await createVapiAssistant(lead);
    console.log(`[AUTO-ONBOARD] ✓ Vapi assistant: ${vapiAssistantId}`);

    // Step 2: Buy a phone number
    const phoneNumber = await buyPhoneNumber();
    console.log(`[AUTO-ONBOARD] ✓ Phone number: ${phoneNumber}`);

    // Step 3: Register with Vapi
    const vapiPhoneId = await registerPhoneWithVapi(phoneNumber, vapiAssistantId, lead.businessName);
    console.log(`[AUTO-ONBOARD] ✓ Vapi phone ID: ${vapiPhoneId}`);

    // Step 4: Update client record
    const updatedLead = {
      ...lead,
      vapiAssistantId,
      aiPhoneNumber: phoneNumber,
      vapiPhoneNumberId: vapiPhoneId,
      status: "trial",
      onboardedAt: new Date().toISOString(),
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    };
    db.saveClient(updatedLead);
    console.log(`[AUTO-ONBOARD] ✓ DB updated`);

    // Step 5: Send welcome messages
    await sendWelcomeMessages(updatedLead, phoneNumber);

    console.log(`[AUTO-ONBOARD] Complete for ${lead.businessName} — AI live at ${phoneNumber}`);
  } catch (err) {
    console.error(`[AUTO-ONBOARD] FAILED for ${lead.businessName}: ${err.message}`);
    // Notify Iris something went wrong so she can handle manually
    await sendSMS(
      IRIS_PHONE,
      `AUTO-ONBOARD FAILED for ${lead.businessName}\nError: ${err.message}\nManual setup needed.`
    ).catch(() => {});
  }
}

module.exports = { autoOnboard };
