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

    const websocket = new WebSocket("ws://localhost:3000/ws");

    websocket.onopen = () => {
      websocket.send(JSON.stringify({ type: "login", username: user.username }));
    };

    websocket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMessages((prev) => [...prev, data]);
    };

    websocket.onclose = () => {
      console.log("WebSocket disconnected, reconnecting...");
      setTimeout(() => setWs(new WebSocket("ws://localhost:3000/ws")), 1000);
    };

    setWs(websocket);
    return () => websocket.close();
  }, [user, navigate]);

  const sendMessage = () => {
    if (input.trim() && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "message", username: user.username, text: input }));
      setInput("");
    } else {
      console.error("WebSocket not connected");
    }
  };


  const sendFile = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:3000/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      if (response.ok && ws) {
        ws.send(JSON.stringify({ type: "file", username: user.username, fileUrl: data.fileUrl }));
      } else {
        alert("File upload failed");
      }
    } catch (error) {
      console.error("Error uploading file:", error);
    }
  };

  return (
    <div className="h-screen flex flex-col items-center bg-gray-900 text-white">
      <h2 className="text-3xl font-bold my-4">Chat Room</h2>
      <div className="w-3/4 h-96 bg-gray-800 p-4 overflow-auto rounded">
        {messages.map((msg, index) => (
          <div key={index} className="mb-2">
            {msg.type === "message" ? (
              <strong>{msg.username}: {msg.text}</strong>
            ) : msg.type === "file" && msg.fileUrl ? (
              <div>
                <strong>{msg.username} shared a file: </strong>
                <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                  {msg.fileUrl.split("/").pop()}
                </a>

              </div>
            ) : null}
          </div>
        ))}

      </div>
      <div className="mt-4 flex w-3/4 space-x-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 p-2 rounded bg-gray-700 text-white"
        />
        <button onClick={sendMessage} className="bg-blue-500 px-4 py-2 rounded hover:bg-blue-600">Send</button>
        <input type="file" onChange={sendFile} className="hidden" id="fileUpload" />
        <label htmlFor="fileUpload" className="bg-green-500 px-4 py-2 rounded cursor-pointer hover:bg-green-600">
          Upload File
        </label>
      </div>
    </div>
  );
}

export default Chat;
