import express from "express";
import dotenv from "dotenv";
import bodyParser from "body-parser";

dotenv.config();
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.post("/webhook", (req, res) => {
  const { From, Body } = req.body;
  console.log(`Incoming message from ${From}: ${Body}`);

  // You can store this in DB here
  // await storeAttendance(From, Body, getNextBusinessDay())

  res.set("Content-Type", "text/xml");
  res.send(`<Response></Response>`);
});

app.get("/", (req, res) => {
  res.send("Twilio webhook is live 🚀");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
