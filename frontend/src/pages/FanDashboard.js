import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { fansAPI } from '../services/api';
import { 
  UserGroupIcon,
  StarIcon,
  HeartIcon,
  SparklesIcon,
  TrophyIcon,
  ArrowUpIcon,
  MusicalNoteIcon,
  CalendarIcon
} from '@heroicons/react/24/outline';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Loading from '../components/ui/Loading';

const FanDashboard = () => {
  const { user, getFanTier } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [followedArtists, setFollowedArtists] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fanTier = getFanTier();

  const tierBenefits = {
    free: {
      name: 'Free Fan',
      color: 'bg-gray-500',
      benefits: ['Follow artists', 'Access public content', 'Community interactions']
    },
    premium: {
      name: 'Premium Fan',
      color: 'bg-blue-500',
      benefits: ['All free benefits', 'Premium content access', 'Early releases', 'Priority support']
    },
    superfan: {
      name: 'Super Fan',
      color: 'bg-purple-500',
      benefits: ['All premium benefits', 'Exclusive content', 'Artist meetups', 'Limited merchandise']
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Mock data for demo purposes
      const mockDashboard = {
        stats: {
          followingCount: 8,
          likedCount: 234,
          discoveriesCount: 47
        },
        recentActivity: [
          {
            description: 'Liked "Neon Dreams" by NightRider',
            timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000)
          },
          {
            description: 'Started following Luna Belle',
            timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000)
          },
          {
            description: 'Shared "Coffee Shop Sessions"',
            timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000)
          },
          {
            description: 'Discovered Thunder Strike',
            timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        ],
        recommendations: [
          {
            _id: '1',
            title: 'Electric Pulse',
            artist: { _id: 'a1', username: 'techno_wizard', artistName: 'Circuit Master' }
          },
          {
            _id: '2', 
            title: 'Morning Coffee',
            artist: { _id: 'a2', username: 'acoustic_soul', artistName: 'River Song' }
          },
          {
            _id: '3',
            title: 'City Nights',
            artist: { _id: 'a3', username: 'urban_beats', artistName: 'Metro Sound' }
          },
          {
            _id: '4',
            title: 'Ocean Waves',
            artist: { _id: 'a4', username: 'ambient_master', artistName: 'Nature Sounds' }
          }
        ]
      };
      
      const mockFollowedArtists = [
        {
          _id: 'a1',
          username: 'synthwave_producer',
          artistName: 'NightRider',
          location: 'Los Angeles, CA'
        },
        {
          _id: 'a2', 
          username: 'indie_soul',
          artistName: 'Luna Belle',
          location: 'Nashville, TN'
        },
        {
          _id: 'a3',
          username: 'rock_legends',
          artistName: 'The Midnight Band',
          location: 'Seattle, WA'
        },
        {
          _id: 'a4',
          username: 'beat_master',
          artistName: 'DJ FlowState', 
          location: 'Atlanta, GA'
        },
        {
          _id: 'a5',
          username: 'folk_artist',
          artistName: 'River Song',
          location: 'Portland, OR'
        }
      ];
      
      setDashboardData(mockDashboard);
      setFollowedArtists(mockFollowedArtists);
      setRecommendations(mockDashboard.recommendations);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleTierUpgrade = async () => {
    try {
      // This would open a payment flow in a real app
      console.log('Opening tier upgrade flow...');
    } catch (err) {
      console.error('Error upgrading tier:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loading size="lg" text="Loading your dashboard..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">{error}</h2>
          <Button onClick={loadDashboardData}>Try Again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome back, {user?.username}!
          </h1>
          <p className="text-gray-600">
            Your music discovery dashboard
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <Card.Body className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-purple-100 rounded-full">
                  <UserGroupIcon className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Following</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {dashboardData?.stats?.followingCount || 0}
                  </p>
                </div>
              </div>
            </Card.Body>
          </Card>

          <Card>
            <Card.Body className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-pink-100 rounded-full">
                  <HeartIcon className="h-6 w-6 text-pink-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Liked Content</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {dashboardData?.stats?.likedCount || 0}
                  </p>
                </div>
              </div>
            </Card.Body>
          </Card>

          <Card>
            <Card.Body className="p-6">
              <div className="flex items-center">
                <div className="p-3 bg-blue-100 rounded-full">
                  <SparklesIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Discoveries</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {dashboardData?.stats?.discoveriesCount || 0}
                  </p>
                </div>
              </div>
            </Card.Body>
          </Card>

          <Card>
            <Card.Body className="p-6">
              <div className="flex items-center">
                <div className={`p-3 rounded-full ${tierBenefits[fanTier]?.color || 'bg-gray-500'} bg-opacity-20`}>
                  <TrophyIcon className={`h-6 w-6 ${tierBenefits[fanTier]?.color?.replace('bg-', 'text-') || 'text-gray-600'}`} />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Fan Tier</p>
                  <p className="text-lg font-bold text-gray-900 capitalize">
                    {tierBenefits[fanTier]?.name || 'Free Fan'}
                  </p>
                </div>
              </div>
            </Card.Body>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Fan Tier Section */}
            <Card>
              <Card.Header>
                <Card.Title className="flex items-center">
                  <TrophyIcon className="h-5 w-5 mr-2" />
                  Your Fan Tier
                </Card.Title>
              </Card.Header>
              <Card.Body>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 capitalize">
                      {tierBenefits[fanTier]?.name}
                    </h3>
                    <p className="text-gray-600">
                      {fanTier === 'superfan' 
                        ? 'You have access to all exclusive content!'
                        : 'Upgrade to unlock more exclusive content'
                      }
                    </p>
                  </div>
                  {fanTier !== 'superfan' && (
                    <Button onClick={handleTierUpgrade} className="flex items-center">
                      <ArrowUpIcon className="h-4 w-4 mr-1" />
                      Upgrade
                    </Button>
                  )}
                </div>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-900">Your Benefits:</h4>
                  <ul className="space-y-1">
                    {tierBenefits[fanTier]?.benefits.map((benefit, index) => (
                      <li key={index} className="flex items-center text-sm text-gray-600">
                        <StarIcon className="h-4 w-4 text-yellow-500 mr-2 flex-shrink-0" />
                        {benefit}
                      </li>
                    ))}
                  </ul>
                </div>
              </Card.Body>
            </Card>

            {/* Recent Activity */}
            <Card>
              <Card.Header>
                <Card.Title className="flex items-center">
                  <CalendarIcon className="h-5 w-5 mr-2" />
                  Recent Activity
                </Card.Title>
              </Card.Header>
              <Card.Body>
                {dashboardData?.recentActivity?.length > 0 ? (
                  <div className="space-y-4">
                    {dashboardData.recentActivity.map((activity, index) => (
                      <div key={index} className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                        <div className="p-2 bg-purple-100 rounded-full">
                          <MusicalNoteIcon className="h-4 w-4 text-purple-600" />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {activity.description}
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(activity.timestamp).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 text-center py-8">
                    No recent activity. Start exploring music to see your activity here!
                  </p>
                )}
              </Card.Body>
            </Card>

            {/* Recommendations */}
            <Card>
              <Card.Header>
                <div className="flex items-center justify-between">
                  <Card.Title className="flex items-center">
                    <SparklesIcon className="h-5 w-5 mr-2" />
                    Recommended for You
                  </Card.Title>
                  <Link to="/discovery?tab=recommendations">
                    <Button variant="ghost" size="sm">View All</Button>
                  </Link>
                </div>
              </Card.Header>
              <Card.Body>
                {recommendations.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {recommendations.slice(0, 4).map((item) => (
                      <div key={item._id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-400 rounded-lg flex items-center justify-center">
                          <MusicalNoteIcon className="h-6 w-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-900 truncate">
                            {item.title}
                          </h4>
                          <p className="text-sm text-gray-600 truncate">
                            by {item.artist?.artistName || item.artist?.username}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 text-center py-8">
                    Follow some artists to get personalized recommendations!
                  </p>
                )}
              </Card.Body>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Following Artists */}
            <Card>
              <Card.Header>
                <div className="flex items-center justify-between">
                  <Card.Title>Following ({followedArtists.length})</Card.Title>
                  <Link to="/artists">
                    <Button variant="ghost" size="sm">Discover More</Button>
                  </Link>
                </div>
              </Card.Header>
              <Card.Body>
                {followedArtists.length > 0 ? (
                  <div className="space-y-3">
                    {followedArtists.slice(0, 5).map((artist) => (
                      <Link
                        key={artist._id}
                        to={`/artists/${artist._id}`}
                        className="flex items-center space-x-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center">
                          <span className="text-white font-medium text-sm">
                            {(artist.artistName || artist.username).charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {artist.artistName || artist.username}
                          </p>
                          <p className="text-sm text-gray-600 truncate">
                            {artist.location}
                          </p>
                        </div>
                      </Link>
                    ))}
                    {followedArtists.length > 5 && (
                      <Link to="/fan-dashboard/following" className="block text-center">
                        <Button variant="ghost" size="sm" className="w-full">
                          View All ({followedArtists.length})
                        </Button>
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <UserGroupIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600 mb-4">
                      You're not following any artists yet
                    </p>
                    <Link to="/artists">
                      <Button size="sm">Discover Artists</Button>
                    </Link>
                  </div>
                )}
              </Card.Body>
            </Card>

            {/* Quick Actions */}
            <Card>
              <Card.Header>
                <Card.Title>Quick Actions</Card.Title>
              </Card.Header>
              <Card.Body className="space-y-3">
                <Link to="/discovery" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <SparklesIcon className="h-4 w-4 mr-2" />
                    Discover Music
                  </Button>
                </Link>
                <Link to="/community" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <UserGroupIcon className="h-4 w-4 mr-2" />
                    Community Feed
                  </Button>
                </Link>
                <Link to="/artists" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <MusicalNoteIcon className="h-4 w-4 mr-2" />
                    Browse Artists
                  </Button>
                </Link>
              </Card.Body>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FanDashboard;

