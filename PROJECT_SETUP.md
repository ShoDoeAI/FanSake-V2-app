# 🔧 MusicConnect - Project Setup Guide

## 📍 Project Location
```
/Users/sho/Code/Claude-Code/MusicConnect/
```

## 🚀 Quick Start Commands

### Start Both Servers (Recommended)
```bash
# Terminal 1 - Backend
cd /Users/sho/Code/Claude-Code/MusicConnect/backend
PORT=5001 node server.js

# Terminal 2 - Frontend  
cd /Users/sho/Code/Claude-Code/MusicConnect/frontend
npm start
```

### Single Command Setup
```bash
cd /Users/sho/Code/Claude-Code/MusicConnect

# Start backend in background
cd backend && PORT=5001 node server.js &

# Start frontend
cd ../frontend && npm start
```

## 🌐 Access URLs
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5001
- **API Health Check:** http://localhost:5001/api/health

## 🔐 Demo Login Credentials

### Artist Account
```
Email: artist@demo.com
Password: password123
```
- Redirects to: `/artist-dashboard`
- Features: Analytics, Revenue ($487), Content Management

### Fan Account  
```
Email: fan@demo.com
Password: password123
```
- Redirects to: `/discovery` 
- Features: Music Discovery, Fan Dashboard, Community

## 📂 Project Structure

```
MusicConnect/
├── README.md                    # Main documentation
├── PROJECT_SETUP.md            # This setup guide
├── .gitignore                   # Git ignore rules
│
├── frontend/                    # React Application
│   ├── src/
│   │   ├── components/ui/       # Reusable UI components
│   │   ├── pages/              # Main application pages
│   │   ├── contexts/           # React contexts (Auth)
│   │   ├── services/api.js     # API communication
│   │   └── App.js              # Main app component
│   ├── package.json            # Frontend dependencies
│   └── .env                    # Frontend environment vars
│
├── backend/                     # Node.js API Server
│   ├── routes/                 # API endpoints
│   │   ├── auth.js             # Authentication routes
│   │   ├── artists.js          # Artist-related routes
│   │   ├── discovery.js        # Discovery/trending routes
│   │   └── community.js        # Community feed routes
│   ├── models/                 # Data models
│   │   ├── MockUser.js         # Mock user data (current)
│   │   └── User.js             # MongoDB user schema
│   ├── middleware/auth.js      # Authentication middleware
│   ├── server.js               # Express server
│   ├── package.json            # Backend dependencies
│   └── .env                    # Backend environment vars
│
└── shared/types.js             # Shared constants and types
```

## ⚙️ Environment Configuration

### Backend (.env)
```env
PORT=5001
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/musicconnect
JWT_SECRET=super_secret_jwt_key_for_development
FRONTEND_URL=http://localhost:3000
MAX_REQUESTS_PER_MINUTE=100
```

### Frontend (.env)
```env
REACT_APP_API_URL=http://localhost:5001/api
```

## 🧪 Testing the Application

### 1. Authentication Test
```bash
# Test login API
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "fan@demo.com", "password": "password123"}'
```

### 2. Health Check
```bash
curl http://localhost:5001/api/health
```

### 3. Frontend Features to Test
- [ ] Login with both demo accounts
- [ ] Artist dashboard analytics
- [ ] Discovery page content browsing
- [ ] Community feed interactions
- [ ] Fan tier system
- [ ] Navigation between pages

## 🔄 Development Workflow

### Installing Dependencies
```bash
# Backend
cd backend && npm install

# Frontend  
cd frontend && npm install
```

### Running in Development Mode
```bash
# Backend with auto-restart
cd backend && npm run dev

# Frontend with hot reload
cd frontend && npm start
```

### Building for Production
```bash
# Frontend build
cd frontend && npm run build

# Backend is production ready as-is
```

## 🐛 Troubleshooting

### Port Conflicts
```bash
# Kill processes on ports 3000/5001
lsof -ti:3000,5001 | xargs kill -9

# Check what's running on ports
lsof -i :3000
lsof -i :5001
```

### Missing Dependencies
```bash
# Clear and reinstall
cd frontend && rm -rf node_modules package-lock.json && npm install
cd backend && rm -rf node_modules package-lock.json && npm install
```

### Database Issues (Future)
Currently using mock data. To connect real MongoDB:
1. Uncomment MongoDB connection in `backend/server.js`
2. Update User model imports in routes
3. Set up MongoDB locally or use MongoDB Atlas

## 📈 Current Implementation Status

### ✅ Completed Features
- [x] User authentication (JWT)
- [x] Artist & Fan dashboards
- [x] Music discovery with filtering
- [x] Community social feed
- [x] Fan tier monetization system
- [x] Responsive design
- [x] Mock data for demo

### 🚧 Future Enhancements
- [ ] Real MongoDB integration
- [ ] File upload for music/images
- [ ] Payment processing for fan tiers
- [ ] Real-time notifications
- [ ] Advanced search and recommendations
- [ ] Email verification
- [ ] Password reset functionality

## 💾 Git Commands for This Project

```bash
# Check status
git status

# View commit history
git log --oneline

# Create new branch for features
git checkout -b feature-name

# Commit changes
git add .
git commit -m "Description of changes"
```

## 🔗 Useful Development URLs

- **React DevTools:** Available in Chrome/Firefox
- **API Documentation:** Check routes in `backend/routes/` folders
- **Database Admin:** MongoDB Compass (when using real DB)
- **Error Logs:** Check browser console and terminal output

---

**Last Updated:** 2025-06-18
**Version:** MVP v1.0
**Status:** Fully Functional Demo

