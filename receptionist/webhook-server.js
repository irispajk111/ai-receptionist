const express = require("express");
const app = express();
app.use(express.json());

const db = require("../db");
const { sendSMS } = require("../utils/sms");
const { bookCalendarSlot, getAvailableSlots } = require("../utils/calendar");
const { autoOnboard } = require("./auto-onboard");

app.get("/health", (req, res) => res.json({ status: "ok" }));

// Trial signup — called from the website form
app.post("/trial/signup", async (req, res) => {
  try {
    const lead = { ...req.body, id: `trial_${Date.now()}`, status: "pending", createdAt: new Date().toISOString() };
    db.saveClient(lead);
    console.log(`NEW TRIAL SIGNUP: ${lead.businessName} — ${lead.email} — ${lead.phone}`);
    await sendSMS(
      "+14034397770",
      `NEW SIGNUP! ${lead.businessName}\nOwner: ${lead.ownerName}\nEmail: ${lead.email}\nPhone: ${lead.phone}`
    );
    // Fire-and-forget: auto-onboard runs in background, doesn't block the response
    autoOnboard(lead).catch((e) => console.error("[AUTO-ONBOARD ERROR]", e.message));
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: true }); // always succeed so user sees confirmation
  }
});

// Pronto waitlist signup
app.post("/pronto/waitlist", async (req, res) => {
  try {
    const entry = { ...req.body, id: `pronto_${Date.now()}`, createdAt: new Date().toISOString() };
    db.get("clients").push(entry).write();
    console.log(`PRONTO WAITLIST: ${entry.name} — ${entry.email} — ${entry.serviceType}`);
    await sendSMS("+14034397770", `PRONTO SIGNUP! ${entry.name || "Anonymous"}\nEmail: ${entry.email}\nService: ${entry.serviceType || "Not specified"}`);
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: true });
  }
});

app.use((req, res, next) => { res.header("Access-Control-Allow-Origin", "*"); res.header("Access-Control-Allow-Headers", "Content-Type"); next(); });
app.options("*", (req, res) => res.sendStatus(200));

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
