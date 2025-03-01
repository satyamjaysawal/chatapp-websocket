const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const connectDB = require("./config/db");
const User = require("./models/User");
const Chat = require("./models/Chat");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const moment = require("moment-timezone");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });

connectDB();

// Enable CORS & JSON parsing
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Ensure 'uploads/' directory exists
const uploadPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

/**
 * ✅ Register User
 */
app.post("/register", async (req, res) => {
  const { username, password, role } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword, role });
    await user.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    res.status(400).json({ message: "User already exists" });
  }
});

/**
 * ✅ Login User
 */
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (user && (await bcrypt.compare(password, user.password))) {
      res.status(200).json({ message: "Login successful", user: { username: user.username, role: user.role } });
    } else {
      res.status(401).json({ message: "Invalid credentials" });
    }
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ✅ Delete Message
 */
app.delete("/delete-message/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { username } = req.body; // Get username from request body

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid message ID" });
    }

    const chatMessage = await Chat.findById(id);
    if (!chatMessage) {
      return res.status(404).json({ message: "Message not found" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Check if user is admin OR message sender within 10 min
    const timeDiff = Date.now() - new Date(chatMessage.timestamp).getTime();
    const canDelete = user.role === "admin" || timeDiff <= 10 * 60 * 1000;

    if (!canDelete) {
      return res.status(403).json({ message: "Only admins can delete old messages" });
    }

    await Chat.findByIdAndDelete(id);
    res.status(200).json({ message: "Message deleted successfully" });

    // Notify all clients via WebSocket
    broadcast({ type: "delete", messageId: id });

  } catch (err) {
    console.error("Error deleting message:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * ✅ Handle File Uploads
 */
app.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const fileUrl = `http://localhost:3000/uploads/${req.file.filename}`;
  const { username } = req.body;

  try {
    // ✅ Store file info in DB (Optional)
    await User.findOneAndUpdate(
      { username },
      { $push: { uploadedFiles: { fileUrl, uploadedAt: new Date() } } }
    );

    res.status(200).json({ fileUrl });
  } catch (error) {
    res.status(500).json({ message: "Error storing file info in DB" });
  }
});

/**
 * ✅ WebSocket Connection
 */
wss.on("connection", async (ws) => {
  console.log("New WebSocket connection");

  try {
    // Load chat history
    const messages = await Chat.find().sort({ timestamp: 1 });

    ws.send(
      JSON.stringify({
        type: "history",
        messages: messages.map((msg) => ({
          ...msg._doc,
          timestamp: moment(msg.timestamp).tz("Asia/Kolkata").format("DD MMM YYYY, hh:mm A"),
        })),
      })
    );

    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message);

        if (data.type === "message") {
          const newMessage = new Chat({
            username: data.username,
            type: "message",
            text: data.text,
            timestamp: new Date(),
          });

          const savedMessage = await newMessage.save();

          broadcast({
            type: "message",
            _id: savedMessage._id,
            username: data.username,
            text: data.text,
            timestamp: moment(savedMessage.timestamp).tz("Asia/Kolkata").format("DD MMM YYYY, hh:mm A"),
          });
        }
      } catch (error) {
        console.error("Error processing WebSocket message:", error);
      }
    });

    ws.on("close", () => console.log("WebSocket connection closed"));
  } catch (error) {
    console.error("Error loading chat history:", error);
  }
});

/**
 * ✅ Function to Broadcast Messages to All WebSocket Clients
 */
function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

/**
 * ✅ Start Server
 */
server.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
