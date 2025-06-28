#!/bin/bash

echo "🎵 Setting up GitHub for MusicConnect MVP"
echo "========================================"

# Initialize git
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit: MusicConnect MVP - Fan Discovery Platform

- Artist and fan authentication system
- File upload for music, images, and videos
- Artist dashboard with analytics
- Fan discovery features
- Subscription tiers (Free, Supporter, Super Fan)
- Real-time content streaming
- Responsive UI with Tailwind CSS"

echo ""
echo "✅ Git initialized and committed!"
echo ""
echo "Next steps:"
echo "1. Create a new repo on GitHub called: musicconnect-mvp"
echo "2. Run these commands:"
echo ""
echo "git remote add origin https://github.com/ShoDoeAI/musicconnect-mvp.git"
echo "git branch -M main"
echo "git push -u origin main"
echo ""
echo "Your MusicConnect MVP will then be on GitHub!"