import React from "react";
import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import moment from "moment-timezone";
import { motion, AnimatePresence } from "framer-motion";
import debounce from "lodash/debounce";

// Define BaseURL with a fallback
// You can override this with environment variables in your build config
const BaseURL = window.REACT_APP_BASE_URL || "http://localhost:3000";
const WebSocketURL = BaseURL.replace("http", "ws") + "/ws";

class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Caught error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-indigo-950 text-white">
          <div className="p-8 bg-red-600/30 backdrop-blur-sm rounded-xl border border-red-500/30 shadow-xl max-w-md">
            <h2 className="text-2xl font-bold mb-3 text-red-200">Something went wrong</h2>
            <p className="text-white/90 mb-4">{this.state.error?.message || "An unexpected error occurred"}</p>
            {this.state.errorInfo && (
              <details className="text-sm text-gray-300 mb-4">
                <summary>Technical Details</summary>
                <pre className="mt-2 p-2 bg-gray-800/50 rounded">
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="bg-gradient-to-r from-red-500 to-red-600 px-5 py-2.5 rounded-lg hover:from-red-600 hover:to-red-700 transition-all shadow-md flex items-center justify-center gap-2 font-medium"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh Page
              </button>
              <button
                onClick={() => this.setState({ hasError: false })}
                className="bg-gray-600 px-5 py-2.5 rounded-lg hover:bg-gray-700 transition-all"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Chat({ user }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [error, setError] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('darkMode') === 'true' || true);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const ws = useRef(null);
  const navigate = useNavigate();
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const chatContainerRef = useRef(null);

  const sendTypingStatus = useCallback(
    debounce(() => {
      if (ws.current?.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify({ type: "typing", username: user?.username }));
      }
    }, 500),
    [user?.username]
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsAtBottom(true);
  }, []);

  const handleScroll = useCallback(() => {
    if (!chatContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
    const isBottom = scrollHeight - scrollTop - clientHeight < 10;
    setIsAtBottom(isBottom);
  }, []);

  const editMessage = useCallback((id, newText) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: "edit",
        messageId: id,
        text: newText,
        username: user.username,
        timestamp: new Date().toISOString()
      }));
      setEditingMessageId(null);
    }
  }, [user?.username]);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    localStorage.setItem('darkMode', isDarkMode);

    setTimeout(() => {
      inputRef.current?.focus();
      setIsLoading(false);
    }, 1000);

    const connectWebSocket = () => {
      if (reconnectAttempts.current >= maxReconnectAttempts) {
        setError("Failed to establish connection after multiple attempts");
        setConnectionStatus('disconnected');
        return;
      }

      if (ws.current) ws.current.close();
      ws.current = new WebSocket(WebSocketURL);
      setConnectionStatus('connecting');

      ws.current.onopen = () => {
        console.log("Connected to WebSocket");
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;
        setError(null);
        ws.current.send(JSON.stringify({ type: "login", username: user.username }));
      };

      ws.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setMessages((prev) => {
            if (data.type === "history") {
              return [...new Map(data.messages.map((msg) => [msg._id, msg])).values()];
            } else if (data.type === "delete") {
              return prev.filter((msg) => msg._id !== data.messageId);
            } else if (data.type === "edit") {
              return prev.map(msg => 
                msg._id === data._id ? { ...msg, text: data.text, edited: true, status: 'sent' } : msg
              );
            } else if (data.type === "typing") {
              setIsTyping(data.username !== user.username);
              return prev;
            }
            const updatedMessages = prev.some((msg) => msg._id === data._id) 
              ? prev.map(msg => msg._id === data._id ? { ...msg, status: 'sent' } : msg)
              : [...prev, { ...data, status: "sent" }];
            return updatedMessages;
          });
        } catch (err) {
          setError("Error processing message data");
          console.error(err);
        }
      };

      ws.current.onerror = (error) => {
        console.error("WebSocket error:", error);
        setError("Connection error occurred");
        setConnectionStatus('error');
      };

      ws.current.onclose = () => {
        console.log("WebSocket disconnected");
        setConnectionStatus('disconnected');
        reconnectAttempts.current++;
        setTimeout(connectWebSocket, Math.min(2000 * reconnectAttempts.current, 10000));
      };
    };

    connectWebSocket();
    
    const container = chatContainerRef.current;
    if (container) container.addEventListener("scroll", handleScroll);

    return () => {
      ws.current?.close();
      if (container) container.removeEventListener("scroll", handleScroll);
    };
  }, [user, navigate, handleScroll, isDarkMode]);

  const sendMessage = useCallback(() => {
    if (!input.trim() || ws.current?.readyState !== WebSocket.OPEN) {
      if (!input.trim()) return;
      setError("Cannot send message: No connection");
      return;
    }

    const message = {
      type: "message",
      username: user.username,
      text: input,
      timestamp: new Date().toISOString(),
      status: "sending",
      _id: Date.now().toString()
    };
    
    setMessages(prev => [...prev, message]);
    ws.current.send(JSON.stringify(message));
    setInput("");
    if (isAtBottom) scrollToBottom();
  }, [input, user?.username, isAtBottom, scrollToBottom]);

  const deleteMessage = useCallback(async (id) => {
    try {
      setMessages(prev => prev.map(msg => 
        msg._id === id ? { ...msg, status: 'deleting' } : msg
      ));
      const response = await fetch(`${BaseURL}/delete-message/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: user.username }),
      });

      if (!response.ok) throw new Error(await response.text());
    } catch (error) {
      setError(`Failed to delete message: ${error.message}`);
      setMessages(prev => prev.map(msg => 
        msg._id === id ? { ...msg, status: 'sent' } : msg
      ));
      console.error(error);
    }
  }, [user?.username]);

  const groupMessagesByDate = useCallback(() => {
    const grouped = {};
    messages.forEach((msg) => {
      const messageDate = moment(msg.timestamp).tz("Asia/Kolkata").startOf("day");
      const today = moment().tz("Asia/Kolkata").startOf("day");
      const yesterday = moment().tz("Asia/Kolkata").subtract(1, 'days').startOf("day");
      
      let key;
      if (messageDate.isSame(today, "day")) {
        key = "Today";
      } else if (messageDate.isSame(yesterday, "day")) {
        key = "Yesterday";
      } else {
        key = messageDate.format("DD MMM YYYY");
      }
      
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(msg);
    });
    return grouped;
  }, [messages]);

  const toggleTheme = () => setIsDarkMode(prev => !prev);

  const groupedMessages = groupMessagesByDate();

  if (!user) return <LoadingScreen />;

  const themeClass = isDarkMode 
    ? "bg-gradient-to-br from-gray-900 via-gray-800 to-indigo-950" 
    : "bg-gradient-to-br from-indigo-50 via-purple-50 to-blue-100";

  const contentBgClass = isDarkMode 
    ? "bg-gray-800/90 border-gray-700" 
    : "bg-white/80 border-gray-200";

  return (
    <ErrorBoundary>
      <div className={`flex flex-col min-h-screen ${themeClass} ${isDarkMode ? 'text-white' : 'text-gray-800'} transition-colors duration-300`}>
        <div className="fixed top-0 left-0 right-0 z-50">
          <Header 
            user={user} 
            isDarkMode={isDarkMode} 
            toggleTheme={toggleTheme} 
            connectionStatus={connectionStatus}
          />
        </div>

        <main className="flex-1 flex flex-col max-w-4xl w-full mx-auto pt-20 pb-28 sm:pt-24 sm:pb-32 px-4 sm:px-6">
          <div className="relative">
            <div 
              ref={chatContainerRef}
              className={`flex-1 ${contentBgClass} rounded-xl shadow-xl border backdrop-blur-sm p-4 sm:p-6 overflow-y-auto scrollbar-thin scrollbar-thumb-indigo-500 scrollbar-track-transparent`}
              style={{ maxHeight: 'calc(100vh - 200px)' }}
            >
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="sticky top-2 left-2 right-2 bg-red-500/90 backdrop-blur-sm text-white p-4 rounded-lg text-center shadow-lg z-10 border border-red-400/30"
                >
                  {error}
                  <button 
                    onClick={() => setError(null)} 
                    className="ml-3 p-1 hover:bg-red-600/80 rounded-full transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </motion.div>
              )}

              <AnimatePresence>
                {isLoading ? (
                  <LoadingScreen key="loading" />
                ) : Object.keys(groupedMessages).length === 0 ? (
                  <EmptyChat key="empty" isDarkMode={isDarkMode} />
                ) : (
                  Object.entries(groupedMessages).map(([date, dateMessages]) => (
                    <motion.div
                      key={date}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="mb-6"
                    >
                      <DateSeparator date={date} isDarkMode={isDarkMode} />
                      {dateMessages.map((msg) => (
                        <Message
                          key={msg._id}
                          msg={msg}
                          user={user}
                          onDelete={deleteMessage}
                          onEdit={editMessage}
                          isEditing={editingMessageId === msg._id}
                          setEditingMessageId={setEditingMessageId}
                          isDarkMode={isDarkMode}
                        />
                      ))}
                    </motion.div>
                  ))
                )}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </div>
            {!isAtBottom && (
              <motion.button
                onClick={scrollToBottom}
                className="absolute bottom-4 right-4 bg-indigo-500 text-white p-2 rounded-full shadow-lg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </motion.button>
            )}
          </div>

          {isTyping && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'} mt-2 flex items-center gap-2`}
            >
              <div className="flex space-x-1">
                <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }}></div>
                <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }}></div>
                <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }}></div>
              </div>
              <span>Someone is typing...</span>
            </motion.div>
          )}
        </main>

        <div className="fixed bottom-0 left-0 right-0 max-w-4xl mx-auto p-4 sm:p-6 z-50">
          <MessageInput
            input={input}
            setInput={setInput}
            sendMessage={sendMessage}
            inputRef={inputRef}
            sendTypingStatus={sendTypingStatus}
            disabled={ws.current?.readyState !== WebSocket.OPEN}
            isDarkMode={isDarkMode}
          />
        </div>
      </div>
    </ErrorBoundary>
  );
}

