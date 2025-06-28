import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { SupabaseAuthProvider } from './contexts/SupabaseAuthContext';
import { AuthContextAdapter } from './contexts/AuthContextAdapter';
import Loading from './components/ui/Loading';
import ProtectedRoute from './components/ProtectedRoute';

// Eager load critical components
import Navbar from './components/Navbar';
import Home from './pages/Home';

// Lazy load non-critical routes
const Login = lazy(() => import('./pages/SupabaseLogin'));
const Register = lazy(() => import('./pages/Register'));
const Discovery = lazy(() => import('./pages/Discovery'));
const Artists = lazy(() => import('./pages/Artists'));
const ArtistProfile = lazy(() => import('./pages/ArtistProfile'));
const FanDashboard = lazy(() => import('./pages/FanDashboard'));
const ArtistDashboard = lazy(() => import('./pages/ArtistDashboard'));
const Community = lazy(() => import('./pages/Community'));
const MediaLibrary = lazy(() => import('./pages/MediaLibrary'));

// Loading fallback component
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <Loading size="large" />
  </div>
);

function App() {
  return (
    <Router>
      <SupabaseAuthProvider>
        <AuthContextAdapter>
          <div className="min-h-screen">
            <Navbar />
            <main>
              <Suspense fallback={<PageLoader />}>
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
                <Route 
                  path="/media-library" 
                  element={
                    <ProtectedRoute userType="artist">
                      <MediaLibrary />
                    </ProtectedRoute>
                  } 
                />
              </Routes>
            </Suspense>
          </main>
          </div>
        </AuthContextAdapter>
      </SupabaseAuthProvider>
    </Router>
  );
}

export default App;