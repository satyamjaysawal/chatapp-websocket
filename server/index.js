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
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: "/ws" });

connectDB();

// Enable CORS
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Ensure 'uploads/' directory exists
const uploadPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadPath)) {
  fs.mkdirSync(uploadPath, { recursive: true });
}

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// ✅ Register user
app.post("/register", async (req, res) => {
  const { username, password, role } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword, role });
    await user.save();
    res.status(201).json({ message: "User registered" });
  } catch (err) {
    res.status(400).json({ message: "User already exists" });
  }
});

// ✅ Login user
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

app.delete("/delete-message/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // ✅ Validate MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid message ID" });
    }

    // ✅ Find message
    const chatMessage = await Chat.findById(id);
    if (!chatMessage) {
      return res.status(404).json({ message: "Message not found" });
    }

    // ✅ Allow deletion only within 10 minutes
    const timeDiff = Date.now() - new Date(chatMessage.timestamp).getTime();
    if (timeDiff > 10 * 60 * 1000) {
      return res.status(403).json({ message: "Cannot delete after 10 minutes" });
    }

    // ✅ Delete message
    await Chat.findByIdAndDelete(id);
    res.status(200).json({ message: "Message deleted successfully" });

    // ✅ Notify all clients via WebSocket
    broadcast({ type: "delete", messageId: id });
  } catch (err) {
    console.error("Error deleting message:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// ✅ Handle file uploads
app.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }
  res.status(200).json({ fileUrl: `http://localhost:3000/uploads/${req.file.filename}` });
});

// ✅ WebSocket Connection
wss.on("connection", async (ws) => {
  console.log("New WebSocket connection");

  // Send previous chat history to the user when they join
  const messages = await Chat.find().sort({ timestamp: 1 });
  ws.send(JSON.stringify({ type: "history", messages }));

  ws.on("message", async (message) => {
    const data = JSON.parse(message);

    if (data.type === "message") {
      const newMessage = new Chat({ username: data.username, type: "message", text: data.text });
      const savedMessage = await newMessage.save();
      broadcast({ type: "message", _id: savedMessage._id, username: data.username, text: data.text });
    } 
    else if (data.type === "file") {
      const newFileMessage = new Chat({ username: data.username, type: "file", fileUrl: data.fileUrl });
      const savedFileMessage = await newFileMessage.save();
      broadcast({ type: "file", _id: savedFileMessage._id, username: data.username, fileUrl: data.fileUrl });
    }
  });

  ws.on("close", () => console.log("WebSocket connection closed"));
});

// ✅ Function to broadcast messages to all WebSocket clients
function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// ✅ Start server
server.listen(3000, () => {
  console.log("Server is running on http://localhost:3000");
});
