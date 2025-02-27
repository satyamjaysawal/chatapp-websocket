import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function Chat({ user }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [ws, setWs] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    const websocket = new WebSocket("ws://localhost:3000");

    websocket.onopen = () => {
      websocket.send(JSON.stringify({ type: "login", username: user.username }));
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMessages((prev) => [...prev, data]);
    };

    setWs(websocket);
    return () => websocket.close();
  }, [user, navigate]);

  const sendMessage = () => {
    if (input.trim()) {
      ws.send(JSON.stringify({ type: "message", username: user.username, text: input }));
      setInput("");
    }
  };

  return (
    <div className="h-screen flex flex-col items-center bg-gray-900 text-white">
      <h2 className="text-3xl font-bold my-4">Chat Room</h2>
      <div className="w-3/4 h-96 bg-gray-800 p-4 overflow-auto rounded">
        {messages.map((msg, index) => (
          <div key={index} className="mb-2">
            <strong>{msg.username}: </strong>{msg.text}
          </div>
        ))}
      </div>
      <div className="mt-4 flex w-3/4">
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type a message..." className="flex-1 p-2 rounded bg-gray-700 text-white" />
        <button onClick={sendMessage} className="ml-2 px-4 py-2 bg-blue-500 rounded hover:bg-blue-600">Send</button>
      </div>
    </div>
  );
}

export default Chat;
