# 🎌 Anime Web App - Video Playback Fix Summary

## ✅ What Was Fixed

### 1. **API Configuration Issue**
- **Problem**: The API URL was hardcoded to `http://localhost:3000`
- **Solution**: Added environment variable support (`NEXT_PUBLIC_API_URL`)
- **Files Changed**: `anime-web-app/lib/api.ts`

### 2. **Port Conflict**
- **Problem**: Both API and Web App were trying to use port 3000
- **Solution**: Configured Web App to run on port 3001
- **Files Changed**: `anime-web-app/package.json`

### 3. **Video Player Improvements**
- **Problem**: No error handling, no loading states, no CORS handling
- **Solution**: Added:
  - Loading spinner
  - Error messages and retry button
  - Better HLS.js configuration
  - Network error recovery
  - Detailed logging for debugging
- **Files Changed**: `anime-web-app/components/VideoPlayer.tsx`

### 4. **Better Debugging**
- **Problem**: No logs to diagnose issues
- **Solution**: Added console logs in:
  - API calls (`lib/api.ts`)
  - Watch page (`app/watch/[episodeId]/page.tsx`)
  - Video player (`components/VideoPlayer.tsx`)

### 5. **Environment Configuration**
- **Created Files**:
  - `.env.local` - Local development configuration
  - `.env.example` - Template for environment variables

### 6. **Documentation & Scripts**
- **Created**:
  - `QUICKSTART.md` - Fast setup guide
  - `SETUP.md` - Complete documentation
  - `start-dev.ps1` - PowerShell script to start both servers

## 🚀 How to Use

### Quick Start (Recommended)
```powershell
# Make sure you're in the root directory
cd c:\Users\PC\Desktop\api.consumet.org

# Start both servers
.\start-dev.ps1
```

### Manual Start
```powershell
# Terminal 1 - API Server
cd c:\Users\PC\Desktop\api.consumet.org
npm start

# Terminal 2 - Web App (open a new terminal)
cd c:\Users\PC\Desktop\api.consumet.org\anime-web-app
npm run dev
```

### Access the App
- **Web App**: http://localhost:3001
- **API**: http://localhost:3000

## 📊 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    User's Browser                           │
│                 http://localhost:3001                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ HTTP Requests
                         ▼
