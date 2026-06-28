require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;

const SEARCH_TERMS = [
  "HVAC company",
  "plumbing company",
  "electrician",
  "plumber",
  "heating and cooling",
  "air conditioning repair",
  "furnace repair",
  "drain cleaning",
  "roofing company",
  "electrical contractor",
];

const CALGARY_ZONES = [
  { name: "Calgary NW", lat: 51.0967, lng: -114.1718 },
  { name: "Calgary NE", lat: 51.0967, lng: -113.9718 },
  { name: "Calgary SW", lat: 51.0167, lng: -114.1718 },
  { name: "Calgary SE", lat: 51.0167, lng: -113.9718 },
  { name: "Calgary Downtown", lat: 51.0447, lng: -114.0719 },
  { name: "Calgary North", lat: 51.1500, lng: -114.0719 },
  { name: "Calgary South", lat: 50.9500, lng: -114.0719 },
  { name: "Airdrie", lat: 51.2918, lng: -114.0144 },
  { name: "Cochrane", lat: 51.1895, lng: -114.4673 },
  { name: "Okotoks", lat: 50.7254, lng: -113.9754 },
];

async function searchPlaces(query, lat, lng) {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=8000&keyword=${encodeURIComponent(query)}&type=establishment&key=${API_KEY}`;
    const { data } = await axios.get(url);
    return data.results || [];
  } catch (e) {
    console.error("Search error:", e.message);
    return [];
  }
}

async function getDetails(placeId) {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_phone_number,website,rating,user_ratings_total,formatted_address,opening_hours&key=${API_KEY}`;
    const { data } = await axios.get(url);
    return data.result || {};
  } catch (e) {
    return {};
  }
}

function scoreLead(place) {
  let score = 0;

  // No website = higher pain (can't book online, more reliant on calls)
  if (!place.website) score += 30;

  // Low review count = smaller business, easier to sell
  const reviews = place.user_ratings_total || 0;
  if (reviews < 50) score += 25;
  else if (reviews < 150) score += 15;
  else if (reviews < 500) score += 5;

  // Good rating but not huge = established but not enterprise
  const rating = place.rating || 0;
  if (rating >= 4.0 && rating <= 4.7) score += 20;

  // Has phone number
  if (place.formatted_phone_number) score += 10;

  return score;
}

function detectTradeType(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("hvac") || n.includes("heating") || n.includes("cooling") || n.includes("furnace") || n.includes("air condition")) return "HVAC";
  if (n.includes("plumb") || n.includes("drain") || n.includes("pipe")) return "Plumbing";
  if (n.includes("electr")) return "Electrical";
  if (n.includes("roof")) return "Roofing";
  return "Trades";
}

function estimateMissedRevenue(place) {
  const reviews = place.user_ratings_total || 0;
  // Estimate calls/month based on review volume, assume 40% missed, avg job $800
  const estimatedCallsPerMonth = Math.max(20, Math.min(reviews * 0.3, 200));
  const missedCalls = estimatedCallsPerMonth * 0.4;
  const avgJobValue = 800;
  return Math.round(missedCalls * avgJobValue);
}

async function findTradeLeads() {
  console.log("Searching for trade leads in Calgary area...\n");

  const seen = new Set();
  const leads = [];

  for (const zone of CALGARY_ZONES) {
    for (const term of SEARCH_TERMS) {
      process.stdout.write(`Searching: ${term} in ${zone.name}... `);
      const results = await searchPlaces(term, zone.lat, zone.lng);
      console.log(`${results.length} found`);

      for (const place of results) {
        if (seen.has(place.place_id)) continue;
        seen.add(place.place_id);

        await new Promise((r) => setTimeout(r, 120));
        const details = await getDetails(place.place_id);
        const merged = { ...place, ...details };

        if (!merged.formatted_phone_number) continue;

        leads.push({
          name: merged.name,
          phone: merged.formatted_phone_number,
          address: merged.formatted_address || "",
          website: merged.website || "",
          rating: merged.rating || 0,
          reviews: merged.user_ratings_total || 0,
          tradeType: detectTradeType(merged.name),
          score: scoreLead(merged),
          estimatedMissedRevenue: estimateMissedRevenue(merged),
          placeId: place.place_id,
        });
      }

      await new Promise((r) => setTimeout(r, 300));
    }
  }

  leads.sort((a, b) => b.score - a.score);

  const dir = path.join(__dirname, "leads");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  const date = new Date().toISOString().slice(0, 10);
  const file = path.join(dir, `calgary-trades-${date}.csv`);

  const header = "Name,Phone,Trade Type,Score,Estimated Missed Revenue/Month,Rating,Reviews,Website,Address";
  const rows = leads.map(
    (l) =>
      `"${l.name}","${l.phone}","${l.tradeType}",${l.score},$${l.estimatedMissedRevenue},${l.rating},${l.reviews},"${l.website}","${l.address}"`
  );

  fs.writeFileSync(file, [header, ...rows].join("\n"));

  console.log(`\n✓ Found ${leads.length} unique trade leads`);
  console.log(`✓ Saved to ${file}`);
  console.log(`\nTop 10 leads:`);
  leads.slice(0, 10).forEach((l, i) => {
    console.log(`  ${i + 1}. ${l.name} (${l.tradeType}) — Score: ${l.score} — Est. missed: $${l.estimatedMissedRevenue}/mo — ${l.phone}`);
  });

  return file;
}

findTradeLeads().catch(console.error);
