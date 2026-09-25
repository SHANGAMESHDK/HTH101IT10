require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({});

async function runTest() {
  console.log("Testing connection with API Key...");
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: "Respond with exactly one word: 'CONNECTED'."
    });
    console.log("SUCCESS! Gemini API says:", response.text.trim());
  } catch (err) {
    console.error("ERROR! Failed to connect. Error message:", err.message);
  }
}

runTest();
