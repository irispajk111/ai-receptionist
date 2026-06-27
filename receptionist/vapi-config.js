/**
 * Builds the full Vapi assistant configuration for a client.
 * POST this to https://api.vapi.ai/assistant to create their receptionist.
 */
const { buildSystemPrompt } = require("./system-prompt");

function buildVapiAssistant(client) {
  return {
    name: `${client.businessName} — AI Receptionist`,
    model: {
      provider: "anthropic",
      model: "claude-haiku-4-5-20251001", // fast + cheap for voice
      temperature: 0.4,
      systemPrompt: buildSystemPrompt(client),
    },
    voice: {
      provider: "11labs",
      voiceId: client.voiceId || "21m00Tcm4TlvDq8ikWAM", // professional female voice
      stability: 0.5,
      similarityBoost: 0.75,
    },
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "en-US",
    },
    firstMessage: `Thank you for calling ${client.businessName}, this is ${client.receptionistName || "Alex"}. How can I help you today?`,
    endCallMessage: "Thank you for calling. Have a wonderful day!",
    maxDurationSeconds: 600, // 10 min max call
    silenceTimeoutSeconds: 30,
    responseDelaySeconds: 0.5,
    llmRequestDelaySeconds: 0.1,
    serverUrl: `${process.env.SERVER_URL}/webhook/vapi/${client.id}`,
    serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
    // Tool: book appointment
    tools: [
      {
        type: "function",
        function: {
          name: "book_appointment",
          description: "Book an appointment for the caller. Call this when the caller wants to schedule a service.",
          parameters: {
            type: "object",
            properties: {
              callerName: { type: "string", description: "Full name of the caller" },
              callerPhone: { type: "string", description: "Caller's phone number" },
              service: { type: "string", description: "Which service they want" },
              preferredDate: { type: "string", description: "Preferred date (YYYY-MM-DD)" },
              preferredTime: { type: "string", description: "Preferred time (HH:MM)" },
              notes: { type: "string", description: "Any special notes or requests" },
            },
            required: ["callerName", "callerPhone", "service", "preferredDate", "preferredTime"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "check_availability",
          description: "Check available appointment slots for a given date.",
          parameters: {
            type: "object",
            properties: {
              date: { type: "string", description: "Date to check (YYYY-MM-DD)" },
              service: { type: "string", description: "Service type to check availability for" },
            },
            required: ["date"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "take_message",
          description: "Take a message when the caller wants to leave one or when a question cannot be answered.",
          parameters: {
            type: "object",
            properties: {
              callerName: { type: "string" },
              callerPhone: { type: "string" },
              message: { type: "string" },
              urgency: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["callerName", "callerPhone", "message"],
          },
        },
      },
    ],
  };
}

module.exports = { buildVapiAssistant };
