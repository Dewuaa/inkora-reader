# Quick Start Guide

## ⚡ Quick Start (Easiest Method)

### Windows PowerShell:
```powershell
.\start-dev.ps1
```

This script will:
1. Install dependencies (if needed)
2. Start the API server on port 3000
3. Start the web app on port 3001
4. Monitor both servers

## 🔧 Manual Start (Alternative)

### Terminal 1 - API Server:
```bash
npm install    # First time only
npm start
```

### Terminal 2 - Web App:
```bash
cd anime-web-app
npm install    # First time only
npm run dev
```

## 🌐 Access

- **Web App**: http://localhost:3001
- **API**: http://localhost:3000

## 📝 Environment Variables

### Backend (root directory)
Create `.env` file:
```env
PORT=3000
NODE_ENV=development
```

### Frontend (anime-web-app directory)
Already created as `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

## 🎯 Usage

1. Open http://localhost:3001 in your browser
2. Browse trending anime on homepage
3. Click any anime to see episodes
4. Click an episode to watch

## ❓ Troubleshooting

### Videos not loading?
1. Make sure API is running (http://localhost:3000)
2. Check browser console (F12) for errors
3. Try switching providers (dropdown in navbar)

### Port already in use?
```bash
# Find and kill process on port 3000
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process

# Or change PORT in .env file
```

### Dependencies issues?
```bash
# Root directory
rm -rf node_modules package-lock.json
npm install

# Web app
cd anime-web-app
rm -rf node_modules package-lock.json
npm install
```

## 📚 Full Documentation

See [SETUP.md](anime-web-app/SETUP.md) for complete documentation.

## 🚀 Features

- Browse trending anime
- Search functionality  
- Multiple provider support (HiAnime, AnimePahe)
- HLS video streaming
- Responsive design
- Episode tracking

## ⚠️ Important Notes

1. **Both servers must run** - API (3000) and Web App (3001)
2. **API first** - Start API before Web App
3. **Legal disclaimer** - For educational purposes only

Enjoy watching anime! 🎌
