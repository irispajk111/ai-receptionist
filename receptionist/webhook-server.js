const express = require("express");
const app = express();
app.use(express.json());

const db = require("../db");
const { sendSMS } = require("../utils/sms");
const { bookCalendarSlot, getAvailableSlots } = require("../utils/calendar");

app.get("/health", (req, res) => res.json({ status: "ok" }));

// Vapi sends events here during/after every call
app.post("/webhook/vapi/:clientId", async (req, res) => {
  const { clientId } = req.params;
  const { type, call, toolCallList } = req.body;

  // Verify webhook secret
  if (req.headers["x-vapi-secret"] !== process.env.VAPI_WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  switch (type) {
    case "tool-calls":
      return handleToolCalls(clientId, toolCallList, res);

    case "end-of-call-report":
      await handleCallEnd(clientId, call);
      return res.json({ ok: true });

    default:
      return res.json({ ok: true });
  }
});

async function handleToolCalls(clientId, toolCallList, res) {
  const client = await db.getClient(clientId);
  const results = [];

  for (const toolCall of toolCallList) {
    const { name, parameters } = toolCall.function;

    if (name === "check_availability") {
      const slots = await getAvailableSlots(client, parameters.date, parameters.service);
      results.push({
        toolCallId: toolCall.id,
        result: slots.length > 0
          ? `Available times on ${parameters.date}: ${slots.join(", ")}`
          : `No availability on ${parameters.date}. Next available: ${await getNextAvailable(client)}`,
      });
    }

    if (name === "book_appointment") {
      const booking = await bookCalendarSlot(client, parameters);
      await sendSMS(
        parameters.callerPhone,
        `Hi ${parameters.callerName}! Your appointment at ${client.businessName} is confirmed for ${parameters.preferredDate} at ${parameters.preferredTime}. Reply CANCEL to cancel. See you then!`
      );
      await db.logAppointment(clientId, parameters);
      results.push({
        toolCallId: toolCall.id,
        result: booking.success
          ? `Appointment booked successfully for ${parameters.preferredDate} at ${parameters.preferredTime}. Confirmation SMS sent.`
          : `Sorry, that slot was just taken. Available alternatives: ${booking.alternatives.join(", ")}`,
      });
    }

    if (name === "take_message") {
      await db.logMessage(clientId, parameters);
      // Email the business owner
      await notifyOwner(client, parameters);
      results.push({
        toolCallId: toolCall.id,
        result: "Message recorded. The team will follow up with you shortly.",
      });
    }
  }

  return res.json({ results });
}

async function handleCallEnd(clientId, call) {
  await db.logCall(clientId, {
    callId: call.id,
    duration: call.endedAt - call.startedAt,
    endReason: call.endedReason,
    transcript: call.transcript,
    recordingUrl: call.recordingUrl,
    callerNumber: call.customer?.number,
    cost: call.cost,
  });
}

async function notifyOwner(client, message) {
  // Simple email via sendgrid or similar
  // TODO: plug in SendGrid key
}

async function getNextAvailable(client) {
  // Returns next available date string
  return "tomorrow";
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => console.log(`Receptionist webhook running on port ${PORT}`));

module.exports = app;
