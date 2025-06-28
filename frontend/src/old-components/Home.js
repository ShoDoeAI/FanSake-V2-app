import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { 
  MusicalNoteIcon, 
  UserGroupIcon,
  SparklesIcon,
  HeartIcon,
  StarIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

const Home = () => {
  const { isAuthenticated, isArtist, isFan } = useAuth();

  const features = [
    {
      icon: SparklesIcon,
      title: 'Discover New Music',
      description: 'Find your next favorite artist through fan-driven recommendations and trending content.',
    },
    {
      icon: UserGroupIcon,
      title: 'Connect Communities',
      description: 'Bridge different fan bases and discover artists loved by fans with similar tastes.',
    },
    {
      icon: HeartIcon,
      title: 'Support Artists',
      description: 'Directly support independent artists with Super Fan tiers and exclusive content access.',
    },
    {
      icon: StarIcon,
      title: 'Exclusive Content',
      description: 'Get access to behind-the-scenes content, early releases, and artist exclusives.',
    },
  ];

  const stats = [
    { label: 'Independent Artists', value: '10K+' },
    { label: 'Active Fans', value: '50K+' },
    { label: 'Songs Discovered', value: '1M+' },
    { label: 'Communities', value: '500+' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50">
      {/* Hero Section */}
      <section className="pt-16 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex justify-center mb-8">
            <MusicalNoteIcon className="h-16 w-16 text-purple-600" />
          </div>
          
          <h1 className="text-4xl sm:text-6xl font-bold text-gray-900 mb-6">
            Discover Music Through
            <span className="block bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
              Fan Communities
            </span>
          </h1>
          
          <p className="text-xl text-gray-600 mb-12 max-w-3xl mx-auto">
            Connect independent artists with passionate fans. Discover new music through 
            community-driven recommendations and support your favorite artists directly.
          </p>
          
          {!isAuthenticated ? (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/register">
                <Button size="xl" className="w-full sm:w-auto">
                  Get Started
                  <ArrowRightIcon className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              <Link to="/discovery">
                <Button variant="outline" size="xl" className="w-full sm:w-auto">
                  Explore Music
                </Button>
              </Link>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/discovery">
                <Button size="xl" className="w-full sm:w-auto">
                  Discover Music
                  <ArrowRightIcon className="ml-2 h-5 w-5" />
                </Button>
              </Link>
              {isArtist() && (
                <Link to="/artist-dashboard">
                  <Button variant="outline" size="xl" className="w-full sm:w-auto">
                    Artist Dashboard
                  </Button>
                </Link>
              )}
              {isFan() && (
                <Link to="/fan-dashboard">
                  <Button variant="outline" size="xl" className="w-full sm:w-auto">
                    Your Dashboard
                  </Button>
                </Link>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Stats Section */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-purple-600 mb-2">
                  {stat.value}
                </div>
                <div className="text-gray-600">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              How It Works
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Our platform creates meaningful connections between artists and fans 
              through community-driven music discovery.
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card key={index} className="text-center p-6 hover:shadow-lg transition-shadow">
                  <div className="flex justify-center mb-4">
                    <div className="p-3 bg-purple-100 rounded-full">
                      <Icon className="h-8 w-8 text-purple-600" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600">
                    {feature.description}
                  </p>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-purple-600 to-pink-600">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            {isAuthenticated 
              ? `Welcome back! Ready to discover new music?`
              : `Join the Music Discovery Revolution`
            }
          </h2>
          <p className="text-xl text-purple-100 mb-8">
            {isAuthenticated
              ? `Explore trending content and connect with new artists and fans.`
              : `Connect with independent artists, discover new music, and be part of a passionate community.`
            }
          </p>
          
          {!isAuthenticated ? (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/register">
                <Button 
                  variant="secondary" 
                  size="lg"
                  className="w-full sm:w-auto bg-white text-purple-600 hover:bg-gray-50"
                >
                  Sign Up Now
                </Button>
              </Link>
              <Link to="/login">
                <Button 
                  variant="outline" 
                  size="lg"
                  className="w-full sm:w-auto border-white text-white hover:bg-white hover:text-purple-600"
                >
                  Login
                </Button>
              </Link>
            </div>
          ) : (
            <Link to="/discovery">
              <Button 
                variant="secondary" 
                size="lg"
                className="bg-white text-purple-600 hover:bg-gray-50"
              >
                Start Discovering
                <ArrowRightIcon className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          )}
        </div>
      </section>
    </div>
  );
};

export default Home;

