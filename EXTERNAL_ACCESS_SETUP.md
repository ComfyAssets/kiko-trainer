# External Access Setup Guide

## Issue Fixed
The frontend was hardcoded to use `localhost:8000` but needed to work for external access.

## Changes Made

### 1. Updated Environment Configuration
File: `web/.env`
```bash
# API Configuration - Update these for your deployment  
VITE_API_HOST=10.0.140.30
VITE_API_PORT=8888
```

### 2. Made API URL Configurable
File: `web/src/services/captionApi.ts`
```typescript
const API_HOST = import.meta.env.VITE_API_HOST || 'localhost';
const API_PORT = import.meta.env.VITE_API_PORT || '8888';
const API_BASE_URL = `http://${API_HOST}:${API_PORT}/api`;
```

## To Apply Changes

1. **Restart the frontend development server** to pick up new environment variables:
   ```bash
   cd web
   # Stop current server (Ctrl+C) and restart
   npm run dev
   # or
   yarn dev
   ```

2. **For different deployment environments**, update `web/.env`:
   ```bash
   # For local development
   VITE_API_HOST=localhost
   
   # For external access (replace with your server's IP)
   VITE_API_HOST=10.0.140.30
   
   # For production domain
   VITE_API_HOST=your-domain.com
   ```

## Verification

The backend server is already configured correctly with:
```bash
uvicorn server:app --host 0.0.0.0 --port 8888 --reload
```

API endpoint test:
```bash
curl http://10.0.140.30:8888/api/health
# Should return: {"ok":true}
```

## Current Configuration
- **Backend API**: `http://10.0.140.30:8888/api`
- **Frontend UI**: `http://10.0.140.30:3333` (or your external access URL)
- **Caption endpoint**: `http://10.0.140.30:8888/api/caption`

After restarting the frontend server, the caption generation should work from external access!