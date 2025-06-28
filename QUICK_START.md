# Music Connect MVP - Quick Start Guide

## 🚀 Start the Application

### Option 1: Using the Start Script (Recommended)
```bash
cd /Users/sho/Code/Claude-Code/MusicConnect
./start-servers.sh
```

### Option 2: Manual Start
```bash
# Terminal 1 - Backend
cd /Users/sho/Code/Claude-Code/MusicConnect/backend
npm start

# Terminal 2 - Frontend  
cd /Users/sho/Code/Claude-Code/MusicConnect/frontend
npm start
```

## 🌐 Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **API Health Check**: http://localhost:5000/api/health

## 🔑 Test Account

- **Email**: artist@demo.com
- **Password**: password123
- **Type**: Artist (can upload content)

## 📸 Test File Upload

1. Login with the test account
2. Go to Artist Dashboard
3. Click "Upload Content" or use the quick action buttons
4. Upload music, images, or videos
5. View uploads in the Media Library

## 🧪 Run Automated Tests

```bash
cd /Users/sho/Code/Claude-Code/MusicConnect
node test-upload.js
```

## 📱 Key Features

- **File Upload**: Drag-and-drop support for music, images, and videos
- **Media Library**: Manage all uploaded content
- **Access Tiers**: Control who can access content (Free/Supporter/Super Fan)
- **Artist Dashboard**: View stats and manage content
- **Fan Discovery**: Browse and discover new artists

## 🛠️ Troubleshooting

If servers don't start:
1. Check if ports 3000 and 5000 are free
2. Run `npm install` in both backend and frontend directories
3. Check console for error messages

## 📚 Documentation

- [File Upload Testing Guide](FILE_UPLOAD_TESTING.md)
- [Project Setup](PROJECT_SETUP.md)
- [Project Notebook](MusicConnect_Project_Notebook.md)