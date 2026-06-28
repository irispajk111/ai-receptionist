/**
 * Reads the leads CSV and triggers outbound sales calls via Vapi.
 * Respects Canadian calling hours (9am–5pm MST, Mon–Fri).
 *
 * Usage:
 *   node call-leads.js leads/calgary-dental-2026-06-27.csv [--limit 20] [--dry-run]
 *   node call-leads.js leads/calgary-trades-2026-06-28.csv [--limit 20] [--dry-run]
 *
 * Auto-detects dental vs trades from filename and uses the correct sales agent.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const axios = require("axios");
const fs = require("fs");

const VAPI_KEY = process.env.VAPI_API_KEY;
const DENTAL_ASSISTANT_ID = process.env.SALES_ASSISTANT_ID;
const TRADES_ASSISTANT_ID = process.env.TRADES_SALES_ASSISTANT_ID;
const VAPI_PHONE_NUMBER_ID = process.env.VAPI_PHONE_NUMBER_ID; // UUID — required by Vapi for outbound calls

const args = process.argv.slice(2);
const csvPath = args.find((a) => a.endsWith(".csv"));
const limitArg = args.find((a) => a.startsWith("--limit"));
const limit = limitArg ? parseInt(limitArg.replace("--limit", "").trim() || args[args.indexOf(limitArg) + 1]) : 999;
const dryRun = args.includes("--dry-run");

// Auto-detect which product this CSV is for
const isTrades = csvPath && csvPath.toLowerCase().includes("trade");
const ASSISTANT_ID = isTrades ? TRADES_ASSISTANT_ID : DENTAL_ASSISTANT_ID;

function parseCSV(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split("\n");
  const headers = lines[0].split(",").map((h) => h.replace(/"/g, "").trim());
  return lines
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const values = line.match(/(".*?"|[^,]+)/g) || [];
      return Object.fromEntries(
        headers.map((h, i) => [h, (values[i] || "").replace(/"/g, "").trim()])
      );
    });
}

// Normalize trades and dental CSV rows to a consistent shape
function normalizeLead(row) {
  if (isTrades) {
    return {
      businessName: row["Name"] || row["businessName"] || "",
      phone: row["Phone"] || row["phone"] || "",
      tradeType: row["Trade Type"] || "",
      estimatedRevenueLost: row["Estimated Missed Revenue/Month"] || row["estimatedRevenueLost"] || "$3,000",
      pitchAngle: row["Trade Type"] ? `${row["Trade Type"]} business missing after-hours calls` : "missed calls",
      callStatus: row["callStatus"] || "pending", // trades CSVs don't have this column — treat all as pending
    };
  }
  return {
    businessName: row["businessName"] || row["Name"] || "",
    phone: row["phone"] || row["Phone"] || "",
    estimatedRevenueLost: row["estimatedRevenueLost"] || "$3,000",
    pitchAngle: row["pitchAngle"] || "missed calls",
    callStatus: row["callStatus"] || "pending",
  };
}

function isCallingHours() {
  const now = new Date();
  const calgaryDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Edmonton" }));
  const hour = calgaryDate.getHours();
  const day = calgaryDate.getDay();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17;
}

function formatPhone(phone) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits[0] === "1") return `+${digits}`;
  return `+${digits}`;
}

async function makeCall(lead) {
  const payload = {
    assistantId: ASSISTANT_ID,
    phoneNumberId: VAPI_PHONE_NUMBER_ID, // Vapi phone number UUID — NOT the raw Twilio number
    customer: {
      number: formatPhone(lead.phone),
      name: lead.businessName,
    },
    assistantOverrides: {
      variableValues: {
        BUSINESS_NAME: lead.businessName,
        REVENUE_LOST: lead.estimatedRevenueLost,
        PITCH_ANGLE: lead.pitchAngle,
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

  if (!VAPI_PHONE_NUMBER_ID) {
    console.error("VAPI_PHONE_NUMBER_ID missing from .env — add it and retry.");
    process.exit(1);
  }

  const rows = parseCSV(csvPath);
  const leads = rows.map(normalizeLead).filter((l) => l.callStatus === "pending" && l.phone);
  const toCall = leads.slice(0, limit);

  console.log(`=== Sales Call Agent ===`);
  console.log(`Product: ${isTrades ? "Trades Answer AI" : "Dental Answer AI"}`);
  console.log(`Assistant ID: ${ASSISTANT_ID}`);
  console.log(`CSV: ${csvPath}`);
  console.log(`Total pending leads: ${leads.length} | Calling: ${toCall.length}`);
  console.log(`Dry run: ${dryRun}`);
  console.log(`Calgary business hours: ${isCallingHours() ? "YES — calling now" : "NO — outside hours"}\n`);

  if (!isCallingHours() && !dryRun) {
    console.log("Outside Calgary business hours (9am-5pm MST, Mon-Fri). Run this script between 9am-5pm.");
    process.exit(0);
  }

  let called = 0;
  let errors = 0;

  for (const lead of toCall) {
    if (dryRun) {
      console.log(`[DRY RUN] Would call: ${lead.businessName} (${lead.phone}) — ${lead.estimatedRevenueLost} missed`);
      continue;
    }

    try {
      const callId = await makeCall(lead);
      console.log(`✓ Called: ${lead.businessName} — ${lead.phone} (call ID: ${callId})`);
      called++;
      await sleep(30000); // 30 sec between calls
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.error(`✗ Failed: ${lead.businessName} — ${detail}`);
      errors++;
    }
  }

  console.log(`\nDone. Called: ${called} | Errors: ${errors}`);
}

main().catch(console.error);
