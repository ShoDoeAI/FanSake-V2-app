#!/bin/bash

echo "🚀 MusicConnect Deployment Script"
echo "================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo -e "${YELLOW}Railway CLI not found. Installing...${NC}"
    npm install -g @railway/cli
fi

# Check if in correct directory
if [ ! -f "backend/server.js" ]; then
    echo -e "${RED}Error: Not in MusicConnect root directory${NC}"
    echo "Please run this script from the MusicConnect folder"
    exit 1
fi

echo -e "${BLUE}Step 1: Preparing backend for deployment${NC}"
cd backend

# Create production package.json if needed
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: backend/package.json not found${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Backend prepared${NC}"

echo -e "\n${BLUE}Step 2: Creating Railway project${NC}"
echo "Please follow these steps:"
echo ""
echo -e "${YELLOW}1. Run: railway login${NC}"
echo "   (This will open your browser to log in)"
echo ""
echo -e "${YELLOW}2. Run: railway init${NC}"
echo "   - Choose 'Empty Project'"
echo "   - Give it a name like 'musicconnect-backend'"
echo ""
echo -e "${YELLOW}3. Run: railway add${NC}"
echo "   - Select 'MongoDB' from the list"
echo "   - This adds a database to your project"
echo ""
echo -e "${YELLOW}4. Run: railway up${NC}"
echo "   - This deploys your backend"
echo ""
echo -e "${YELLOW}5. Run: railway open${NC}"
echo "   - Opens your project dashboard"
echo ""

echo -e "${BLUE}Environment Variables to set in Railway:${NC}"
echo "JWT_SECRET=your-super-secret-jwt-key-$(openssl rand -hex 32)"
echo "NODE_ENV=production"
echo "PORT=5001"
echo ""

echo -e "${BLUE}For the frontend (in a new terminal):${NC}"
echo "1. cd frontend"
echo "2. Create .env.production with:"
echo "   REACT_APP_API_URL=https://your-backend.railway.app"
echo "3. Deploy to Vercel:"
echo "   - npm i -g vercel"
echo "   - vercel"
echo ""

echo -e "${GREEN}Ready to deploy! Follow the steps above.${NC}"

# Go back to root
cd ..

echo -e "\n${BLUE}Quick Commands Reference:${NC}"
echo "railway login        # Login to Railway"
echo "railway init         # Create new project"
echo "railway add          # Add MongoDB"
echo "railway up           # Deploy backend"
echo "railway logs         # View logs"
echo "railway open         # Open dashboard"