/**
 * Full pipeline: scrape → enrich → output ready-to-call lead list.
 * Usage: node run-scraper.js
 */
const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const date = new Date().toISOString().split("T")[0];
const leadsFile = path.join(__dirname, `leads/calgary-dental-${date}.csv`);

console.log("=== AI Receptionist Lead Pipeline ===\n");

console.log("Step 1/2: Scraping Google Maps for Calgary dental offices...");
execSync(`node ${path.join(__dirname, "find-leads.js")}`, { stdio: "inherit" });

console.log("\nStep 2/2: Enriching leads with pain scores...");
execSync(`node ${path.join(__dirname, "enrich-leads.js")} "${leadsFile}"`, { stdio: "inherit" });

const lineCount = fs.readFileSync(leadsFile, "utf8").split("\n").filter(Boolean).length - 1;
console.log(`\n✓ Done. ${lineCount} leads ready at: ${leadsFile}`);
console.log(`✓ Sorted by pain score — top leads will be called first by the sales agent.`);