const LoadingScreen = () => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    className="h-full flex items-center justify-center"
  >
    <div className="flex flex-col items-center">
      <div className="relative w-16 h-16">
        <div className="absolute top-0 left-0 right-0 bottom-0 border-4 border-indigo-300/30 rounded-full animate-pulse"></div>
        <div className="absolute top-0 left-0 right-0 bottom-0 border-4 border-transparent border-t-indigo-500 rounded-full animate-spin"></div>
      </div>
      <p className="text-indigo-400 mt-4 font-medium animate-pulse">Loading messages...</p>
    </div>
  </motion.div>
);

const Header = ({ user, isDarkMode, toggleTheme, connectionStatus }) => (
  <header className={`w-full ${isDarkMode ? 'bg-gray-900/95 border-gray-700' : 'bg-white/95 border-gray-200'} border-b backdrop-blur-md px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between shadow-md transition-colors duration-300`}>
    <div className="flex items-center gap-3">
      <div className="text-2xl sm:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-500">
        ChatSphere
      </div>
      <span className={`text-xs px-2 py-1 rounded-full ${
        connectionStatus === 'connected' ? 'bg-green-500/20 text-green-300' :
        connectionStatus === 'connecting' ? 'bg-yellow-500/20 text-yellow-300' :
        'bg-red-500/20 text-red-300'
      }`}>
        {connectionStatus}
      </span>
    </div>
    <div className="flex items-center space-x-3">
      <motion.button 
        onClick={toggleTheme} 
        className={`p-2 rounded-full ${isDarkMode ? 'bg-gray-800 text-yellow-300' : 'bg-indigo-100 text-indigo-700'} transition-colors`}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        {isDarkMode ? (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
        )}
      </motion.button>
      <motion.div 
        className={`flex items-center space-x-3 ${isDarkMode ? 'bg-gray-800/80 hover:bg-gray-700/80' : 'bg-indigo-100/80 hover:bg-indigo-200/80'} px-3 py-2 rounded-lg transition-colors`}
        whileHover={{ scale: 1.02 }}
      >
        <div className="w-9 h-9 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-semibold shadow-md">
          {user.username.charAt(0).toUpperCase()}
        </div>
        <div>
          <div className={`font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'} text-sm sm:text-base`}>{user.username}</div>
          <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{user.role}</div>
        </div>
      </motion.div>
    </div>
  </header>
);

