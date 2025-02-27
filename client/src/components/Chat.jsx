import { useEffect, useState } from 'react';

function Chat({ user, onLogout }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [ws, setWs] = useState(null);

  useEffect(() => {
    const websocket = new WebSocket('ws://localhost:3000');

    websocket.onopen = () => {
      console.log('WebSocket connection established');
      // Notify the server that the user has joined
      websocket.send(JSON.stringify({ type: 'login', username: user.username }));
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'message') {
        // Add the new message to the list
        setMessages((prev) => [...prev, { username: data.username, text: data.text }]);
      } else if (data.type === 'notification') {
        // Add a notification to the list
        setMessages((prev) => [...prev, { text: data.text, isNotification: true }]);
      }
    };

    websocket.onclose = () => {
      console.log('WebSocket connection closed');
    };

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setWs(websocket);

    return () => {
      websocket.close();
    };
  }, [user]);

  const sendMessage = () => {
    if (input.trim()) {
      // Send the message to the server
      ws.send(JSON.stringify({ type: 'message', username: user.username, text: input }));
      setInput('');
    }
  };

  return (
    <div className="chat-container">
      <h2>Welcome, {user.username} ({user.role})</h2>
      <button onClick={onLogout} className="logout-button">Logout</button>
      <div className="chat-messages">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.isNotification ? 'notification' : ''}`}>
            {msg.username && <strong>{msg.username}: </strong>}
            {msg.text}
          </div>
        ))}
      </div>
      <div className="chat-input">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          placeholder="Type a message..."
        />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}

export default Chat;