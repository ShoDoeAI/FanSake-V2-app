import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MusicalNoteIcon } from '@heroicons/react/24/outline';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';

const Login = () => {
  const { login, isAuthenticated, isLoading, error, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Debug logging
  console.log('Login component rendered', {
    isAuthenticated,
    isLoading,
    hasLoginFunction: !!login,
    location: location.pathname
  });
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [formErrors, setFormErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      const from = location.state?.from?.pathname || '/discovery';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, location.state?.from?.pathname]);

  // Clear errors when component mounts or form changes
  useEffect(() => {
    clearError();
  }, [clearError]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear field error when user starts typing
    if (formErrors[name]) {
      setFormErrors(prev => ({
        ...prev,
        [name]: ''
      }));
    }
  };

  const validateForm = () => {
    const errors = {};
    
    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    
    if (!formData.password) {
      errors.password = 'Password is required';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      console.log('Attempting login with:', { email: formData.email }); // Debug log
      
      // Add fallback authentication for demo accounts
      const DEMO_ACCOUNTS = {
        'artist@demo.com': { password: 'password123', userType: 'artist' },
        'fan@demo.com': { password: 'password123', userType: 'fan' }
      };
      
      const demoAccount = DEMO_ACCOUNTS[formData.email];
      
      if (demoAccount && demoAccount.password === formData.password) {
        console.log('Demo account login successful');
        
        // Create mock user object
        const mockUser = {
          _id: formData.email === 'artist@demo.com' ? '1' : '2',
          email: formData.email,
          username: formData.email === 'artist@demo.com' ? 'demo_artist' : 'demo_fan',
          displayName: formData.email === 'artist@demo.com' ? 'Demo Artist' : 'Demo Fan',
          userType: demoAccount.userType
        };
        
        // Store in localStorage
        const mockToken = btoa(JSON.stringify({ email: formData.email, timestamp: Date.now() }));
        localStorage.setItem('token', mockToken);
        localStorage.setItem('user', JSON.stringify(mockUser));
        
        // Update auth context manually
        if (login) {
          const result = await login({
            email: formData.email,
            password: formData.password,
          });
          
          if (result.success) {
            const redirectPath = demoAccount.userType === 'artist' ? '/artist-dashboard' : '/discovery';
            const from = location.state?.from?.pathname || redirectPath;
            navigate(from, { replace: true });
            return;
          }
        }
        
        // Direct navigation if auth context fails
        const redirectPath = demoAccount.userType === 'artist' ? '/artist-dashboard' : '/discovery';
        navigate(redirectPath, { replace: true });
        return;
      }
      
      // Try normal login if not demo account
      const result = await login({
        email: formData.email,
        password: formData.password,
      });
      
      console.log('Login result:', result); // Debug log
      
      if (result.success) {
        // Redirect based on user type
        let redirectPath = '/discovery'; // Default for fans
        
        if (result.user && result.user.userType === 'artist') {
          redirectPath = '/artist-dashboard';
        }
        
        const from = location.state?.from?.pathname || redirectPath;
        console.log('Redirecting to:', from); // Debug log
        navigate(from, { replace: true });
      }
    } catch (err) {
      console.error('Login error:', err);
      
      // Show error to user
      setFormErrors({ email: 'Invalid email or password' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-200 border-t-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <Link to="/" className="flex justify-center items-center space-x-2 mb-4">
            <MusicalNoteIcon className="h-12 w-12 text-purple-600" />
            <span className="text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              MusicConnect
            </span>
          </Link>
          <h2 className="text-3xl font-bold text-gray-900">
            Welcome back
          </h2>
          <p className="mt-2 text-gray-600">
            Sign in to your account to continue discovering music
          </p>
        </div>

        {/* Login Form */}
        <Card className="p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Global Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <Input
              label="Email Address"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="Enter your email"
              error={formErrors.email}
              required
            />

            <Input
              label="Password"
              type="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="Enter your password"
              error={formErrors.password}
              required
            />

            <Button
              type="submit"
              loading={isSubmitting}
              disabled={isSubmitting}
              className="w-full"
              size="lg"
            >
              {isSubmitting ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
          
          {/* Debug Helper */}
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                console.log('Debug: Quick login as artist');
                setFormData({ email: 'artist@demo.com', password: 'password123' });
                setTimeout(() => {
                  document.querySelector('form').requestSubmit();
                }, 100);
              }}
              className="text-xs text-purple-600 hover:text-purple-700 underline"
            >
              Quick Login as Artist (Debug)
            </button>
          </div>

          {/* Footer Links */}
          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-gray-600">
              Don't have an account?{' '}
              <Link
                to="/register"
                className="font-medium text-purple-600 hover:text-purple-500 transition-colors"
              >
                Sign up here
              </Link>
            </p>
            
            <p className="text-sm">
              <Link
                to="/forgot-password"
                className="text-purple-600 hover:text-purple-500 transition-colors"
              >
                Forgot your password?
              </Link>
            </p>
          </div>
        </Card>

        {/* Demo Accounts Info */}
        <Card className="p-6 bg-purple-50 border-purple-200">
          <h3 className="text-sm font-medium text-purple-900 mb-3">
            Demo Accounts
          </h3>
          <div className="space-y-2 text-xs text-purple-800">
            <div>
              <strong>Artist:</strong> artist@demo.com / password123
            </div>
            <div>
              <strong>Fan:</strong> fan@demo.com / password123
            </div>
          </div>
        </Card>

        {/* Additional Options */}
        <div className="text-center">
          <Link
            to="/discovery"
            className="text-sm text-gray-600 hover:text-purple-600 transition-colors"
          >
            Browse music without signing in →
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Login;

