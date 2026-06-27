/**
 * Scrapes dental offices (or any niche) in Calgary using Google Places API.
 * Outputs a CSV of leads ready for the sales agent.
 *
 * Usage: node find-leads.js
 * Output: leads/calgary-dental-YYYY-MM-DD.csv
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const OUTPUT_DIR = path.join(__dirname, "leads");
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

const SEARCH_CONFIG = {
  city: "Calgary, AB, Canada",
  niche: "dental office",
  // Covers all of Calgary with overlapping circles
  searchZones: [
    { name: "Downtown",       lat: 51.0447, lng: -114.0719 },
    { name: "NW Calgary",     lat: 51.0997, lng: -114.1750 },
    { name: "NE Calgary",     lat: 51.1000, lng: -113.9800 },
    { name: "SW Calgary",     lat: 51.0000, lng: -114.1500 },
    { name: "SE Calgary",     lat: 50.9900, lng: -113.9700 },
    { name: "North Calgary",  lat: 51.1500, lng: -114.0600 },
    { name: "South Calgary",  lat: 50.9400, lng: -114.0800 },
  ],
  radiusMeters: 5000,
};

async function searchPlaces(lat, lng, keyword, pageToken = null) {
  const params = {
    key: GOOGLE_API_KEY,
    location: `${lat},${lng}`,
    radius: SEARCH_CONFIG.radiusMeters,
    keyword,
    type: "dentist",
  };
  if (pageToken) params.pagetoken = pageToken;

  const { data } = await axios.get(
    "https://maps.googleapis.com/maps/api/place/nearbysearch/json",
    { params }
  );
  return data;
}

async function getPlaceDetails(placeId) {
  const { data } = await axios.get(
    "https://maps.googleapis.com/maps/api/place/details/json",
    {
      params: {
        key: GOOGLE_API_KEY,
        place_id: placeId,
        fields: "name,formatted_phone_number,formatted_address,website,rating,user_ratings_total,opening_hours,business_status",
      },
    }
  );
  return data.result;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function scrapeAllLeads() {
  const seen = new Set();
  const leads = [];

  console.log(`Searching for ${SEARCH_CONFIG.niche} in ${SEARCH_CONFIG.city}...\n`);

  for (const zone of SEARCH_CONFIG.searchZones) {
    console.log(`Scanning zone: ${zone.name}`);
    let pageToken = null;
    let page = 0;

    do {
      if (pageToken) await sleep(2000); // Google requires delay between pages
      const result = await searchPlaces(zone.lat, zone.lng, SEARCH_CONFIG.niche, pageToken);

      for (const place of result.results || []) {
        if (seen.has(place.place_id)) continue;
        seen.add(place.place_id);

        if (place.business_status !== "OPERATIONAL") continue;

        // Get full details (phone, website, hours)
        await sleep(100);
        const details = await getPlaceDetails(place.place_id);

        if (!details.formatted_phone_number) continue; // Skip if no phone

        const lead = {
          businessName: details.name,
          phone: details.formatted_phone_number,
          address: details.formatted_address,
          website: details.website || "",
          rating: details.rating || "",
          reviewCount: details.user_ratings_total || 0,
          isOpen247: false,
          hasWebsite: !!details.website,
          placeId: place.place_id,
          zone: zone.name,
          // Score: higher = better prospect
          prospectScore: scoreProspect(details),
          status: "new",
        };

        leads.push(lead);
        process.stdout.write(`  Found: ${lead.businessName} (score: ${lead.prospectScore})\n`);
      }

      pageToken = result.next_page_token || null;
      page++;
    } while (pageToken && page < 3);

    await sleep(500);
  }

  return leads;
}

function scoreProspect(details) {
  let score = 50;

  // More reviews = busier practice = more calls = more value
  const reviews = details.user_ratings_total || 0;
  if (reviews > 200) score += 30;
  else if (reviews > 100) score += 20;
  else if (reviews > 50) score += 10;

  // Good rating = established business with budget
  const rating = details.rating || 0;
  if (rating >= 4.5) score += 15;
  else if (rating >= 4.0) score += 10;

  // No website = less tech-savvy = easier to sell
  if (!details.website) score += 10;

  // Has website but it's basic = opportunity
  if (details.website && !details.website.includes("booking")) score += 5;

  return score;
}

function exportCSV(leads, filePath) {
  const headers = [
    "businessName", "phone", "address", "website",
    "rating", "reviewCount", "hasWebsite", "zone",
    "prospectScore", "status"
  ];

  const rows = leads
    .sort((a, b) => b.prospectScore - a.prospectScore) // Best prospects first
    .map((l) => headers.map((h) => `"${String(l[h] || "").replace(/"/g, '""')}"`).join(","));

  const csv = [headers.join(","), ...rows].join("\n");
  fs.writeFileSync(filePath, csv, "utf8");
}

async function main() {
  if (!GOOGLE_API_KEY) {
    console.error("ERROR: GOOGLE_PLACES_API_KEY not set in .env");
    process.exit(1);
  }

  const leads = await scrapeAllLeads();
  leads.sort((a, b) => b.prospectScore - a.prospectScore);

  const date = new Date().toISOString().split("T")[0];
  const outputPath = path.join(OUTPUT_DIR, `calgary-dental-${date}.csv`);
  exportCSV(leads, outputPath);

  console.log(`\n========================================`);
  console.log(`SCRAPE COMPLETE`);
  console.log(`Total leads found: ${leads.length}`);
  console.log(`Top prospect score: ${leads[0]?.prospectScore || 0}`);
  console.log(`Output: ${outputPath}`);
  console.log(`========================================`);
  console.log(`\nTop 5 prospects:`);
  leads.slice(0, 5).forEach((l, i) => {
    console.log(`${i + 1}. ${l.businessName} — ${l.phone} (score: ${l.prospectScore})`);
  });
}

main().catch(console.error);
