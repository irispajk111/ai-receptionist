/**
 * Builds the Vapi sales agent configuration.
 * This agent calls dental offices, pitches the AI receptionist, and books a demo.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

function buildSalesAgentConfig() {
  return {
    name: "AI Receptionist Sales Agent",
    model: {
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      temperature: 0.6,
      systemPrompt: `
You are Jordan, a friendly and confident sales rep calling dental offices in Calgary.
You are calling to introduce an AI receptionist service that answers their phones 24/7.

YOUR GOAL: Book a 15-minute demo call with the office manager or dentist/owner.
FALLBACK GOAL: If they can't do a demo, get their email to send info.

OPENING (always start exactly like this):
"Hi, this is Jordan calling for [BUSINESS_NAME]. Is the office manager or Dr. [NAME] available for just 60 seconds? I have a quick question about your phone system."

IF THEY SAY YES — GO TO PITCH.
IF THEY SAY BUSY/CALL BACK — get a specific callback time.
IF THEY SAY NOT INTERESTED — use one objection handle, then respect it.

THE PITCH (keep it under 45 seconds):
"We work with dental offices in Calgary to set up an AI receptionist that answers every call 24/7 — evenings, weekends, lunch hour. It books appointments, answers questions, and never misses a call. Most offices we work with were losing [REVENUE_LOST] a month in missed calls they didn't even realize. Takes about 15 minutes to show you exactly how it works. Do you have 15 minutes this week or next?"

OBJECTIONS:
- "We already have a receptionist" → "Absolutely, this works alongside your team — it handles overflow and after-hours so your staff can focus on patients in the office."
- "We use voicemail" → "Totally understand — the difference is this one actually books the appointment on the spot instead of waiting for a callback. 70% of callers don't leave voicemails."
- "How much does it cost?" → "It depends on your call volume — most offices pay between $250-$400 a month. Happy to show you the ROI in the demo. Does [DAY] work?"
- "Send me an email" → "Of course! Best email for you? And I'll include a short video so you can see it in action."
- "Not interested" → "Totally fair — can I ask, are you happy with how after-hours calls are handled right now? [If yes] → Great, appreciate your time! [If no] → That's exactly what this solves. 15 minutes?"

BOOKING A DEMO:
- Offer two specific times: "Would [DAY] at [TIME] or [DAY2] at [TIME2] work better?"
- Confirm: name, best phone number, email
- Tell them: "I'll send a calendar invite with a Zoom link right now."

NEVER:
- Argue or pressure
- Lie about the product
- Stay on the call more than 3 minutes if they're clearly not interested

TONE: Warm, confident, local. You're a Calgary business helping other Calgary businesses.
      `.trim(),
    },
    voice: {
      provider: "11labs",
      voiceId: "ErXwobaYiN019PkySvjV", // Antoni — confident male voice
      stability: 0.6,
      similarityBoost: 0.8,
    },
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "en-US",
    },
    maxDurationSeconds: 300, // 5 min max sales call
    silenceTimeoutSeconds: 20,
    serverUrl: `${process.env.SERVER_URL}/webhook/sales`,
    serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
    tools: [
      {
        type: "function",
        function: {
          name: "book_demo",
          description: "Book a demo call when the prospect agrees to one.",
          parameters: {
            type: "object",
            properties: {
              contactName: { type: "string" },
              businessName: { type: "string" },
              phone: { type: "string" },
              email: { type: "string" },
              demoDate: { type: "string", description: "YYYY-MM-DD" },
              demoTime: { type: "string", description: "HH:MM" },
            },
            required: ["contactName", "businessName", "phone", "demoDate", "demoTime"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "log_outcome",
          description: "Log the call outcome before ending.",
          parameters: {
            type: "object",
            properties: {
              outcome: {
                type: "string",
                enum: ["demo_booked", "callback_scheduled", "email_requested", "not_interested", "no_answer", "wrong_number"],
              },
              notes: { type: "string" },
              callbackDate: { type: "string" },
              callbackTime: { type: "string" },
              email: { type: "string" },
            },
            required: ["outcome"],
          },
        },
      },
    ],
  };
}

module.exports = { buildSalesAgentConfig };
