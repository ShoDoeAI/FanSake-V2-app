# 🎵 Music Discovery MVP

A full-stack social platform for independent artists and fan communities, featuring music discovery, fan monetization, and community engagement.

## 🚀 Features

### 🎤 For Artists
- **Artist Dashboard** with real-time analytics
- Performance metrics (followers, views, engagement)
- Revenue tracking and monetization
- Content management and upload
- Fan tier analysis and growth tracking
- Exclusive content for different fan tiers

### 🎧 For Fans
- **Music Discovery** with trending content
- Genre-based filtering and search
- **Fan Tier System** (Casual → Supporter → Super Fan)
- Exclusive content access based on tier
- **Community Feed** with social interactions
- Following artists and getting personalized recommendations

### 🌟 Community Features
- Real-time social feed with likes, shares, comments
- Trending genres and content
- Community stats and engagement metrics
- User activity tracking
- Content interaction analytics

### 💰 Monetization
- **Fan Tier Subscriptions** with benefits
- Exclusive content for paid tiers
- Artist revenue tracking
- Super Fan benefits and perks

## 🛠 Tech Stack

### Frontend
- **React 18** with modern hooks
- **React Router** for navigation
- **Tailwind CSS** for styling
- **Heroicons** for icons
- **Axios** for API communication

### Backend
- **Node.js** with Express
- **JWT** authentication
- **Bcrypt** for password hashing
- **Joi** for validation
- **CORS** and **Helmet** for security
- **Rate limiting** for API protection

### Database
- **MongoDB** with Mongoose (currently mocked for demo)
- User schemas for Artists and Fans
- Content and interaction tracking

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd music-discovery-mvp
   ```

2. **Install Backend Dependencies**
   ```bash
   cd backend
   npm install
   ```

3. **Install Frontend Dependencies**
   ```bash
   cd ../frontend
   npm install
   ```

4. **Start the Backend Server**
   ```bash
   cd ../backend
   PORT=5001 node server.js
   ```

5. **Start the Frontend Server**
   ```bash
   cd ../frontend
   npm start
   ```

6. **Access the Application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5001

## 🔐 Demo Accounts

### Artist Account
- **Email:** `artist@demo.com`
- **Password:** `password123`
- **Features:** Artist Dashboard, Analytics, Revenue Tracking

### Fan Account
- **Email:** `fan@demo.com`
- **Password:** `password123`
- **Features:** Discovery Feed, Fan Dashboard, Community Access

## 📁 Project Structure

```
music-discovery-mvp/
├── frontend/                 # React frontend application
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── contexts/        # React contexts (Auth)
│   │   ├── pages/          # Page components
│   │   ├── services/       # API services
│   │   └── App.js          # Main app component
│   ├── public/             # Static assets
│   └── package.json        # Frontend dependencies
├── backend/                 # Node.js backend API
│   ├── routes/             # API route handlers
│   ├── models/             # Data models
│   ├── middleware/         # Custom middleware
│   └── server.js           # Express server
├── shared/                 # Shared types and constants
└── README.md              # Project documentation
```

## 🌟 Key Features Walkthrough

### Artist Experience
1. **Login** with artist account
2. **Dashboard** shows:
   - 1,247 followers (+23% growth)
   - 89,435 total views
   - $487 monthly revenue
   - Content performance metrics
   - Fan tier breakdown

### Fan Experience
1. **Login** with fan account
2. **Discovery** features:
   - Trending music from various artists
   - Genre filtering (Electronic, Indie, Rock, etc.)
   - Like, share, and view interactions
3. **Fan Dashboard** shows:
   - Following 8 artists
   - 234 liked songs
   - Fan tier with upgrade options

### Community Features
- **Social Feed** with 2,847 active users
- Content engagement metrics
- Trending genres leaderboard
- Real-time interactions

## 🔧 Development

### Frontend Development
```bash
cd frontend
npm start          # Start development server
npm run build      # Build for production
npm test           # Run tests
```

### Backend Development
```bash
cd backend
npm start          # Start production server
npm run dev        # Start with nodemon (development)
```

### Environment Variables

#### Backend (.env)
```
PORT=5001
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/music_discovery_mvp
JWT_SECRET=your_jwt_secret_here
FRONTEND_URL=http://localhost:3000
MAX_REQUESTS_PER_MINUTE=100
```

#### Frontend (.env)
```
REACT_APP_API_URL=http://localhost:5001/api
```

## 🚀 Deployment

### Frontend (Vercel/Netlify)
1. Build the frontend: `npm run build`
2. Deploy the `build` folder
3. Set environment variable: `REACT_APP_API_URL`

### Backend (Heroku/Railway)
1. Set up MongoDB Atlas or similar
2. Configure environment variables
3. Deploy the backend folder

## 🔄 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/verify` - Verify JWT token
- `POST /api/auth/refresh` - Refresh token

### Artists
- `GET /api/artists` - Get all artists
- `GET /api/artists/:id` - Get artist profile
- `GET /api/artists/dashboard/stats` - Artist dashboard data

### Discovery
- `GET /api/discovery/trending` - Trending content
- `GET /api/discovery/recommendations` - Personalized recommendations
- `GET /api/discovery/search` - Search content

### Community
- `GET /api/community/feed` - Community feed
- `POST /api/community/content/:id/like` - Like content
- `POST /api/community/content/:id/share` - Share content

## 🎨 Design System

### Colors
- **Primary:** Purple (#7C3AED)
- **Secondary:** Pink (#EC4899)
- **Accent:** Blue (#3B82F6)
- **Success:** Green (#10B981)
- **Warning:** Yellow (#F59E0B)
- **Error:** Red (#EF4444)

### Typography
- **Font Family:** Inter, system fonts
- **Headings:** Bold weights
- **Body:** Regular weight
- **Small text:** Medium weight

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License.

## 🙋‍♂️ Support

For questions or support, please create an issue in the repository.

---

**Built with ❤️ for the independent music community**

