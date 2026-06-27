# AI Receptionist — Setup Guide

## What This Is
Fully automated AI receptionist business for Calgary dental offices.
AI finds leads, calls them, sells the service, and delivers the product. You collect money.

## Monthly Revenue Target
- 10 clients × $297/month = $2,970/month recurring
- 25 clients × $297/month = $7,425/month recurring

---

## Setup (do once, in order)

### Step 1 — Create accounts (30 min)
Open each link and sign up. Free tiers cover everything to start.

| # | Service | Link | Purpose |
|---|---------|------|---------|
| 1 | Vapi | https://vapi.ai | AI voice calls |
| 2 | Twilio | https://twilio.com | Phone numbers |
| 3 | Stripe | https://stripe.com | Collect payments |
| 4 | Google Cloud | https://console.cloud.google.com | Find leads |
| 5 | SendGrid | https://sendgrid.com | Follow-up emails |
| 6 | Cal.com | https://cal.com | Demo booking |
| 7 | Railway | https://railway.app | Host the server |

### Step 2 — Configure keys
```
copy .env.example .env
# Open .env and fill in each key as you create accounts
```

### Step 3 — Install dependencies
```
npm install
```

### Step 4 — Deploy to Railway
```
# Push this folder to GitHub, then connect to Railway
# Railway auto-deploys on every push
# Copy your Railway URL into .env as SERVER_URL
```

### Step 5 — Create the sales agent (once)
```
node sales-agent/setup-sales-agent.js
```

### Step 6 — Scrape Calgary dental leads
```
node scraper/run-scraper.js
# Outputs: scraper/leads/calgary-dental-YYYY-MM-DD.csv
```

### Step 7 — Start calling (runs during business hours only)
```
node sales-agent/call-leads.js scraper/leads/calgary-dental-2026-06-27.csv
```

### Step 8 — Deploy a new client (after demo + payment)
```
# Fill out receptionist/client-template.json with their info
node receptionist/deploy-client.js receptionist/client-template.json
# Their AI receptionist is live instantly
```

---

## How Money Flows
1. Sales agent calls dental office
2. Office agrees to demo → calendar invite sent automatically
3. You do 15-min Zoom demo (or automate this too later)
4. They pay on Stripe → recurring $297/month
5. You run deploy-client.js → their receptionist goes live in 60 seconds
6. Stripe charges them every month automatically
7. You do nothing

---

## Files
```
ai-receptionist/
├── receptionist/          ← The product (AI voice receptionist)
│   ├── system-prompt.js   ← AI brain, customized per client
│   ├── vapi-config.js     ← Vapi assistant builder
│   ├── webhook-server.js  ← Handles calls, bookings, messages
│   ├── deploy-client.js   ← Deploy new client in 60 seconds
│   └── client-template.json ← Fill this per client
├── scraper/               ← Finds leads automatically
│   ├── find-leads.js      ← Google Maps scraper
│   ├── enrich-leads.js    ← Scores and ranks leads
│   └── run-scraper.js     ← Run both in one command
├── sales-agent/           ← Calls leads and books demos
│   ├── sales-call-script.js ← AI sales agent brain
│   ├── call-leads.js      ← Triggers outbound calls
│   ├── sales-webhook.js   ← Handles demo bookings
│   └── setup-sales-agent.js ← Create agent in Vapi (once)
├── utils/                 ← Shared helpers
│   ├── sms.js             ← Twilio SMS
│   ├── email.js           ← SendGrid email
│   └── calendar.js        ← Cal.com booking
├── db.js                  ← SQLite database
└── .env                   ← Your API keys (never share this)
```
