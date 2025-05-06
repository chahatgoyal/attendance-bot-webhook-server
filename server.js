import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import db from "./firebase.js"; // Import Firestore

dotenv.config();
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

function getNextBusinessDay() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const day = date.getDay();
  if (day === 6) date.setDate(date.getDate() + 2); // Skip Saturday
  if (day === 0) date.setDate(date.getDate() + 1); // Skip Sunday
  return date.toISOString().split("T")[0];
}

app.post("/webhook", async (req, res) => {
  const { From, Body } = req.body;
  console.log(`Incoming message from ${From}: ${Body}`);
  const date = getNextBusinessDay();

  try {
    await db.collection("attendance").add({
      user: From,
      message: Body.trim().toLowerCase(),
      date: date,
      timestamp: new Date(),
    });
    console.log(`Saved response from ${From}: "${Body}" for ${date}`);
  } catch (err) {
    console.error("Error saving to Firestore:", err);
  }

  res.set("Content-Type", "text/xml");
  res.send("<Response></Response>");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));