import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch("http://localhost:3000/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      alert(data.message);
      if (response.ok) navigate("/login");
    } catch (err) {
      alert("Error registering user.");
    }
  };

  return (
    <div className="h-screen flex flex-col justify-center items-center bg-gray-900">
      <form onSubmit={handleRegister} className="bg-gray-800 p-8 rounded shadow-lg w-80">
        <h2 className="text-white text-2xl mb-4 text-center">Register</h2>
        <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required className="w-full p-2 mb-3 rounded bg-gray-700 text-white" />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full p-2 mb-3 rounded bg-gray-700 text-white" />
        <button type="submit" className="w-full bg-green-500 p-2 rounded hover:bg-green-600">Register</button>
        <div className="mt-4 text-center">
          <p className="text-white">Already have an account?</p>
          <Link to="/login" className="text-blue-400 hover:underline">Login here</Link>
        </div>
      </form>
    </div>
  );
}

export default Register;
