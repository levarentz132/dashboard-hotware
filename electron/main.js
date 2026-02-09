const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

let mainWindow;
let setupWindow;
let cloudToken = null;

const CONFIG_PATH = path.join(app.getPath('userData'), '.env.local');

// Load env if exists
if (fs.existsSync(CONFIG_PATH)) {
    const dotenv = require('dotenv');
    const envConfig = dotenv.parse(fs.readFileSync(CONFIG_PATH));
    for (const k in envConfig) {
        process.env[k] = envConfig[k];
    }
}

function createSetupWindow() {
    setupWindow = new BrowserWindow({
        width: 800,
        height: 600,
        backgroundColor: '#0c0c0c',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        autoHideMenuBar: true
    });

    setupWindow.loadFile(path.join(__dirname, 'setup.html'));
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    const url = 'http://localhost:3130';
    mainWindow.loadURL(url).catch(err => {
        console.error(`Failed to load ${url}:`, err);
    });
}

// IPC Handlers
ipcMain.on('setup:get-config-sync', (event) => {
    event.returnValue = {
        NEXT_PUBLIC_NX_SYSTEM_ID: process.env.NEXT_PUBLIC_NX_SYSTEM_ID,
        NEXT_PUBLIC_NX_USERNAME: process.env.NEXT_PUBLIC_NX_USERNAME,
        NX_ADMIN_HASH: process.env.NX_ADMIN_HASH,
        NX_CLOUD_TOKEN: process.env.NX_CLOUD_TOKEN,
        EXTERNAL_AUTH_API_URL: process.env.EXTERNAL_AUTH_API_URL
    };
});

ipcMain.handle('setup:get-config', async () => {
    return {
        NEXT_PUBLIC_NX_SYSTEM_ID: process.env.NEXT_PUBLIC_NX_SYSTEM_ID,
        NEXT_PUBLIC_NX_USERNAME: process.env.NEXT_PUBLIC_NX_USERNAME,
        NX_ADMIN_HASH: process.env.NX_ADMIN_HASH,
        NX_CLOUD_TOKEN: process.env.NX_CLOUD_TOKEN,
        EXTERNAL_AUTH_API_URL: process.env.EXTERNAL_AUTH_API_URL
    };
});

ipcMain.handle('setup:validate-cloud', async (event, creds) => {
    try {
        console.log(`[Setup] Phase 1: Checking Cloud Systems via Basic Auth...`);

        // Create Basic Auth header
        const authHeader = 'Basic ' + Buffer.from(`${creds.cloudEmail}:${creds.cloudPassword}`).toString('base64');

        // Call systems list directly with Basic Auth
        const sysResponse = await fetch('https://meta.nxvms.com/cdb/systems', {
            method: 'GET',
            headers: {
                'Authorization': authHeader,
                'Accept': 'application/json'
            }
        });

        if (!sysResponse.ok) {
            console.error(`[Setup] Cloud Auth Failed: ${sysResponse.status}`);
            return { success: false, error: 'Nx Cloud Authentication Failed. Check your email and password.' };
        }

        const data = await sysResponse.json();

        let systems = [];
        if (Array.isArray(data)) {
            systems = data;
        } else if (data && typeof data === 'object' && Array.isArray(data.systems)) {
            systems = data.systems;
        } else {
            console.error('[Setup] Unexpected systems response format:', data);
            return { success: false, error: 'Cloud systems list format is invalid.' };
        }

        return { success: true, systems };
    } catch (e) {
        console.error('[Setup] Cloud Connectivity Error:', e);
        return { success: false, error: `Cloud Connectivity Error: ${e.message}` };
    }
});

ipcMain.handle('setup:check-relay', async (event, { systemId, vmsUser, vmsPassword }) => {
    try {
        console.log(`[Setup] Phase 2: Verifying Local Login via Relay (V4)...`);

        // Step 3: Verify Local Admin Credentials via the System's own Relay Endpoint
        const relayLoginUrl = `https://${systemId}.relay.vmsproxy.com/rest/v4/login/sessions`;

        const response = await fetch(relayLoginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: vmsUser,
                password: vmsPassword,
                setCookie: true
            })
        });

        if (!response.ok) {
            const detail = await response.text();
            return { success: false, error: `VMS Verification Failed (${response.status})` };
        }

        const data = await response.json();
        cloudToken = data.token; // This becomes our persistent NX_CLOUD_TOKEN

        return { success: true };
    } catch (e) {
        return { success: false, error: `Relay Error: ${e.message}` };
    }
});

ipcMain.handle('setup:save', async (event, data) => {
    try {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(data.password, salt);

        const envContent = [
            `NEXT_PUBLIC_NX_SYSTEM_ID=${data.systemId}`,
            `NEXT_PUBLIC_NX_USERNAME=${data.username}`,
            `NX_ADMIN_HASH=${hash}`,
            `NX_CLOUD_TOKEN=${cloudToken}`,
            `EXTERNAL_AUTH_API_URL=${process.env.EXTERNAL_AUTH_API_URL || 'http://16.78.105.192:3000'}`
        ].join('\n');

        fs.writeFileSync(CONFIG_PATH, envContent);

        // Reload into process.env
        process.env.NEXT_PUBLIC_NX_SYSTEM_ID = data.systemId;
        process.env.NEXT_PUBLIC_NX_USERNAME = data.username;
        process.env.NX_ADMIN_HASH = hash;
        process.env.NX_CLOUD_TOKEN = cloudToken;
        process.env.EXTERNAL_AUTH_API_URL = process.env.EXTERNAL_AUTH_API_URL || 'http://16.78.105.192:3000';

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.on('setup:launch', () => {
    if (setupWindow) setupWindow.close();
    createMainWindow();
});

app.whenReady().then(() => {
    if (process.env.NX_CLOUD_TOKEN && process.env.NX_ADMIN_HASH) {
        createMainWindow();
    } else {
        createSetupWindow();
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
