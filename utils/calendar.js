require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const axios = require("axios");

/**
 * Gets available slots from the client's Google Calendar via Cal.com or direct API.
 * For simplicity we use Cal.com API — clients connect their Google Calendar to Cal.com.
 */
async function getAvailableSlots(client, date, service) {
  if (!client.calComUsername) return generateDefaultSlots(date);

  try {
    const { data } = await axios.get(`https://api.cal.com/v1/slots`, {
      params: {
        apiKey: process.env.CALCOM_API_KEY,
        usernameList: [client.calComUsername],
        eventTypeSlug: "appointment",
        startTime: `${date}T00:00:00Z`,
        endTime: `${date}T23:59:59Z`,
      },
    });
    return data.slots?.[date]?.map((s) => s.time.slice(11, 16)) || [];
  } catch {
    return generateDefaultSlots(date);
  }
}

async function bookCalendarSlot(client, params) {
  if (!client.calComUsername) {
    return { success: true, alternatives: [] };
  }

  try {
    const { data } = await axios.post(
      `https://api.cal.com/v1/bookings`,
      {
        apiKey: process.env.CALCOM_API_KEY,
        eventTypeId: client.calComEventTypeId,
        start: `${params.preferredDate}T${params.preferredTime}:00`,
        responses: {
          name: params.callerName,
          email: `${params.callerPhone.replace(/\D/g, "")}@sms.placeholder`,
          phone: params.callerPhone,
        },
        metadata: { bookedByAI: true, service: params.service, notes: params.notes },
        language: "en",
        timeZone: "America/Edmonton",
      }
    );
    return { success: true, bookingId: data.id };
  } catch (err) {
    const alternatives = await getAvailableSlots(client, params.preferredDate);
    return { success: false, alternatives: alternatives.slice(0, 3) };
  }
}

async function sendCalendarInvite({ to, contactName, businessName, date, time, zoomLink }) {
  // Sends a simple email with calendar details
  const { sendEmail } = require("./email");
  await sendEmail({
    to,
    subject: `Demo Confirmed — AI Receptionist for ${businessName}`,
    body: `Hi ${contactName},\n\nYour demo is confirmed!\n\nDate: ${date}\nTime: ${time} MST\nZoom: ${zoomLink}\n\nSee you then!\nJordan`,
  });
}

function generateDefaultSlots(date) {
  return ["9:00", "10:00", "11:00", "14:00", "15:00", "16:00"];
}

async function getNextAvailable(client) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateStr = tomorrow.toISOString().split("T")[0];
  const slots = await getAvailableSlots(client, dateStr);
  return slots.length ? `${dateStr} at ${slots[0]}` : "this week";
}

module.exports = { getAvailableSlots, bookCalendarSlot, sendCalendarInvite, getNextAvailable };
