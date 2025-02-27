import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

function Login({ setUser }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch("http://localhost:3000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (response.ok) {
        setUser(data.user);
        navigate("/chat");
      } else {
        alert(data.message);
      }
    } catch {
      alert("Login failed.");
    }
  };

  return (
    <div className="h-screen flex flex-col justify-center items-center bg-gray-900">
      <form onSubmit={handleLogin} className="bg-gray-800 p-8 rounded shadow-lg w-80">
        <h2 className="text-white text-2xl mb-4 text-center">Login</h2>
        <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required className="w-full p-2 mb-3 rounded bg-gray-700 text-white" />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-2 mb-3 rounded bg-gray-700 text-white" />
        <button type="submit" className="w-full bg-blue-500 p-2 rounded hover:bg-blue-600">Login</button>
        <div className="mt-4 text-center">
          <p className="text-white">Don't have an account?</p>
          <Link to="/register" className="text-blue-400 hover:underline">Register here</Link>
        </div>
      </form>
    </div>
  );
}

export default Login;
