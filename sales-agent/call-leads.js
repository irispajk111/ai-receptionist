/**
 * Reads the leads CSV and triggers outbound sales calls via Vapi.
 * Respects Canadian calling hours (9am–5pm MST, Mon–Fri).
 *
 * Usage: node call-leads.js leads/calgary-dental-2026-06-27.csv
 * Options:
 *   --limit 10       only call first N leads (default: all)
 *   --dry-run        log what would be called without calling
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const axios = require("axios");
const fs = require("fs");

const VAPI_KEY = process.env.VAPI_API_KEY;
const SALES_ASSISTANT_ID = process.env.SALES_ASSISTANT_ID; // set after creating the assistant
const FROM_NUMBER = process.env.TWILIO_FROM_NUMBER;

const args = process.argv.slice(2);
const csvPath = args.find((a) => a.endsWith(".csv"));
const limit = parseInt(args.find((a) => a.startsWith("--limit"))?.split(" ")[1] || "999");
const dryRun = args.includes("--dry-run");

function parseCSV(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split("\n");
  const headers = lines[0].split(",").map((h) => h.replace(/"/g, ""));
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = line.match(/(".*?"|[^,]+)/g) || [];
    return Object.fromEntries(
      headers.map((h, i) => [h, (values[i] || "").replace(/"/g, "")])
    );
  });
}

function isCallingHours() {
  // Calgary is MST (UTC-7) / MDT (UTC-6 in summer)
  const now = new Date();
  const calgaryHour = new Date(now.toLocaleString("en-US", { timeZone: "America/Edmonton" })).getHours();
  const day = new Date(now.toLocaleString("en-US", { timeZone: "America/Edmonton" })).getDay();
  const isWeekday = day >= 1 && day <= 5;
  const isBusinessHours = calgaryHour >= 9 && calgaryHour < 17;
  return isWeekday && isBusinessHours;
}

function formatPhone(phone) {
  // Normalize to E.164 format for Twilio/Vapi
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
  return `+${digits}`;
}

async function makeCall(lead) {
  const payload = {
    assistantId: SALES_ASSISTANT_ID,
    phoneNumberId: FROM_NUMBER,
    customer: {
      number: formatPhone(lead.phone),
      name: lead.businessName,
    },
    // Inject lead data so the agent can personalize the pitch
    assistantOverrides: {
      variableValues: {
        BUSINESS_NAME: lead.businessName,
        REVENUE_LOST: lead.estimatedRevenueLost || "$3,000",
        PITCH_ANGLE: lead.pitchAngle || "missed calls",
      },
    },
  };

  const { data } = await axios.post("https://api.vapi.ai/call/phone", payload, {
    headers: { Authorization: `Bearer ${VAPI_KEY}` },
  });

  return data.id;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!csvPath) {
    console.error("Usage: node call-leads.js <leads.csv> [--limit 10] [--dry-run]");
    process.exit(1);
  }

  const leads = parseCSV(csvPath).filter((l) => l.callStatus === "pending");
  const toCall = leads.slice(0, limit);

  console.log(`=== Sales Call Agent ===`);
  console.log(`Leads to call: ${toCall.length}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Calgary business hours: ${isCallingHours() ? "YES — calling now" : "NO — calls will be queued"}\n`);

  if (!isCallingHours() && !dryRun) {
    console.log("Outside Calgary business hours (9am-5pm MST, Mon-Fri). Waiting...");
    console.log("Re-run this script during business hours, or schedule it with a cron job.");
    process.exit(0);
  }

  let called = 0;
  let errors = 0;

  for (const lead of toCall) {
    if (dryRun) {
      console.log(`[DRY RUN] Would call: ${lead.businessName} — ${lead.phone}`);
      continue;
    }

    try {
      const callId = await makeCall(lead);
      console.log(`✓ Called: ${lead.businessName} — ${lead.phone} (call ID: ${callId})`);
      called++;
      // Wait 30 seconds between calls to avoid spam flags
      await sleep(30000);
    } catch (err) {
      console.error(`✗ Failed: ${lead.businessName} — ${err.message}`);
      errors++;
    }
  }

  console.log(`\nDone. Called: ${called} | Errors: ${errors}`);
}

main().catch(console.error);
