// electron/main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');

// Load environment variables if needed
require('dotenv').config({
    path: app.isPackaged
        ? path.join(process.resourcesPath, '.env')
        : path.join(__dirname, '../.env.local')
});

function createWindow() {
    const win = new BrowserWindow({
        width: 1920,
        height: 1080,
        autoHideMenuBar: true, // Optional: hide menu bar for a cleaner look
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    // Load the frontend from the local server
    // User requested port 3130
    const url = 'http://localhost:3130';

    win.loadURL(url).catch(err => {
        console.error(`Failed to load ${url}:`, err);
        // Show a helpful error message if the server isn't running
    });

    if (!app.isPackaged) {
        // Open DevTools automatically in development
        win.webContents.openDevTools();
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
