require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const axios = require("axios");

async function makeTestCall(toNumber) {
  console.log(`Calling ${toNumber} with sales agent...`);

  const { data } = await axios.post("https://api.vapi.ai/call/phone", {
    assistantId: process.env.SALES_ASSISTANT_ID,
    customer: {
      number: toNumber,
      name: "Test Call",
    },
    phoneNumberId: "51c9b03f-32f1-4b0e-b926-775f2077ac57",
  }, {
    headers: { Authorization: `Bearer ${process.env.VAPI_API_KEY}` },
  });

  console.log("Call started! ID:", data.id);
  console.log("Your phone should ring in a few seconds.");
}

makeTestCall(process.argv[2]).catch(e => console.log("Error:", JSON.stringify(e.response?.data)));
