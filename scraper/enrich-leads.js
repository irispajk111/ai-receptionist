/**
 * Enriches leads CSV with pain score, estimated revenue lost, and pitch angle.
 * Usage: node enrich-leads.js leads/calgary-dental-2026-06-27.csv
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const fs = require("fs");

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

function hasOnlineBooking(website) {
  if (!website) return false;
  return ["book", "schedule", "appointment", "calendly", "jane", "opencare"]
    .some((kw) => website.toLowerCase().includes(kw));
}

function estimateRevenueLost(reviewCount) {
  const calls = Math.max(50, parseInt(reviewCount || 0) * 0.3);
  const missed = Math.round(calls * 0.35);
  return `$${(missed * 200).toLocaleString()}/month`;
}

function getPitchAngle(lead) {
  if (!lead.website) return "No website — missing calls AND hard to find online";
  if (!hasOnlineBooking(lead.website)) return "Busy practice with no online booking — missing calls constantly";
  return "High volume practice — after-hours and overflow coverage";
}

async function enrichLeads(inputPath) {
  const leads = parseCSV(inputPath);
  console.log(`Enriching ${leads.length} leads...`);

  const enriched = leads.map((lead) => ({
    ...lead,
    estimatedRevenueLost: estimateRevenueLost(lead.reviewCount),
    hasOnlineBooking: hasOnlineBooking(lead.website),
    painScore: parseInt(lead.prospectScore || 50) + (hasOnlineBooking(lead.website) ? 0 : 20),
    pitchAngle: getPitchAngle(lead),
    callStatus: "pending",
  }));

  enriched.sort((a, b) => b.painScore - a.painScore);

  const headers = Object.keys(enriched[0]);
  const rows = enriched.map((l) =>
    headers.map((h) => `"${String(l[h] || "").replace(/"/g, '""')}"`).join(",")
  );
  fs.writeFileSync(inputPath, [headers.join(","), ...rows].join("\n"), "utf8");

  console.log(`\nTop 5 prospects by pain score:`);
  enriched.slice(0, 5).forEach((l, i) => {
    console.log(`${i + 1}. ${l.businessName} — ${l.phone}`);
    console.log(`   Revenue lost: ${l.estimatedRevenueLost} | Pitch: ${l.pitchAngle}\n`);
  });
}

enrichLeads(process.argv[2]).catch(console.error);
