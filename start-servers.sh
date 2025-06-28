#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Music Connect Servers...${NC}\n"

# Function to check if a port is in use
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null ; then
        echo -e "${RED}Port $1 is already in use. Please stop the existing process.${NC}"
        return 1
    fi
    return 0
}

# Check if ports are available
echo "Checking ports..."
if ! check_port 5000; then
    echo "Backend port 5000 is occupied"
    exit 1
fi
if ! check_port 3000; then
    echo "Frontend port 3000 is occupied"
    exit 1
fi

echo -e "${GREEN}Ports are available!${NC}\n"

# Start backend
echo -e "${YELLOW}Starting backend server...${NC}"
cd backend
npm start &
BACKEND_PID=$!
echo "Backend server starting with PID: $BACKEND_PID"

# Wait for backend to start
echo "Waiting for backend to start..."
sleep 3

# Start frontend
echo -e "\n${YELLOW}Starting frontend server...${NC}"
cd ../frontend
npm start &
FRONTEND_PID=$!
echo "Frontend server starting with PID: $FRONTEND_PID"

echo -e "\n${GREEN}Both servers are starting!${NC}"
echo -e "${YELLOW}Backend:${NC} http://localhost:5000"
echo -e "${YELLOW}Frontend:${NC} http://localhost:3000"
echo -e "\n${YELLOW}Login credentials:${NC}"
echo "Email: artist@demo.com"
echo "Password: password123"
echo -e "\nPress Ctrl+C to stop both servers"

# Function to handle script termination
cleanup() {
    echo -e "\n${YELLOW}Stopping servers...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    echo -e "${GREEN}Servers stopped.${NC}"
    exit 0
}

# Set up trap to catch Ctrl+C
trap cleanup INT

# Keep script running
wait