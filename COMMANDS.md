# 🎯 Common Commands & Quick Reference

## 🚀 Starting the Servers

### Method 1: PowerShell Script (Easiest)
```powershell
.\start-dev.ps1
```

### Method 2: Manual (Two Terminals)
```powershell
# Terminal 1 - API Server
npm start

# Terminal 2 - Web App
cd anime-web-app
npm run dev
```

### Method 3: Background Processes
```powershell
# Start API in background
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm start"

# Start Web App in background
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd anime-web-app; npm run dev"
```

## 🛑 Stopping the Servers

### Stop all Node processes
```powershell
Get-Process node | Stop-Process -Force
```

### Stop specific port
```powershell
# Kill process on port 3000
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force

# Kill process on port 3001
Get-Process -Id (Get-NetTCPConnection -LocalPort 3001).OwningProcess | Stop-Process -Force
```

## 🔍 Checking Status

### Check if servers are running
```powershell
# Check Node processes
Get-Process | Where-Object {$_.ProcessName -eq "node"}

# Check ports in use
Get-NetTCPConnection -LocalPort 3000,3001 | Select-Object LocalPort,State,OwningProcess
```

### Test API is working
```powershell
# Using curl
curl http://localhost:3000

# Using PowerShell
Invoke-WebRequest -Uri "http://localhost:3000" -Method GET
```

## 📦 Package Management

### Install dependencies
```powershell
# Root (API)
npm install

# Web App
cd anime-web-app
npm install
```

### Clean install (if issues)
```powershell
# Root
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install

# Web App
cd anime-web-app
Remove-Item -Recurse -Force node_modules, package-lock.json
npm install
```

### Update packages
```powershell
npm update
```

## 🧹 Cleaning Up

### Clear Next.js cache
```powershell
cd anime-web-app
Remove-Item -Recurse -Force .next
npm run dev
```

### Clear all caches
```powershell
# API
Remove-Item -Recurse -Force node_modules, .cache

# Web App
cd anime-web-app
Remove-Item -Recurse -Force node_modules, .next, .cache
```

## 🐛 Debugging

### View API logs in real-time
```powershell
npm start
# Or with more verbose logging
$env:DEBUG="*"; npm start
```

### Check API endpoint directly
```powershell
# Get trending anime
Invoke-RestMethod -Uri "http://localhost:3000/anime/hianime/top-airing"

# Search anime
Invoke-RestMethod -Uri "http://localhost:3000/anime/hianime/one%20piece"

# Get anime info
Invoke-RestMethod -Uri "http://localhost:3000/anime/hianime/info?id=one-piece-100"

# Get streaming links
Invoke-RestMethod -Uri "http://localhost:3000/anime/hianime/watch/one-piece-100$episode-1"
```

### Browser DevTools
```
Press F12 in browser → Console tab
Look for:
- [API] messages (from lib/api.ts)
- [WatchPage] messages (from watch page)
- [VideoPlayer] messages (from video player)
- Red error messages
```

## 🔧 Environment Variables

### View current environment
```powershell
# Backend
Get-Content .env

# Frontend
Get-Content anime-web-app\.env.local
```

### Set environment variable temporarily
```powershell
# For current session
$env:NEXT_PUBLIC_API_URL="http://localhost:3000"

# Then run
npm run dev
```

## 📊 Performance & Monitoring

### Check memory usage
```powershell
Get-Process node | Select-Object ProcessName, Id, WorkingSet, CPU
```

### Monitor network requests
```powershell
# Install if needed: Install-Module -Name PsNetTools
Get-NetTCPConnection | Where-Object {$_.LocalPort -eq 3000 -or $_.LocalPort -eq 3001}
```

## 🎨 Development Workflow

### Typical workflow
```powershell
# 1. Start servers
.\start-dev.ps1

# 2. Open in browser
start http://localhost:3001

# 3. Make changes to code (auto-reload enabled)

# 4. Test

# 5. Stop servers when done
Get-Process node | Stop-Process
```

### Git workflow
```powershell
# Check status
git status

# Add changes
git add .

# Commit
git commit -m "Your message"

# Push
git push
```

## 🌐 URLs Reference

| Service | URL | Purpose |
|---------|-----|---------|
| Web App | http://localhost:3001 | Main anime website |
| API Root | http://localhost:3000 | API documentation |
| Search | http://localhost:3000/anime/hianime/:query | Search anime |
| Info | http://localhost:3000/anime/hianime/info?id=:id | Get anime details |
| Watch | http://localhost:3000/anime/hianime/watch/:episodeId | Get stream URL |
| Trending | http://localhost:3000/anime/hianime/top-airing | Trending anime |

## 📝 File Locations

| File | Location | Purpose |
|------|----------|---------|
| API Config | `.env` | Backend settings |
| Web Config | `anime-web-app/.env.local` | Frontend settings |
| API Routes | `src/routes/anime/` | Backend endpoints |
| Web Pages | `anime-web-app/app/` | Frontend pages |
| Components | `anime-web-app/components/` | UI components |
| Video Player | `anime-web-app/components/VideoPlayer.tsx` | Video streaming logic |

## 🎯 Quick Tests

### Test 1: API is working
```powershell
curl http://localhost:3000
# Should see JSON response
```

### Test 2: Search works
```powershell
Invoke-RestMethod "http://localhost:3000/anime/hianime/naruto"
# Should see array of anime results
```

### Test 3: Web app loads
```
Open browser → http://localhost:3001
Should see homepage with trending anime
```

### Test 4: Video streams
```
1. Click any anime card
2. Click any episode
3. Video should load and play
```

## 💡 Pro Tips

### Speed up startup
```powershell
# Use npm ci instead of npm install (faster)
npm ci

# Keep servers running while developing
# Only restart when changing configs
```

### Auto-reload on save
Both servers support hot-reload:
- **API**: Requires manual restart or use `npm run dev`
- **Web App**: Auto-reloads on file save

### Multiple windows
```powershell
# Open new PowerShell window
Start-Process powershell

# Or use Windows Terminal with split panes
# Alt + Shift + D (duplicate pane)
```

## 🆘 Emergency Commands

### Everything is broken, start fresh
```powershell
# 1. Stop all
Get-Process node | Stop-Process -Force

# 2. Clean everything
Remove-Item -Recurse -Force node_modules, package-lock.json, .next

# 3. Reinstall
npm install
cd anime-web-app
npm install

# 4. Start fresh
cd ..
.\start-dev.ps1
```

### Port is stuck
```powershell
# Find what's using the port
Get-NetTCPConnection -LocalPort 3000

# Kill it
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force
```

## 📚 Documentation Links

- [QUICKSTART.md](QUICKSTART.md) - Fast setup guide
- [SETUP.md](anime-web-app/SETUP.md) - Detailed setup
- [FIX_SUMMARY.md](FIX_SUMMARY.md) - What was fixed
- [README.md](README.md) - Project overview

## 🎓 Learning Resources

- Next.js: https://nextjs.org/learn
- TypeScript: https://www.typescriptlang.org/docs
- Tailwind CSS: https://tailwindcss.com/docs
- HLS.js: https://github.com/video-dev/hls.js/blob/master/docs/API.md

---

**Save this file as a reference!** Bookmark the URLs you use most often.
