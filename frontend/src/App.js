import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import Discovery from './pages/Discovery';
import Artists from './pages/Artists';
import ArtistProfile from './pages/ArtistProfile';
import FanDashboard from './pages/FanDashboard';
import ArtistDashboard from './pages/ArtistDashboard';
import Community from './pages/Community';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <Router>
      <AuthProvider>
        <div className="min-h-screen">
          <Navbar />
          <main>
            <Routes>
              {/* Public Routes */}
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/discovery" element={<Discovery />} />
              <Route path="/artists" element={<Artists />} />
              <Route path="/artists/:id" element={<ArtistProfile />} />
              <Route path="/community" element={<Community />} />
              {/* Protected Routes */}
              <Route 
                path="/fan-dashboard" 
                element={
                  <ProtectedRoute userType="fan">
                    <FanDashboard />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/artist-dashboard" 
                element={
                  <ProtectedRoute userType="artist">
                    <ArtistDashboard />
                  </ProtectedRoute>
                } 
              />
            </Routes>
          </main>
        </div>
      </AuthProvider>
    </Router>
  );
}

export default App;

