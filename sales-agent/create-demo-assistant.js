require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const DEMO_PROMPT = `You are Sarah, the AI receptionist for Calgary Dental Demo Clinic. This is a live interactive demo showing dental office owners how the AI receptionist works.

Play the role of a real receptionist:
- Greet callers warmly and professionally
- Answer questions about services: cleanings $120, fillings $200, whitening $350, emergency visits $150
- Hours: Mon-Fri 8am-6pm, Sat 9am-3pm, closed Sunday
- Offer to book appointments and ask for their name and preferred time
- Handle any question a dental patient might ask

After about 60-90 seconds of natural conversation, mention once:
"Just so you know — this is a live demo of what your own AI receptionist would sound like, customized with your practice name, your services, and your pricing. Your staff would never have to answer a routine call again."

Then continue naturally as the receptionist.

Be warm, helpful, and convincing that this technology actually works. Keep responses short — this is a phone call.`;

async function createDemoAssistant() {
  console.log("Creating demo assistant...");

  const { data } = await axios.post("https://api.vapi.ai/assistant", {
    name: "Demo Receptionist",
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      temperature: 0.4,
      systemPrompt: DEMO_PROMPT,
    },
    voice: {
      provider: "11labs",
      voiceId: "burt",
    },
    transcriber: {
      provider: "deepgram",
      model: "nova-2",
      language: "en-US",
    },
    firstMessage: "Thank you for calling Calgary Dental Clinic, this is Sarah speaking. How can I help you today?",
    endCallMessage: "Thank you for trying our demo! Visit dentalanswerai.site to start your free trial.",
    maxDurationSeconds: 180,
  }, {
    headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
  });

  console.log("Demo assistant created:", data.id);

  // Save to .env
  const envPath = path.join(__dirname, "../.env");
  const envContent = fs.readFileSync(envPath, "utf8");
  if (envContent.includes("DEMO_ASSISTANT_ID=")) {
    fs.writeFileSync(envPath, envContent.replace(/DEMO_ASSISTANT_ID=.*/, `DEMO_ASSISTANT_ID=${data.id}`));
  } else {
    fs.appendFileSync(envPath, `\nDEMO_ASSISTANT_ID=${data.id}\n`);
  }
  console.log("Saved to .env as DEMO_ASSISTANT_ID");
  return data.id;
}

createDemoAssistant().catch(console.error);
