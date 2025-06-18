#!/bin/bash

# MusicConnect Backup Script
# Creates a clean backup of the project excluding node_modules and other build artifacts

BACKUP_DIR="$HOME/Desktop/MusicConnect-Backup-$(date +%Y%m%d-%H%M%S)"
PROJECT_DIR="/Users/sho/Code/Claude-Code/MusicConnect"

echo "🎵 Creating MusicConnect backup..."
echo "📂 Source: $PROJECT_DIR"
echo "💾 Destination: $BACKUP_DIR"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Copy project files (excluding node_modules, build files, etc.)
rsync -av \
  --exclude='node_modules' \
  --exclude='build' \
  --exclude='dist' \
  --exclude='.git' \
  --exclude='npm-debug.log*' \
  --exclude='yarn-debug.log*' \
  --exclude='yarn-error.log*' \
  --exclude='.DS_Store' \
  --exclude='*.log' \
  --exclude='.env.local' \
  --exclude='.env.development.local' \
  --exclude='.env.test.local' \
  --exclude='.env.production.local' \
  "$PROJECT_DIR/" "$BACKUP_DIR/"

# Create a summary file
cat > "$BACKUP_DIR/BACKUP_INFO.txt" << EOF
MusicConnect Project Backup
===========================

Backup Date: $(date)
Source Path: $PROJECT_DIR
Backup Path: $BACKUP_DIR

Project Structure:
------------------
$(find "$BACKUP_DIR" -type f -name "*.js" -o -name "*.json" -o -name "*.md" | sort)

Quick Start Commands:
--------------------
1. cd $BACKUP_DIR
2. Install dependencies:
   - cd backend && npm install
   - cd ../frontend && npm install
3. Start servers:
   - Backend: cd backend && PORT=5001 node server.js
   - Frontend: cd frontend && npm start
4. Access: http://localhost:3000

Demo Accounts:
--------------
Artist: artist@demo.com / password123
Fan: fan@demo.com / password123

Git Status:
-----------
$(cd "$PROJECT_DIR" && git log --oneline -n 5 2>/dev/null || echo "Git history not available")
EOF

# Create compressed archive
cd "$HOME/Desktop"
ARCHIVE_NAME="MusicConnect-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$ARCHIVE_NAME" "$(basename "$BACKUP_DIR")"

echo "✅ Backup completed!"
echo "📁 Folder: $BACKUP_DIR"
echo "📦 Archive: $HOME/Desktop/$ARCHIVE_NAME"
echo ""
echo "To restore:"
echo "1. Extract archive to desired location"
echo "2. Run 'cd backend && npm install'"
echo "3. Run 'cd frontend && npm install'"
echo "4. Follow PROJECT_SETUP.md instructions"