┌─────────────────────────────────────────────────────────────┐
│            Next.js Web App (Frontend)                       │
│                   Port: 3001                                │
│  Components:                                                │
│  - VideoPlayer.tsx (HLS.js streaming)                       │
│  - AnimeCard.tsx (UI components)                            │
│  - Navbar.tsx (navigation)                                  │
│  Pages:                                                     │
│  - / (Homepage - trending)                                  │
│  - /search (Search results)                                 │
│  - /info/[id] (Anime details)                              │
│  - /watch/[episodeId] (Video player)                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ API Calls via axios
                         │ (http://localhost:3000)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│        Consumet API (Backend)                               │
│                 Port: 3000                                  │
│  Routes:                                                    │
│  - GET /anime/hianime/:query (search)                      │
│  - GET /anime/hianime/info?id={id} (anime info)           │
│  - GET /anime/hianime/watch/{episodeId} (stream links)    │
│  - GET /anime/hianime/top-airing (trending)               │
│                                                             │
│  Features:                                                  │
│  - Web scraping with @consumet/extensions                  │
│  - Puppeteer fallback for blocked sources                  │
│  - Multiple provider support                               │
│  - CORS enabled for frontend access                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         │ Web Scraping
                         ▼
┌─────────────────────────────────────────────────────────────┐
│            Anime Providers                                  │
│  - HiAnime (hianime.to)                                    │
│  - AnimePahe (animepahe.com)                               │
│  - And more...                                             │
│                                                             │
│  Returns: Video stream URLs (m3u8, mp4)                    │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 Video Streaming Flow

```
1. User clicks episode
   ↓
2. Navigate to /watch/[episodeId]?provider=hianime
   ↓
3. Server fetches stream data from API:
   GET /anime/hianime/watch/[episodeId]
   ↓
4. API scrapes anime provider website
   ↓
5. Returns JSON with video sources:
   {
     sources: [
       { url: "https://...", quality: "auto", isM3U8: true }
     ],
     headers: { Referer: "..." }
   }
   ↓
6. VideoPlayer component receives URL
   ↓
7. If m3u8: Use HLS.js to play
   If mp4: Use native HTML5 video
   ↓
8. Video plays in browser! 🎉
```

## 🔧 How the Video Player Works

### HLS.js Integration
The video player uses **HLS.js** (HTTP Live Streaming) library to play `.m3u8` streams:

```typescript
// Detect if source is m3u8
const isM3U8 = src.includes('.m3u8');

if (isM3U8 && Hls.isSupported()) {
  // Use HLS.js for adaptive streaming
  const hls = new Hls();
  hls.loadSource(src);
  hls.attachMedia(video);
}
```

### Error Handling
```typescript
// Network error - try to recover
hls.on(Hls.Events.ERROR, (event, data) => {
  if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
    hls.startLoad(); // Retry loading
  }
});
```

## 📝 Key Files Modified

### 1. `anime-web-app/lib/api.ts`
- Added environment variable for API URL
- Improved error logging
- All API methods centralized here

### 2. `anime-web-app/components/VideoPlayer.tsx`
- Complete rewrite with:
  - Loading states
  - Error handling
  - HLS.js configuration
  - Auto-recovery for network errors

### 3. `anime-web-app/app/watch/[episodeId]/page.tsx`
- Added debug logging
- Better error display
- Provider support

### 4. `anime-web-app/package.json`
- Changed dev port from 3000 to 3001
- Prevents port conflicts with API

## 🐛 Troubleshooting

### Issue: Videos Not Loading
**Symptoms**: Black screen, no video plays
**Causes**:
1. API server not running
2. Provider website is down
3. CORS issues
4. Video source blocked by browser

**Solutions**:
1. Check API is running: http://localhost:3000
2. Open browser DevTools (F12) → Console tab
3. Look for errors:
   - `404` → API not responding, restart API server
   - `CORS error` → API CORS settings issue (should be fixed)
   - `HLS Error` → Try different provider or episode
4. Try switching provider in navbar dropdown

### Issue: "Stream Unavailable" Message
**Cause**: API couldn't fetch video source from provider
**Solutions**:
1. Switch provider (HiAnime → AnimePahe)
2. Wait a few minutes and try again
3. Check if provider website is accessible
4. Some episodes may genuinely not have sources

### Issue: Port Already in Use
**Symptom**: `EADDRINUSE: address already in use :::3000`
**Solution**:
```powershell
# Find process using port 3000
Get-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess | Stop-Process -Force

# Or change port in .env
PORT=3005
```

## 🚦 Testing Checklist

- [x] API server starts on port 3000
- [x] Web app starts on port 3001
- [x] Homepage shows trending anime
- [x] Search functionality works
- [x] Clicking anime shows episodes
- [x] Clicking episode navigates to watch page
- [ ] Video plays successfully (test this!)
- [ ] Error messages display properly
- [ ] Provider switching works

## 📦 Dependencies

### Backend (API)
- `fastify` - Fast web server
- `@consumet/extensions` - Anime scraping library
- `puppeteer` - Headless browser for difficult scraping
- `axios` - HTTP client
- `ioredis` - Redis caching (optional)

### Frontend (Web App)
- `next` - React framework
- `react` - UI library
- `axios` - API calls
- `hls.js` - Video streaming
- `lucide-react` - Icons
- `tailwindcss` - Styling

## 🎓 Learning Points

### What You Have
1. **Full-stack anime streaming app**
   - Backend API (Consumet)
   - Frontend web app (Next.js)

2. **Web scraping system**
   - Extracts anime data from websites
   - Finds video streaming URLs
   - Multiple provider support

3. **Video streaming**
   - HLS (HTTP Live Streaming)
   - Adaptive quality selection
   - Cross-browser compatibility

### Technologies Used
- **TypeScript** - Type-safe JavaScript
- **Next.js 16** - React framework with App Router
- **Fastify** - Fast Node.js web framework
- **HLS.js** - HTML5 video streaming
- **Puppeteer** - Browser automation
- **TailwindCSS** - Utility-first CSS

## 🌐 Deployment (Future)

### Backend API
Deploy to:
- **Vercel** (serverless functions)
- **Railway** (containerized)
- **Render** (free tier available)

### Frontend
Deploy to:
- **Vercel** (recommended - auto-deploy from Git)
- **Netlify**
- **Cloudflare Pages**

**Important**: Update `NEXT_PUBLIC_API_URL` to your deployed API URL!

## ⚠️ Legal Disclaimer

This project is for **educational purposes only**. 

- The Consumet API scrapes publicly available websites
- Streaming copyrighted content may be illegal in your jurisdiction
- Use responsibly and respect copyright laws
- Consider supporting official streaming services

## 🎉 Success!

Your anime streaming website is now set up and ready to use!

### Next Steps:
1. Test video playback on different anime
2. Try switching providers
3. Customize the UI to your liking
4. Add features like:
   - User favorites
   - Watch history
   - Continue watching
   - Recommendations

### Resources:
- Next.js Docs: https://nextjs.org/docs
- Consumet Docs: https://docs.consumet.org
- HLS.js Docs: https://github.com/video-dev/hls.js

Enjoy your anime streaming app! 🎌🎬
