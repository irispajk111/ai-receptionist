require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const axios = require("axios");
const { SYSTEM_PROMPT } = require("./setup-sales-agent");

// Patch the existing assistant with updated prompt
axios.patch(`https://api.vapi.ai/assistant/${process.env.SALES_ASSISTANT_ID}`, {
  model: {
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.6,
    systemPrompt: SYSTEM_PROMPT,
  },
}, {
  headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
}).then(r => console.log("Agent updated:", r.data.id))
  .catch(e => console.log("Error:", JSON.stringify(e.response?.data)));
