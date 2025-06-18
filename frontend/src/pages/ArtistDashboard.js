import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { artistsAPI } from '../services/api';
import { 
  UserGroupIcon,
  EyeIcon,
  HeartIcon,
  ShareIcon,
  ArrowTrendingUpIcon,
  PlusIcon,
  ChartBarIcon,
  CalendarDaysIcon,
  MusicalNoteIcon,
  CogIcon,
  SparklesIcon
} from '@heroicons/react/24/outline';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Loading from '../components/ui/Loading';

const ArtistDashboard = () => {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [recentContent, setRecentContent] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Mock data for demo purposes
      const mockData = {
        stats: {
          totalFollowers: 1247,
          followerGrowth: 23,
          totalViews: 89435,
          viewGrowth: 15,
          totalLikes: 3982,
          likeGrowth: 31,
          totalContent: 18,
          contentGrowth: 12
        },
        today: {
          newFollowers: 12,
          views: 234,
          likes: 45,
          shares: 8
        },
        engagement: {
          averageEngagement: '8.2%',
          topFanTier: 'Super Fan',
          monthlyRevenue: '$487'
        },
        recentContent: [
          {
            _id: '1',
            title: 'Midnight Blues (Extended Mix)',
            type: 'music',
            createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            views: 1834,
            likes: 127,
            shares: 23
          },
          {
            _id: '2',
            title: 'Behind the Scenes: Studio Session',
            type: 'video',
            createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
            views: 892,
            likes: 76,
            shares: 12
          },
          {
            _id: '3',
            title: 'Acoustic Version - Coffee Shop Vibes',
            type: 'music',
            createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
            views: 2134,
            likes: 189,
            shares: 34
          }
        ],
        topContent: [
          { _id: '1', title: 'Electric Dreams', views: 4521 },
          { _id: '2', title: 'Sunset Drive', views: 3892 },
          { _id: '3', title: 'City Lights', views: 3102 }
        ],
        recentFollowers: [
          { _id: '1', username: 'musiclover23', fanTier: 'supporter' },
          { _id: '2', username: 'beatdrop_fan', fanTier: 'super' },
          { _id: '3', username: 'synthwave_addict', fanTier: 'casual' },
          { _id: '4', username: 'indie_explorer', fanTier: 'supporter' }
        ]
      };
      
      setDashboardData(mockData);
      setRecentContent(mockData.recentContent);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const StatCard = ({ title, value, change, icon: Icon, color = 'purple' }) => (
    <Card>
      <Card.Body className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            {change !== undefined && (
              <div className={`flex items-center mt-2 text-sm ${
                change >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                <ArrowTrendingUpIcon className={`h-4 w-4 mr-1 ${change < 0 ? 'rotate-180' : ''}`} />
                <span>{change >= 0 ? '+' : ''}{change}% from last month</span>
              </div>
            )}
          </div>
          <div className={`p-3 bg-${color}-100 rounded-full`}>
            <Icon className={`h-8 w-8 text-${color}-600`} />
          </div>
        </div>
      </Card.Body>
    </Card>
  );

  const ContentCard = ({ content }) => (
    <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
      <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-pink-400 rounded-lg flex items-center justify-center">
        <MusicalNoteIcon className="h-8 w-8 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-medium text-gray-900 truncate">{content.title}</h4>
        <p className="text-sm text-gray-600 capitalize">{content.type}</p>
        <p className="text-xs text-gray-500">
          {new Date(content.createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex space-x-4 text-sm text-gray-600">
        <div className="flex items-center">
          <EyeIcon className="h-4 w-4 mr-1" />
          <span>{content.views || 0}</span>
        </div>
        <div className="flex items-center">
          <HeartIcon className="h-4 w-4 mr-1" />
          <span>{content.likes || 0}</span>
        </div>
        <div className="flex items-center">
          <ShareIcon className="h-4 w-4 mr-1" />
          <span>{content.shares || 0}</span>
        </div>
      </div>
    </div>
  );

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
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Artist Dashboard
            </h1>
            <p className="text-gray-600">
              Welcome back, {user?.artistName || user?.username}
            </p>
          </div>
          <div className="flex space-x-3 mt-4 md:mt-0">
            <Button className="flex items-center">
              <PlusIcon className="h-4 w-4 mr-2" />
              Upload Content
            </Button>
            <Button variant="outline" className="flex items-center">
              <CogIcon className="h-4 w-4 mr-2" />
              Settings
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard
            title="Total Followers"
            value={dashboardData?.stats?.totalFollowers || 0}
            change={dashboardData?.stats?.followerGrowth}
            icon={UserGroupIcon}
            color="purple"
          />
          <StatCard
            title="Total Views"
            value={dashboardData?.stats?.totalViews || 0}
            change={dashboardData?.stats?.viewGrowth}
            icon={EyeIcon}
            color="blue"
          />
          <StatCard
            title="Total Likes"
            value={dashboardData?.stats?.totalLikes || 0}
            change={dashboardData?.stats?.likeGrowth}
            icon={HeartIcon}
            color="pink"
          />
          <StatCard
            title="Content Pieces"
            value={dashboardData?.stats?.totalContent || 0}
            change={dashboardData?.stats?.contentGrowth}
            icon={MusicalNoteIcon}
            color="green"
          />
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Performance Chart */}
            <Card>
              <Card.Header>
                <div className="flex items-center justify-between">
                  <Card.Title className="flex items-center">
                    <ChartBarIcon className="h-5 w-5 mr-2" />
                    Performance Overview
                  </Card.Title>
                  <select className="text-sm border border-gray-300 rounded-md px-3 py-1">
                    <option>Last 30 days</option>
                    <option>Last 7 days</option>
                    <option>Last 3 months</option>
                  </select>
                </div>
              </Card.Header>
              <Card.Body>
                {dashboardData?.analytics ? (
                  <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <ChartBarIcon className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                      <p className="text-gray-600">Analytics chart would go here</p>
                      <p className="text-sm text-gray-500">
                        Integration with charting library needed
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center bg-gray-50 rounded-lg">
                    <div className="text-center">
                      <p className="text-gray-600 mb-4">
                        Start uploading content to see your analytics
                      </p>
                      <Button>Upload Your First Content</Button>
                    </div>
                  </div>
                )}
              </Card.Body>
            </Card>

            {/* Recent Content */}
            <Card>
              <Card.Header>
                <div className="flex items-center justify-between">
                  <Card.Title className="flex items-center">
                    <MusicalNoteIcon className="h-5 w-5 mr-2" />
                    Recent Content
                  </Card.Title>
                  <Button variant="outline" size="sm">
                    Manage All
                  </Button>
                </div>
              </Card.Header>
              <Card.Body>
                {recentContent.length > 0 ? (
                  <div className="space-y-4">
                    {recentContent.slice(0, 5).map((content) => (
                      <ContentCard key={content._id} content={content} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <MusicalNoteIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      No content yet
                    </h3>
                    <p className="text-gray-600 mb-6">
                      Start sharing your music to engage with fans
                    </p>
                    <Button className="flex items-center">
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Upload Content
                    </Button>
                  </div>
                )}
              </Card.Body>
            </Card>

            {/* Fan Engagement */}
            <Card>
              <Card.Header>
                <Card.Title className="flex items-center">
                  <UserGroupIcon className="h-5 w-5 mr-2" />
                  Fan Engagement
                </Card.Title>
              </Card.Header>
              <Card.Body>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600 mb-1">
                      {dashboardData?.engagement?.averageEngagement || '0%'}
                    </div>
                    <p className="text-sm text-gray-600">Average Engagement</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600 mb-1">
                      {dashboardData?.engagement?.topFanTier || 'Free'}
                    </div>
                    <p className="text-sm text-gray-600">Top Fan Tier</p>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600 mb-1">
                      {dashboardData?.engagement?.monthlyRevenue || '$0'}
                    </div>
                    <p className="text-sm text-gray-600">Monthly Revenue</p>
                  </div>
                </div>
              </Card.Body>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Stats */}
            <Card>
              <Card.Header>
                <Card.Title>Today's Activity</Card.Title>
              </Card.Header>
              <Card.Body className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">New Followers</span>
                  <span className="font-semibold text-gray-900">
                    +{dashboardData?.today?.newFollowers || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Content Views</span>
                  <span className="font-semibold text-gray-900">
                    {dashboardData?.today?.views || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Likes Received</span>
                  <span className="font-semibold text-gray-900">
                    +{dashboardData?.today?.likes || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Shares</span>
                  <span className="font-semibold text-gray-900">
                    +{dashboardData?.today?.shares || 0}
                  </span>
                </div>
              </Card.Body>
            </Card>

            {/* Top Content */}
            <Card>
              <Card.Header>
                <Card.Title className="flex items-center">
                  <ArrowTrendingUpIcon className="h-5 w-5 mr-2" />
                  Top Performing
                </Card.Title>
              </Card.Header>
              <Card.Body>
                {dashboardData?.topContent?.length > 0 ? (
                  <div className="space-y-3">
                    {dashboardData.topContent.slice(0, 3).map((content, index) => (
                      <div key={content._id} className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-sm">#{index + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate text-sm">
                            {content.title}
                          </p>
                          <p className="text-xs text-gray-600">
                            {content.views} views
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 text-center py-4 text-sm">
                    Upload content to see top performers
                  </p>
                )}
              </Card.Body>
            </Card>

            {/* Recent Fans */}
            <Card>
              <Card.Header>
                <Card.Title>Recent Followers</Card.Title>
              </Card.Header>
              <Card.Body>
                {dashboardData?.recentFollowers?.length > 0 ? (
                  <div className="space-y-3">
                    {dashboardData.recentFollowers.slice(0, 4).map((fan) => (
                      <div key={fan._id} className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center">
                          <span className="text-white font-medium text-xs">
                            {fan.username.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate text-sm">
                            {fan.username}
                          </p>
                          <p className="text-xs text-gray-600 capitalize">
                            {fan.fanTier} fan
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-600 text-center py-4 text-sm">
                    No followers yet
                  </p>
                )}
              </Card.Body>
            </Card>

            {/* Quick Actions */}
            <Card>
              <Card.Header>
                <Card.Title>Quick Actions</Card.Title>
              </Card.Header>
              <Card.Body className="space-y-3">
                <Button variant="outline" className="w-full justify-start">
                  <PlusIcon className="h-4 w-4 mr-2" />
                  Upload New Content
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <SparklesIcon className="h-4 w-4 mr-2" />
                  Create Exclusive Content
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <CalendarDaysIcon className="h-4 w-4 mr-2" />
                  Schedule Post
                </Button>
                <Link to={`/artists/${user?._id}`} className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <EyeIcon className="h-4 w-4 mr-2" />
                    View Public Profile
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

export default ArtistDashboard;

