import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  MusicalNoteIcon, 
  PhotoIcon, 
  VideoCameraIcon,
  CloudArrowUpIcon,
  TrashIcon,
  PlayIcon,
  EyeIcon,
  HeartIcon
} from '@heroicons/react/24/outline';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Loading from '../components/ui/Loading';
import MediaUploadModal from '../components/MediaUploadModal';
import uploadService from '../services/uploadService';

const MediaLibrary = () => {
  const { user } = useAuth();
  const [uploads, setUploads] = useState({ music: [], images: [], videos: [] });
  const [activeTab, setActiveTab] = useState('music');
  const [isLoading, setIsLoading] = useState(true);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadType, setUploadType] = useState('music');
  const [selectedMedia, setSelectedMedia] = useState(null);

  useEffect(() => {
    loadUploads();
  }, []);

  const loadUploads = async () => {
    setIsLoading(true);
    try {
      const myUploads = await uploadService.getMyUploads();
      setUploads(myUploads);
    } catch (error) {
      console.error('Error loading uploads:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (type, filename) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return;

    try {
      await uploadService.deleteFile(type, filename);
      await loadUploads();
    } catch (error) {
      console.error('Error deleting file:', error);
      alert('Failed to delete file');
    }
  };

  const MediaCard = ({ item, type }) => {
    const getIcon = () => {
      switch (type) {
        case 'music':
          return <MusicalNoteIcon className="w-6 h-6" />;
        case 'images':
          return <PhotoIcon className="w-6 h-6" />;
        case 'videos':
          return <VideoCameraIcon className="w-6 h-6" />;
        default:
          return null;
      }
    };

    const getTierBadge = (tier) => {
      const tierColors = {
        free: 'bg-gray-100 text-gray-800',
        supporter: 'bg-blue-100 text-blue-800',
        superfan: 'bg-purple-100 text-purple-800'
      };

      return (
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${tierColors[tier] || tierColors.free}`}>
          {tier.charAt(0).toUpperCase() + tier.slice(1)}
        </span>
      );
    };

    return (
      <Card className="hover:shadow-lg transition-shadow">
        <Card.Body className="p-4">
          <div className="flex items-start space-x-4">
            <div className="flex-shrink-0 w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center text-white">
              {getIcon()}
            </div>
            
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-gray-900 truncate">{item.title}</h4>
              <p className="text-sm text-gray-600 mt-1">{item.description || 'No description'}</p>
              
              <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                <span>{uploadService.formatFileSize(item.size)}</span>
                <span>{new Date(item.uploadDate).toLocaleDateString()}</span>
                {(type === 'music' || type === 'videos') && getTierBadge(item.tier)}
              </div>

              <div className="flex items-center space-x-4 mt-3 text-sm">
                <div className="flex items-center text-gray-600">
                  <EyeIcon className="w-4 h-4 mr-1" />
                  <span>{item.plays || 0}</span>
                </div>
                <div className="flex items-center text-gray-600">
                  <HeartIcon className="w-4 h-4 mr-1" />
                  <span>{item.likes || 0}</span>
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 flex items-center space-x-2">
              <button
                onClick={() => window.open(uploadService.getFileUrl(type, item.filename), '_blank')}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="View/Play"
              >
                {type === 'images' ? <EyeIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5" />}
              </button>
              <button
                onClick={() => handleDelete(type, item.filename)}
                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                title="Delete"
              >
                <TrashIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
        </Card.Body>
      </Card>
    );
  };

  const TabButton = ({ tab, icon: Icon, label, count }) => (
    <button
      onClick={() => setActiveTab(tab)}
      className={`flex items-center space-x-2 px-4 py-2 font-medium rounded-lg transition-colors ${
        activeTab === tab
          ? 'bg-purple-600 text-white'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon className="w-5 h-5" />
      <span>{label}</span>
      <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
        activeTab === tab
          ? 'bg-white/20 text-white'
          : 'bg-gray-200 text-gray-700'
      }`}>
        {count}
      </span>
    </button>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loading size="lg" text="Loading your media library..." />
      </div>
    );
  }

  const currentUploads = uploads[activeTab] || [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Media Library</h1>
          <p className="text-gray-600 mt-2">Manage your uploaded content</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <Card.Body className="p-6 text-center">
              <MusicalNoteIcon className="w-12 h-12 text-purple-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-gray-900">{uploads.music.length}</div>
              <div className="text-gray-600">Music Tracks</div>
            </Card.Body>
          </Card>
          
          <Card>
            <Card.Body className="p-6 text-center">
              <PhotoIcon className="w-12 h-12 text-blue-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-gray-900">{uploads.images.length}</div>
              <div className="text-gray-600">Images</div>
            </Card.Body>
          </Card>
          
          <Card>
            <Card.Body className="p-6 text-center">
              <VideoCameraIcon className="w-12 h-12 text-red-600 mx-auto mb-2" />
              <div className="text-2xl font-bold text-gray-900">{uploads.videos.length}</div>
              <div className="text-gray-600">Videos</div>
            </Card.Body>
          </Card>
        </div>

        {/* Tabs and Upload Button */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex space-x-2">
            <TabButton
              tab="music"
              icon={MusicalNoteIcon}
              label="Music"
              count={uploads.music.length}
            />
            <TabButton
              tab="images"
              icon={PhotoIcon}
              label="Images"
              count={uploads.images.length}
            />
            <TabButton
              tab="videos"
              icon={VideoCameraIcon}
              label="Videos"
              count={uploads.videos.length}
            />
          </div>
          
          <Button
            onClick={() => {
              setUploadType(activeTab);
              setUploadModalOpen(true);
            }}
            className="flex items-center"
          >
            <CloudArrowUpIcon className="w-5 h-5 mr-2" />
            Upload {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
          </Button>
        </div>

        {/* Content Grid */}
        {currentUploads.length > 0 ? (
          <div className="grid gap-4">
            {currentUploads.map((item, index) => (
              <MediaCard key={index} item={item} type={activeTab} />
            ))}
          </div>
        ) : (
          <Card>
            <Card.Body className="text-center py-12">
              <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                {activeTab === 'music' && <MusicalNoteIcon className="w-10 h-10 text-gray-400" />}
                {activeTab === 'images' && <PhotoIcon className="w-10 h-10 text-gray-400" />}
                {activeTab === 'videos' && <VideoCameraIcon className="w-10 h-10 text-gray-400" />}
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                No {activeTab} uploaded yet
              </h3>
              <p className="text-gray-600 mb-6">
                Start by uploading your first {activeTab === 'images' ? 'image' : activeTab.slice(0, -1)}
              </p>
              <Button
                onClick={() => {
                  setUploadType(activeTab);
                  setUploadModalOpen(true);
                }}
                className="flex items-center mx-auto"
              >
                <CloudArrowUpIcon className="w-5 h-5 mr-2" />
                Upload {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
              </Button>
            </Card.Body>
          </Card>
        )}
      </div>

      {/* Upload Modal */}
      <MediaUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        type={uploadType}
        onUploadSuccess={() => {
          loadUploads();
          setUploadModalOpen(false);
        }}
      />
    </div>
  );
};

export default MediaLibrary;