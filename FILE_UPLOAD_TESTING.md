# Music Connect File Upload Testing Guide

## Overview
The file upload system has been fully implemented for Music Connect MVP. Artists can upload music, images, and videos through the platform.

## Features Implemented

### Backend
- **Multer middleware** for handling file uploads
- **File type validation** (audio, image, video formats)
- **File size limits**:
  - Music: 50MB max
  - Images: 10MB max  
  - Videos: 200MB max
- **Upload routes** for music, images, and videos
- **In-memory storage** for demo (ready for MongoDB integration)
- **Authentication** required for uploads

### Frontend
- **Drag-and-drop upload component**
- **File validation** before upload
- **Progress tracking** during upload
- **Upload modal** with metadata input
- **Media library page** for managing uploads
- **Integration** with artist dashboard

## Testing Instructions

### 1. Start the Backend Server
```bash
cd backend
npm install  # If not already done
npm start
```
The server will run on http://localhost:5000

### 2. Start the Frontend
```bash
cd frontend
npm install  # If not already done
npm start
```
The frontend will run on http://localhost:3000

### 3. Run Automated Tests
```bash
cd /Users/sho/Code/Claude-Code/MusicConnect
node test-upload.js
```

This test script will:
- Login as demo artist
- Upload test files for music, images, and videos
- Verify uploads are stored correctly
- Fetch and display uploaded content

### 4. Manual Testing via UI

1. **Login as Artist**
   - Email: `artist@demo.com`
   - Password: `password123`

2. **Upload Content**
   - Go to Artist Dashboard
   - Click any of the upload buttons (Music/Images/Videos)
   - Drag and drop or select files
   - Fill in metadata (title, description, tier)
   - Click "Save & Publish"

3. **View Uploads**
   - Check the Recent Content section on dashboard
   - Visit the Media Library page to see all uploads
   - Test delete functionality

## File Structure

### Backend Files Created/Modified:
- `/backend/middleware/upload.js` - Multer configuration
- `/backend/routes/uploads.js` - Upload API endpoints
- `/backend/models/Artist.js` - Artist schema with uploads
- `/backend/server.js` - Added upload routes

### Frontend Files Created/Modified:
- `/frontend/src/services/uploadService.js` - Upload service
- `/frontend/src/components/Upload.js` - Drag-drop component
- `/frontend/src/components/MediaUploadModal.js` - Upload modal
- `/frontend/src/pages/MediaLibrary.js` - Media management page
- `/frontend/src/pages/ArtistDashboard.js` - Added upload integration

## API Endpoints

- `POST /api/uploads/music` - Upload music file
- `POST /api/uploads/image` - Upload image file
- `POST /api/uploads/video` - Upload video file
- `GET /api/uploads/my-uploads` - Get user's uploads
- `GET /api/uploads/:type/:filename` - Access uploaded file
- `DELETE /api/uploads/:type/:filename` - Delete uploaded file

## Next Steps

1. **Database Integration**: Connect MongoDB to persist uploads
2. **Cloud Storage**: Integrate AWS S3 or similar for file storage
3. **Audio/Video Processing**: Add waveform generation, thumbnails
4. **Streaming**: Implement progressive streaming for media playback
5. **CDN Integration**: Serve files through CDN for performance

## Troubleshooting

- **Uploads fail**: Check file size and format restrictions
- **Server not running**: Ensure backend is running on port 5000
- **CORS errors**: Frontend must run on http://localhost:3000
- **Auth errors**: Login first or check token expiration