const EmptyChat = ({ isDarkMode }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    className="h-full flex flex-col items-center justify-center"
  >
    <div className={`bg-gradient-to-br ${isDarkMode ? 'from-gray-700/50 to-indigo-800/50' : 'from-indigo-100/50 to-blue-100/50'} p-8 rounded-xl backdrop-blur-sm border ${isDarkMode ? 'border-gray-600/30' : 'border-indigo-200/50'} shadow-lg flex flex-col items-center text-center transition-colors duration-300`}>
      <svg className={`w-16 h-16 mb-4 ${isDarkMode ? 'text-indigo-400' : 'text-indigo-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
      <p className={`text-xl font-medium ${isDarkMode ? 'text-white' : 'text-gray-800'}`}>No messages yet</p>
      <p className={`mt-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>Start the conversation below!</p>
      <div className="mt-6 flex items-center justify-center">
        <svg className="w-5 h-5 animate-bounce mr-2 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
        <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Type a message to get started</span>
      </div>
    </div>
  </motion.div>
);

const DateSeparator = ({ date, isDarkMode }) => (
  <div className="flex justify-center my-4">
    <motion.span 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`text-xs sm:text-sm ${isDarkMode ? 'text-gray-400 bg-gray-900/80' : 'text-gray-600 bg-indigo-100/80'} px-4 py-1 rounded-full shadow-sm transition-colors duration-300`}
    >
      {date}
    </motion.span>
  </div>
);

