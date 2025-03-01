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

// Define baseURL (configurable via environment variable or default to localhost)
const PORT = process.env.PORT || 3000;
const baseURL = process.env.BASE_URL || `http://localhost:${PORT}`;

connectDB();

// Middleware
app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Ensure 'uploads/' directory exists
const uploadPath = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ 
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|pdf|txt/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error("Only images, PDFs, and text files are allowed!"));
  }
});

// Connected clients map
const clients = new Map();

/**
 * ✅ Register User - Enhanced with validation
 */
app.post("/register", async (req, res) => {
  const { username, password, role = "user" } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }
  
  if (username.length < 3 || password.length < 6) {
    return res.status(400).json({ message: "Username must be 3+ chars, password 6+ chars" });
  }

  try {
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({ username, password: hashedPassword, role });
    await user.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ message: "Server error during registration" });
  }
});

/**
 * ✅ Login User - Enhanced with rate limiting consideration
 */
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  try {
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    res.status(200).json({ 
      message: "Login successful", 
      user: { 
        username: user.username, 
        role: user.role,
        createdAt: user.createdAt 
      } 
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error during login" });
  }
});

/**
 * ✅ Delete Message - Enhanced with better authorization
 */
app.delete("/delete-message/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { username } = req.body;

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

    const timeDiff = Date.now() - new Date(chatMessage.timestamp).getTime();
    const canDelete = 
      user.role === "admin" || 
      (chatMessage.username === username && timeDiff <= 10 * 60 * 1000);

    if (!canDelete) {
      return res.status(403).json({ 
        message: "Unauthorized: Only admins or message owners within 10 minutes can delete" 
      });
    }

    await Chat.findByIdAndDelete(id);
    res.status(200).json({ message: "Message deleted successfully" });

    broadcast({ type: "delete", messageId: id });
  } catch (err) {
    console.error("Delete message error:", err);
    res.status(500).json({ message: "Server error during message deletion" });
  }
});

/**
 * ✅ Edit Message - New endpoint
 */
app.put("/edit-message/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { username, text } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid message ID" });
    }

    if (!text || !text.trim()) {
      return res.status(400).json({ message: "Message text cannot be empty" });
    }

    const chatMessage = await Chat.findById(id);
    if (!chatMessage) {
      return res.status(404).json({ message: "Message not found" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const timeDiff = Date.now() - new Date(chatMessage.timestamp).getTime();
    const canEdit = 
      chatMessage.username === username && 
      timeDiff <= 30 * 60 * 1000; // 30-minute edit window

    if (!canEdit) {
      return res.status(403).json({ 
        message: "Unauthorized: Only message owners can edit within 30 minutes" 
      });
    }

    chatMessage.text = text.trim();
    chatMessage.edited = true;
    chatMessage.lastEditedAt = new Date();
    const updatedMessage = await chatMessage.save();

    res.status(200).json({ message: "Message edited successfully" });

    broadcast({
      type: "edit",
      _id: updatedMessage._id,
      text: updatedMessage.text,
      username: updatedMessage.username,
      timestamp: moment(updatedMessage.timestamp).tz("Asia/Kolkata").format("DD MMM YYYY, hh:mm A"),
      edited: true
    });
  } catch (err) {
    console.error("Edit message error:", err);
    res.status(500).json({ message: "Server error during message edit" });
  }
});

/**
 * ✅ Handle File Uploads - Enhanced with validation and baseURL
 */
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ message: "Username required for file upload" });
    }

    const user = await User.findOne({ username });
    if (!user) {
      fs.unlinkSync(path.join(uploadPath, req.file.filename)); // Clean up uploaded file
      return res.status(404).json({ message: "User not found" });
    }

    const fileUrl = `${baseURL}/uploads/${req.file.filename}`;
    await User.findOneAndUpdate(
      { username },
      { $push: { uploadedFiles: { fileUrl, uploadedAt: new Date(), filename: req.file.originalname } } }
    );

    const message = new Chat({
      username,
      type: "file",
      text: fileUrl,
      timestamp: new Date(),
      metadata: { originalName: req.file.originalname, mimeType: req.file.mimetype }
    });
    
    const savedMessage = await message.save();
    broadcastFileMessage(savedMessage);

    res.status(200).json({ fileUrl, messageId: savedMessage._id });
  } catch (error) {
    console.error("Upload error:", error);
    if (req.file) fs.unlinkSync(path.join(uploadPath, req.file.filename));
    res.status(500).json({ message: "Error processing file upload" });
  }
});

