const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const connectDB = require('./config/db');
const User = require('./models/User');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

connectDB(); // Connect to MongoDB

// Enable CORS
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));

app.use(express.json());

// Register route
app.post('/register', async (req, res) => {
  const { username, password, role } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword, role });
    await user.save();
    res.status(201).json({ message: 'User registered' });
  } catch (err) {
    res.status(400).json({ message: 'User already exists' });
  }
});

// Login route
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
      res.status(200).json({ message: 'Login successful', user: { username: user.username, role: user.role } });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// WebSocket connection
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    if (data.type === 'login') {
      // Broadcast to all users that a new user has joined
      broadcast({ type: 'notification', text: `${data.username} joined the chat` });
    } else if (data.type === 'message') {
      // Broadcast the message to all users
      broadcast({ type: 'message', username: data.username, text: data.text });
    }
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
  });
});

function broadcast(message) {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

server.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});