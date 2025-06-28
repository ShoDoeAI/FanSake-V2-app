# MusicConnect Login Fix Instructions

## The Issue
- Frontend is running on http://localhost:3000
- Backend needs to run on port 5001 (port 5000 is occupied by AirTunes)
- Demo accounts are now properly configured in the MockUser model

## Step 1: Start the Backend Server

Open a new terminal and run:
```bash
cd /Users/sho/Code/Claude-Code/MusicConnect/backend
NODE_ENV=development JWT_SECRET=your_secret_key PORT=5001 npm start
```

You should see:
```
🚀 Music Discovery MVP API server running on port 5001
Environment: development
MongoDB connection mocked for testing purposes
```

## Step 2: Verify Backend is Running

Test the health endpoint:
```bash
curl http://localhost:5001/api/health
```

Should return:
```json
{"status":"OK","message":"Music Discovery MVP API is running","timestamp":"..."}
```

## Step 3: Test Login Endpoint

```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"artist@demo.com","password":"password123"}'
```

## Step 4: Frontend is Already Running

The frontend at http://localhost:3000 is already configured to use port 5001.

## Step 5: Login Credentials

**Artist Account:**
- Email: `artist@demo.com`
- Password: `password123`
- Redirects to: Artist Dashboard

**Fan Account:**
- Email: `fan@demo.com` 
- Password: `password123`
- Redirects to: Discovery page

## What Was Fixed

1. **Port Configuration**: Changed from 5000 to 5001 to avoid AirTunes conflict
2. **Demo Accounts**: Added directly to MockUser model initialization
3. **API Endpoints**: Updated frontend to connect to port 5001
4. **Authentication**: Fixed MockUser methods for proper auth flow

## Troubleshooting

If login still doesn't work:

1. **Check Console**: Open browser DevTools (F12) and check Console tab for errors
2. **Check Network**: In DevTools Network tab, verify the login request goes to `http://localhost:5001/api/auth/login`
3. **CORS Issues**: The backend is configured to accept requests from `http://localhost:3000`
4. **Clear Storage**: In DevTools Application tab, clear Local Storage and try again

## Quick Test Script

Save this as `test-backend.sh`:
```bash
#!/bin/bash
echo "Testing MusicConnect Backend..."
echo "1. Health Check:"
curl http://localhost:5001/api/health
echo -e "\n\n2. Login Test:"
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"artist@demo.com","password":"password123"}'
```