import React, { useState } from 'react';
import { XIcon } from '@heroicons/react/outline';
import Upload from './Upload';
import uploadService from '../services/uploadService';

const MediaUploadModal = ({ isOpen, onClose, type = 'music', onUploadSuccess }) => {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [metadata, setMetadata] = useState({
    title: '',
    description: '',
    tier: 'free',
    genre: 'Other'
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleUploadComplete = (files) => {
    setUploadedFiles(files);
    if (files.length > 0 && !metadata.title) {
      setMetadata(prev => ({
        ...prev,
        title: files[0].originalName.replace(/\.[^/.]+$/, '')
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (uploadedFiles.length === 0) return;

    setIsSubmitting(true);
    try {
      // Files are already uploaded, just need to update metadata
      // In a real app, you might update the metadata on the server here
      
      if (onUploadSuccess) {
        onUploadSuccess(uploadedFiles);
      }
      
      // Reset form
      setUploadedFiles([]);
      setMetadata({
        title: '',
        description: '',
        tier: 'free',
        genre: 'Other'
      });
      onClose();
    } catch (error) {
      console.error('Error saving upload:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const tierOptions = [
    { value: 'free', label: 'Free - Available to all fans' },
    { value: 'supporter', label: 'Supporter - $5/month fans only' },
    { value: 'superfan', label: 'Super Fan - $15/month fans only' }
  ];

  const genreOptions = [
    'Electronic', 'Rock', 'Pop', 'Hip Hop', 'R&B', 
    'Country', 'Jazz', 'Classical', 'Indie', 'Other'
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">
              Upload {type.charAt(0).toUpperCase() + type.slice(1)}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <XIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Upload area */}
          {uploadedFiles.length === 0 && (
            <Upload
              type={type}
              onUploadComplete={handleUploadComplete}
              multiple={false}
            />
          )}

          {/* Uploaded file preview */}
          {uploadedFiles.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Uploaded File</h3>
              {uploadedFiles.map((file, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-blue-600 font-bold text-sm">
                      {type === 'music' && '🎵'}
                      {type === 'image' && '🖼️'}
                      {type === 'video' && '🎬'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{file.originalName}</p>
                    <p className="text-xs text-gray-500">
                      {uploadService.formatFileSize(file.size)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Metadata form */}
          {uploadedFiles.length > 0 && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Title *
                </label>
                <input
                  type="text"
                  value={metadata.title}
                  onChange={(e) => setMetadata(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={`Enter ${type} title`}
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={metadata.description}
                  onChange={(e) => setMetadata(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder="Add a description..."
                />
              </div>

              {/* Genre selector for music */}
              {type === 'music' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Genre
                  </label>
                  <select
                    value={metadata.genre}
                    onChange={(e) => setMetadata(prev => ({ ...prev, genre: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {genreOptions.map(genre => (
                      <option key={genre} value={genre}>{genre}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Tier selector for music and video */}
              {(type === 'music' || type === 'video') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Access Tier
                  </label>
                  <select
                    value={metadata.tier}
                    onChange={(e) => setMetadata(prev => ({ ...prev, tier: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {tierOptions.map(tier => (
                      <option key={tier.value} value={tier.value}>
                        {tier.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Choose who can access this content based on their subscription tier
                  </p>
                </div>
              )}

              {/* Image type selector */}
              {type === 'image' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Image Type
                  </label>
                  <select
                    value={metadata.imageType || 'general'}
                    onChange={(e) => setMetadata(prev => ({ ...prev, imageType: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="profile">Profile Picture</option>
                    <option value="cover">Cover Photo</option>
                    <option value="gallery">Gallery Image</option>
                    <option value="general">General</option>
                  </select>
                </div>
              )}
            </>
          )}

          {/* Action buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploadedFiles.length === 0 || !metadata.title || isSubmitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving...' : 'Save & Publish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MediaUploadModal;