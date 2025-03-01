const mongoose = require("mongoose");

const chatSchema = new mongoose.Schema(
  {
    username: { type: String, required: true },
    type: { type: String, enum: ["message", "file"], required: true },
    text: { type: String, default: "" },
    fileUrl: { type: String, default: "" },
    timestamp: { type: Date, default: Date.now }, // ✅ Proper date storage
  },
  { timestamps: true }
);

module.exports = mongoose.model("Chat", chatSchema);