/**
 * ✅ WebSocket Connection - Enhanced with client tracking
 */
wss.on("connection", async (ws, req) => {
  const clientId = Date.now();
  clients.set(clientId, ws);
  console.log(`New WebSocket connection (ID: ${clientId})`);

  try {
    const messages = await Chat.find()
      .sort({ timestamp: 1 })
      .limit(100); // Limit to last 100 messages

    ws.send(JSON.stringify({
      type: "history",
      messages: messages.map(formatMessage)
    }));

    ws.on("message", async (message) => {
      try {
        const data = JSON.parse(message);

        switch (data.type) {
          case "login":
            ws.username = data.username;
            break;

          case "message":
            const newMessage = new Chat({
              username: data.username,
              type: "message",
              text: data.text,
              timestamp: new Date(),
              status: "sent"
            });
            const savedMessage = await newMessage.save();
            broadcast(formatMessage(savedMessage));
            break;

          case "edit":
            const chatMessage = await Chat.findById(data.messageId);
            if (!chatMessage || chatMessage.username !== data.username) {
              ws.send(JSON.stringify({ type: "error", message: "Cannot edit message" }));
              break;
            }
            const timeDiff = Date.now() - new Date(chatMessage.timestamp).getTime();
            if (timeDiff > 30 * 60 * 1000) {
              ws.send(JSON.stringify({ type: "error", message: "Edit time limit exceeded" }));
              break;
            }
            chatMessage.text = data.text;
            chatMessage.edited = true;
            chatMessage.lastEditedAt = new Date();
            const updatedMessage = await chatMessage.save();
            broadcast(formatMessage(updatedMessage));
            break;

          case "typing":
            broadcast({ type: "typing", username: data.username }, ws);
            break;
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
        ws.send(JSON.stringify({ type: "error", message: "Error processing message" }));
      }
    });

    ws.on("close", () => {
      clients.delete(clientId);
      console.log(`WebSocket connection closed (ID: ${clientId})`);
    });

    ws.on("error", (error) => {
      console.error(`WebSocket error (ID: ${clientId}):`, error);
    });
  } catch (error) {
    console.error("WebSocket connection error:", error);
    ws.send(JSON.stringify({ type: "error", message: "Error initializing connection" }));
  }
});

/**
 * ✅ Enhanced Broadcast Functions
 */
function broadcast(message, excludeWs = null) {
  clients.forEach((client, id) => {
    if (client.readyState === WebSocket.OPEN && client !== excludeWs) {
      try {
        client.send(JSON.stringify(message));
      } catch (error) {
        console.error(`Broadcast error to client ${id}:`, error);
        clients.delete(id);
      }
    }
  });
}

function broadcastFileMessage(message) {
  broadcast({
    type: "message",
    _id: message._id,
    username: message.username,
    text: message.text,
    timestamp: moment(message.timestamp).tz("Asia/Kolkata").format("DD MMM YYYY, hh:mm A"),
    metadata: message.metadata,
    status: "sent"
  });
}

/**
 * ✅ Message Formatting Helper
 */
function formatMessage(message) {
  return {
    _id: message._id,
    username: message.username,
    text: message.text,
    timestamp: moment(message.timestamp).tz("Asia/Kolkata").format("DD MMM YYYY, hh:mm A"),
    edited: message.edited || false,
    status: message.status || "sent",
    ...(message.metadata && { metadata: message.metadata })
  };
}

/**
 * ✅ Error Handling Middleware
 */
app.use((err, req, res, next) => {
  console.error("Application error:", err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ message: err.message });
  }
  res.status(500).json({ message: "Internal server error" });
});

/**
 * ✅ Start Server with Graceful Shutdown
 */
server.listen(PORT, () => {
  console.log(`Server running on ${baseURL}`);
});

process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);

function shutDown() {
  console.log("Received shutdown signal...");
  server.close(() => {
    mongoose.connection.close(false, () => {
      console.log("MongoDB connection closed.");
      process.exit(0);
    });
  });
  
  // Force close WebSocket connections
  clients.forEach((client) => client.close());
}