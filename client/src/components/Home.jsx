import { Link } from "react-router-dom";

function Home() {
  return (
    <div className="h-screen flex flex-col justify-center items-center bg-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-4">Welcome to Chat App</h1>
      <p className="mb-6">Please log in or register to start chatting.</p>
      <div className="flex space-x-4">
        <Link to="/login" className="bg-blue-500 px-4 py-2 rounded hover:bg-blue-600">Login</Link>
        <Link to="/register" className="bg-green-500 px-4 py-2 rounded hover:bg-green-600">Register</Link>
      </div>
    </div>
  );
}

export default Home;
