import React, { useCallback, useState } from 'react';
import { CloudUploadIcon, XIcon } from '@heroicons/react/outline';
import { PhotographIcon, MusicNoteIcon, VideoCameraIcon } from '@heroicons/react/solid';
import uploadService from '../services/uploadService';

const Upload = ({ 
  type = 'music', 
  onUploadComplete, 
  multiple = false,
  className = '' 
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const [errors, setErrors] = useState([]);

  const getAcceptedTypes = () => {
    const types = {
      music: '.mp3,.wav,.flac,.m4a',
      image: '.jpg,.jpeg,.png,.webp',
      video: '.mp4,.mov,.avi,.webm'
    };
    return types[type] || '';
  };

  const getIcon = () => {
    const icons = {
      music: <MusicNoteIcon className="w-12 h-12 text-gray-400" />,
      image: <PhotographIcon className="w-12 h-12 text-gray-400" />,
      video: <VideoCameraIcon className="w-12 h-12 text-gray-400" />
    };
    return icons[type];
  };

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFiles(droppedFiles);
  }, []);

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    handleFiles(selectedFiles);
  };

  const handleFiles = (newFiles) => {
    const validatedFiles = [];
    const newErrors = [];

    newFiles.forEach(file => {
      const validation = uploadService.validateFile(file, type);
      if (validation.valid) {
        validatedFiles.push(file);
      } else {
        newErrors.push(`${file.name}: ${validation.error}`);
      }
    });

    setErrors(newErrors);
    if (validatedFiles.length > 0) {
      setFiles(multiple ? [...files, ...validatedFiles] : validatedFiles);
    }
  };

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
    const newProgress = { ...uploadProgress };
    delete newProgress[index];
    setUploadProgress(newProgress);
  };

  const uploadFiles = async () => {
    if (files.length === 0) return;

    setErrors([]);
    const progressTracking = {};

    try {
      const results = await Promise.all(
        files.map(async (file, index) => {
          try {
            const result = await uploadService.uploadFile(
              file,
              type,
              {},
              (progress) => {
                progressTracking[index] = progress;
                setUploadProgress({ ...progressTracking });
              }
            );
            return { success: true, file: result.file };
          } catch (error) {
            return { success: false, error: error.message, filename: file.name };
          }
        })
      );

      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      if (failed.length > 0) {
        setErrors(failed.map(f => `${f.filename}: ${f.error}`));
      }

      if (successful.length > 0 && onUploadComplete) {
        onUploadComplete(successful.map(s => s.file));
      }

      // Clear successful files
      if (successful.length > 0) {
        setTimeout(() => {
          setFiles([]);
          setUploadProgress({});
        }, 1000);
      }
    } catch (error) {
      setErrors([error.message]);
    }
  };

  return (
    <div className={`upload-container ${className}`}>
      <div
        className={`
          border-2 border-dashed rounded-lg p-6 text-center
          ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'}
          transition-colors duration-200 cursor-pointer
        `}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById(`file-input-${type}`).click()}
      >
        <input
          id={`file-input-${type}`}
          type="file"
          accept={getAcceptedTypes()}
          multiple={multiple}
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="space-y-4">
          {getIcon()}
          
          <div>
            <p className="text-lg font-medium text-gray-900">
              Drop {type} files here or click to browse
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {type === 'music' && 'MP3, WAV, FLAC, M4A up to 50MB'}
              {type === 'image' && 'JPG, PNG, WebP up to 10MB'}
              {type === 'video' && 'MP4, MOV, AVI, WebM up to 200MB'}
            </p>
          </div>

          <CloudUploadIcon className="w-8 h-8 mx-auto text-gray-400" />
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="mt-4 space-y-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="flex items-center justify-between bg-white p-3 rounded-lg shadow-sm border"
            >
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  {type === 'music' && <MusicNoteIcon className="w-6 h-6 text-gray-600" />}
                  {type === 'image' && <PhotographIcon className="w-6 h-6 text-gray-600" />}
                  {type === 'video' && <VideoCameraIcon className="w-6 h-6 text-gray-600" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">
                    {uploadService.formatFileSize(file.size)}
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {uploadProgress[index] !== undefined && (
                  <div className="w-32">
                    <div className="bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress[index]}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1 text-center">
                      {uploadProgress[index]}%
                    </p>
                  </div>
                )}
                
                {!uploadProgress[index] && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(index);
                    }}
                    className="text-red-500 hover:text-red-700 transition-colors"
                  >
                    <XIcon className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm font-medium text-red-800 mb-1">Upload Errors:</p>
          {errors.map((error, index) => (
            <p key={index} className="text-xs text-red-600">{error}</p>
          ))}
        </div>
      )}

      {/* Upload button */}
      {files.length > 0 && Object.keys(uploadProgress).length === 0 && (
        <button
          onClick={uploadFiles}
          className="mt-4 w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Upload {files.length} {type} file{files.length > 1 ? 's' : ''}
        </button>
      )}
    </div>
  );
};

export default Upload;