const Message = ({ msg, user, onDelete, onEdit, isEditing, setEditingMessageId, isDarkMode }) => {
  const isOwnMessage = msg.username === user.username;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editText, setEditText] = useState(msg.text);
  
  const confirmDelete = () => setShowDeleteConfirm(true);
  const handleDelete = () => {
    onDelete(msg._id);
    setShowDeleteConfirm(false);
  };
  const cancelDelete = () => setShowDeleteConfirm(false);
  
  const startEditing = () => {
    if (isOwnMessage) {
      setEditingMessageId(msg._id);
      setEditText(msg.text);
    }
  };

  const saveEdit = () => {
    if (editText.trim() && editText !== msg.text) {
      onEdit(msg._id, editText);
    }
    setEditingMessageId(null);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditText(msg.text);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: msg.status === 'deleting' ? 0.5 : 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={`mb-4 max-w-[85%] sm:max-w-[75%] ${isOwnMessage ? "ml-auto" : "mr-auto"} group`}
    >
      <div className={`flex ${isOwnMessage ? "justify-end" : "justify-start"} items-end`}>
        {!isOwnMessage && (
          <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-medium text-xs mr-2 flex-shrink-0 shadow-md">
            {msg.username.charAt(0).toUpperCase()}
          </div>
        )}
        <div
          className={`relative p-3.5 sm:p-4 rounded-xl shadow-md ${
            isOwnMessage
              ? isDarkMode
                ? "bg-gradient-to-r from-indigo-600 to-cyan-600 text-white rounded-br-none"
                : "bg-gradient-to-r from-indigo-500 to-blue-500 text-white rounded-br-none"
              : isDarkMode
                ? "bg-gray-700 text-white rounded-bl-none"
                : "bg-white text-gray-800 rounded-bl-none border border-gray-200"
          } transition-colors duration-300 ${msg.status === "sending" ? "opacity-70" : ""}`}
        >
          <div className="flex justify-between items-baseline mb-1 gap-3">
            <span className={`font-medium text-sm ${
              isOwnMessage 
                ? "text-indigo-200" 
                : isDarkMode ? "text-cyan-300" : "text-indigo-500"
            }`}>
              {msg.username}
            </span>
            <div className="flex items-center gap-2">
              {msg.status === "sending" && (
                <svg className="w-3 h-3 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {msg.status === "sent" && isOwnMessage && (
                <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              )}
              <span className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'} whitespace-nowrap`}>
                {moment(msg.timestamp).tz("Asia/Kolkata").format("hh:mm A")}
                {msg.edited && " (edited)"}
              </span>
            </div>
          </div>
          
          {isEditing ? (
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                className={`w-full ${isDarkMode ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-800'} rounded p-2`}
                onKeyPress={(e) => e.key === "Enter" && saveEdit()}
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={saveEdit} className="text-green-400 text-xs hover:text-green-300">Save</button>
                <button onClick={cancelEdit} className="text-red-400 text-xs hover:text-red-300">Cancel</button>
              </div>
            </div>
          ) : (
            <p className={`text-sm sm:text-base ${isDarkMode ? 'text-gray-100' : isOwnMessage ? 'text-white' : 'text-gray-700'} whitespace-pre-wrap break-words`}>
              {msg.text}
            </p>
          )}
          
          {(isOwnMessage || user.role === "admin") && !isEditing && !showDeleteConfirm && msg.status !== 'deleting' && (
            <div className="absolute -right-2 -top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {isOwnMessage && (
                <button
                  onClick={startEditing}
                  className={`${isDarkMode ? 'bg-blue-500 hover:bg-blue-600' : 'bg-blue-400 hover:bg-blue-500'} text-white w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all duration-200 shadow-md`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              )}
              <button
                onClick={confirmDelete}
                className={`${isDarkMode ? 'bg-red-500 hover:bg-red-600' : 'bg-red-400 hover:bg-red-500'} text-white w-6 h-6 rounded-full flex items-center justify-center text-xs transition-all duration-200 shadow-md`}
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
          
          {showDeleteConfirm && (
            <div className="absolute -right-2 -top-10 bg-gray-800 rounded-lg shadow-lg p-2 flex items-center z-10 border border-gray-700">
              <button 
                onClick={handleDelete}
                className="bg-red-500 hover:bg-red-600 text-white text-xs px-2 py-1 rounded mr-1"
              >
                Delete
              </button>
              <button 
                onClick={cancelDelete}
                className="bg-gray-600 hover:bg-gray-700 text-white text-xs px-2 py-1 rounded"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        {isOwnMessage && (
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-full flex items-center justify-center text-white font-medium text-xs ml-2 flex-shrink-0 shadow-md">
            {user.username.charAt(0).toUpperCase()}
          </div>
        )}
      </div>
    </motion.div>
  );
};

const MessageInput = ({ input, setInput, sendMessage, inputRef, sendTypingStatus, disabled, isDarkMode }) => (
  <motion.div 
    className={`${isDarkMode ? 'bg-gray-800/90 border-gray-700' : 'bg-white/90 border-gray-200'} rounded-xl p-3 sm:p-4 border backdrop-blur-sm shadow-lg transition-colors duration-300`}
    initial={{ y: 100 }}
    animate={{ y: 0 }}
    transition={{ type: "spring", stiffness: 300, damping: 30 }}
  >
    <div className="flex flex-col sm:flex-row sm:space-x-3 space-y-2 sm:space-y-0">
      <div className={`flex-1 relative ${disabled ? 'opacity-50' : ''}`}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            sendTypingStatus();
          }}
          placeholder={disabled ? "Connecting to server..." : "Type your message..."}
          className={`w-full ${isDarkMode ? 'bg-gray-900 text-white placeholder-gray-500 focus:ring-indigo-500' : 'bg-gray-100 text-gray-800 placeholder-gray-400 focus:ring-indigo-400'} rounded-lg px-4 py-3 focus:outline-none focus:ring-2 disabled:opacity-50 text-sm sm:text-base pr-10 transition-colors duration-300`}
          onKeyPress={(e) => e.key === "Enter" && sendMessage()}
          disabled={disabled}
        />
        {input && (
          <button
            onClick={() => setInput("")}
            className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-600'} p-1`}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
      <motion.button
        onClick={sendMessage}
        disabled={!input.trim() || disabled}
        className={`${
          isDarkMode 
            ? 'bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-600 hover:to-cyan-600' 
            : 'bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600'
        } text-white px-5 py-3 rounded-lg font-medium shadow-md flex items-center justify-center transition-all duration-300 text-sm sm:text-base ${
          input.trim() && !disabled
            ? "hover:shadow-lg" 
            : "opacity-50 cursor-not-allowed"
        }`}
        whileHover={{ scale: input.trim() && !disabled ? 1.05 : 1 }}
        whileTap={{ scale: input.trim() && !disabled ? 0.95 : 1 }}
      >
        <span>Send</span>
        <svg className="ml-2 w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
        </svg>
      </motion.button>
    </div>
  </motion.div>
);

export default Chat;