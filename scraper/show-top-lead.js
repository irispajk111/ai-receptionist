require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const fs = require("fs");
const path = require("path");
const axios = require("axios");

const csvDir = path.join(__dirname, "leads");
const files = fs.readdirSync(csvDir).filter(f => f.endsWith(".csv")).sort().reverse();
if (!files.length) { console.log("No leads file found."); process.exit(1); }

const csv = fs.readFileSync(path.join(csvDir, files[0]), "utf8");
const lines = csv.split("\n").filter(Boolean);
const headers = lines[0].split(",").map(h => h.replace(/"/g, ""));
const top = lines[1].split(",").map(v => v.replace(/"/g, ""));
const lead = Object.fromEntries(headers.map((h, i) => [h, top[i]]));

console.log("Top lead:");
console.log("  Business:", lead.businessName);
console.log("  Phone:", lead.phone);
console.log("  Pain score:", lead.painScore);
console.log("  Revenue lost:", lead.estimatedRevenueLost);
console.log("  Pitch:", lead.pitchAngle);
