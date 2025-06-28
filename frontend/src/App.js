import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';

// Simple test component
const TestLogin = () => {
  return (
    <div style={{ padding: '20px' }}>
      <h1>FanSake Login</h1>
      <p>If you can see this, the app is working!</p>
      <Link to="/">Go to Home</Link>
    </div>
  );
};

const Home = () => {
  return (
    <div style={{ padding: '20px' }}>
      <h1>FanSake Home</h1>
      <p>Welcome to FanSake!</p>
      <Link to="/login">Go to Login</Link>
    </div>
  );
};

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<TestLogin />} />
      </Routes>
    </Router>
  );
}

export default App;