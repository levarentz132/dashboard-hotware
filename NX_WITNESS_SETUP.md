# 🔌 Nx Witness API Integration Guide

This guide will help you connect the Hotware Dashboard to your local Nx Witness server.

## 📋 Prerequisites

1. **Nx Witness Server** running on your local machine
2. **Admin credentials** for your Nx Witness system
3. **API access enabled** on your Nx Witness server

## ⚙️ Configuration Steps

### 1. Find Your Nx Witness Server Details

**Default Nx Witness API endpoints:**
- **HTTP API**: `http://localhost:7001/api`
- **WebSocket**: `ws://localhost:7001/ws`
- **Web Interface**: `http://localhost:7001`

**To verify your server is running:**
```bash
# Test if server responds
curl http://localhost:7001/api/getServersInfo
```

### 2. Configure Environment Variables

Edit your `.env.local` file with your Nx Witness details:

```bash
# Nx Witness API Configuration
NEXT_PUBLIC_API_URL=http://localhost:7001/api
NEXT_PUBLIC_WS_URL=ws://localhost:7001/ws

# Nx Witness Authentication
NEXT_PUBLIC_NX_USERNAME=your_admin_username
NEXT_PUBLIC_NX_PASSWORD=your_admin_password
NEXT_PUBLIC_NX_SERVER_HOST=localhost
NEXT_PUBLIC_NX_SERVER_PORT=7001

# Branding
NEXT_PUBLIC_BRAND_NAME=Hotware
```

### 3. Common Nx Witness API Endpoints

The dashboard will try to connect to these endpoints:

```
GET /api/getServersInfo          - Server information
GET /api/getCamerasEx            - Camera list with details
GET /api/getEvents               - Recent events
GET /api/getBookmarks           - Bookmarks (alarms)
GET /api/getStorages            - Storage information
```

### 4. Nx Witness Server Setup

**Enable API access in Nx Witness:**

1. **Open Nx Witness Desktop Client**
2. **Go to System Administration > General**
3. **Enable "Allow anonymous access"** (for testing)
4. **Or create a dedicated API user with proper permissions**

**Alternative - Create API User:**
1. **System Administration > Users**
2. **Add User** with these permissions:
   - View Archive
   - View Live Video  
   - Access to all cameras
   - View Bookmarks

### 5. Test Connection

**Restart your development server:**
```bash
npm run dev
```

**Check the dashboard:**
1. Go to `http://localhost:3000`
2. Look for **connection status** in the top-right corner
3. Green dot = Connected to Nx Witness
4. Red dot = Connection failed

## 🔧 Troubleshooting

### Connection Issues

**1. Server Not Responding**
```bash
# Check if Nx Witness is running
netstat -an | findstr :7001

# Test direct API call
curl -u username:password http://localhost:7001/api/getServersInfo
```

**2. Authentication Errors**
- Verify username/password in `.env.local`
- Check user permissions in Nx Witness
- Try enabling anonymous access temporarily

**3. CORS Issues**
Add these headers to your Nx Witness server configuration (if needed):
```
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Credentials: true
```

**4. Wrong Port**
Common Nx Witness ports:
- `7001` - Default HTTP port
- `7002` - Alternative HTTP port  
- `443` - HTTPS port (if SSL enabled)

### API Endpoints Reference

**Test these URLs in your browser:**

```bash
# Server info (should work without auth if anonymous enabled)
http://localhost:7001/api/getServersInfo

# Cameras (requires authentication)
http://localhost:7001/api/getCamerasEx

# Events (requires authentication)  
http://localhost:7001/api/getEvents?limit=10
```

### Check Dashboard API Status

1. **Open browser DevTools** (F12)
2. **Go to Console tab**
3. **Look for API requests** and any error messages
4. **Network tab** shows actual HTTP requests being made

## 📊 Expected Data Format

**Camera Response:**
```json
{
  "id": "camera-uuid",
  "name": "Camera Name", 
  "physicalId": "CAM-001",
  "status": "Online",
  "typeId": "dome",
  "model": "Model Name",
  "ip": "192.168.1.100"
}
```

**Event Response:**
```json
{
  "id": "event-uuid",
  "timestamp": "2024-11-10T10:00:00Z",
  "cameraId": "camera-uuid", 
  "type": "Motion Detection",
  "description": "Motion detected"
}
```

## 🚀 Quick Start Commands

**Complete setup:**
```bash
# 1. Copy environment template
cp .env.example .env.local

# 2. Edit with your Nx Witness credentials
# nano .env.local

# 3. Restart development server
npm run dev

# 4. Check http://localhost:3000 for connection status
```

## 📞 Support

**If you're still having issues:**

1. **Check Nx Witness logs** in the application
2. **Verify firewall settings** (port 7001 should be accessible)
3. **Test with curl** or Postman first
4. **Enable anonymous access** temporarily for testing
5. **Check the browser console** for specific error messages

**Common working configurations:**

```bash
# Local development (anonymous access enabled)
NEXT_PUBLIC_API_URL=http://localhost:7001/api
NEXT_PUBLIC_NX_USERNAME=
NEXT_PUBLIC_NX_PASSWORD=

# Local development (with credentials)  
NEXT_PUBLIC_API_URL=http://localhost:7001/api
NEXT_PUBLIC_NX_USERNAME=admin
NEXT_PUBLIC_NX_PASSWORD=your_password

# Remote server
NEXT_PUBLIC_API_URL=http://192.168.1.100:7001/api
NEXT_PUBLIC_NX_USERNAME=api_user
NEXT_PUBLIC_NX_PASSWORD=api_password
```

Once connected, you should see real camera data, events, and system information in your Hotware Dashboard! 🎉