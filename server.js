const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();
const nodemailer = require("nodemailer");
const { google } = require("googleapis");
const bodyParser = require("body-parser");

const app = express();
const port = process.env.PORT || 3001;

// Parse JSON bodies
app.use(bodyParser.json());

// Replace 'YOUR_OPENAI_API_KEY' with your actual OpenAI API key
const openaiApiKey = process.env.GPT;

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = "https://developers.google.com/oauthplayground";
const REFRESH_TOKEN = process.env.REFRESH_TOKEN;

const oAuth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

app.use(cors()); // Enable CORS for all routes
app.use(express.json());

app.get("/", async (req, res) => {
  res.send("Nothing to see here");
});

let userMemories = {};

app.post("/api/chat-completions", async (req, res) => {
  try {
    const { userSession, prompt } = req.body;
    console.log(`User ${userSession} prompt:\n`, prompt);

    let currentUserMessages = userMemories[userSession] || [];

    const messages = [
      { role: "system", content: "You are a helpful assistant." },
      ...currentUserMessages.map((msg) => ({ role: "user", content: msg })),
      { role: "user", content: prompt }, // Add the current prompt to the end
    ];

    currentUserMessages.push(prompt); // Push the current prompt to memory
    userMemories[userSession] = currentUserMessages; // Update the memory for the current userSession

    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: messages,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
        },
      }
    );

    console.log("Response:\n", response.data.choices[0].message.content);
    const formattedResponse = formatResponse(
      response.data.choices[0].message.content
    );

    res.send(formattedResponse);
    console.log(`Database:\n ${JSON.stringify(userMemories)}`);
  } catch (error) {
    console.error(
      "Error:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Route to clear the history
app.post("/api/clear-history", (req, res) => {
  const userSession = req.body.sessionId;
  userMemories[userSession] = []; // Reset the memory array to an empty array
  console.log("Conversation cleared for user: ", userSession);
  console.log(`Database:\n ${JSON.stringify(userMemories)}`);
  res.send("Conversation history cleared.");
});

app.post("/send_mail", (req, res) => {
  console.log("message: ", req.body); //from post in app.js

  const accessToken = oAuth2Client.getAccessToken();
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: process.env.EMAIL, //user which has access to send emails, change to admin email
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
      accessToken: accessToken,
    },
  });

  const mailOptions = {
    from: req.body.email,
    to: process.env.EMAIL,
    subject: `Message from ${req.body.email}`,
    text: `${req.body.message} \n\n From: ${req.body.name}`,
  };

  if (!(req.body === null)) {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log(error);
        res.send("error");
      } else {
        console.log("Email sent: " + info.response);
        res.send("success");
      }
    });
  }
});

function formatResponse(content) {
  const formattedContent = content
    .replace(/(?:\r\n|\r|\n)/g, "<br>") // Convert newlines to <br>
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") // Convert **text** to <strong>text</strong>
    .replace(/`(.*?)`/g, "<code>$1</code>"); // Convert `text` to <code>text</code>

  return `<div>${formattedContent}</div>`;
}

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
