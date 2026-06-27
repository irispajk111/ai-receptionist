/**
 * Handles Vapi webhook events from sales calls.
 * Plugged into the main webhook server.
 */
const db = require("../db");
const { sendCalendarInvite } = require("../utils/calendar");
const { sendEmail } = require("../utils/email");

async function handleSalesToolCalls(toolCallList, res) {
  const results = [];

  for (const toolCall of toolCallList) {
    const { name, parameters } = toolCall.function;

    if (name === "book_demo") {
      // Create calendar event and send invite
      await sendCalendarInvite({
        to: parameters.email,
        contactName: parameters.contactName,
        businessName: parameters.businessName,
        date: parameters.demoDate,
        time: parameters.demoTime,
        zoomLink: process.env.DEMO_ZOOM_LINK,
      });

      await db.logDemoBooked(parameters);
      console.log(`DEMO BOOKED: ${parameters.businessName} — ${parameters.demoDate} ${parameters.demoTime}`);

      results.push({
        toolCallId: toolCall.id,
        result: `Demo booked for ${parameters.demoDate} at ${parameters.demoTime}. Calendar invite sent to ${parameters.email || parameters.phone}.`,
      });
    }

    if (name === "log_outcome") {
      await db.logSalesOutcome(parameters);

      if (parameters.outcome === "email_requested" && parameters.email) {
        await sendEmail({
          to: parameters.email,
          subject: "Your AI Receptionist for [Business Name]",
          body: buildFollowUpEmail(parameters),
        });
      }

      results.push({
        toolCallId: toolCall.id,
        result: "Outcome logged.",
      });
    }
  }

  return res.json({ results });
}

function buildFollowUpEmail(params) {
  return `
Hi ${params.contactName || "there"},

Thanks for taking my call today!

As promised, here's a quick overview of the AI receptionist we set up for dental offices in Calgary:

• Answers every call 24/7 — evenings, weekends, lunch hour
• Books appointments directly into your calendar
• Handles FAQs, directions, pricing questions
• Sends SMS confirmations to patients automatically
• You get a dashboard showing every call and booking

Most practices we work with were missing 30-40% of calls outside business hours without realizing it.

I'd love to show you a live demo — takes 15 minutes. You can book directly here:
[DEMO_BOOKING_LINK]

Any questions, just reply to this email.

Jordan
AI Receptionist Calgary
  `.trim();
}

module.exports = { handleSalesToolCalls };
