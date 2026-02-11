const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { spawn } = require('child_process');
const { autoUpdater } = require("electron-updater");

let nextProcess;
let mainWindow;
let setupWindow;
let cloudToken = null;

const isPackaged = app.isPackaged;

function getPreloadPath() {
    if (isPackaged) {
        return path.join(process.resourcesPath, 'app.asar', 'electron', 'preload.js');
    }
    return path.join(__dirname, 'preload.js');
}

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
            preload: getPreloadPath(),
            nodeIntegration: false,
            contextIsolation: true,
        },
        autoHideMenuBar: true
    });

    const setupHtmlPath = isPackaged
        ? path.join(process.resourcesPath, 'app.asar', 'electron', 'setup.html')
        : path.join(__dirname, 'setup.html');

    setupWindow.loadFile(setupHtmlPath);
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        autoHideMenuBar: true,
        webPreferences: {
            preload: getPreloadPath(),
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
        NEXT_PUBLIC_NX_PASSWORD: process.env.NEXT_PUBLIC_NX_PASSWORD,
        NEXT_PUBLIC_NX_PASSWORD_ENCRYPTED: process.env.NEXT_PUBLIC_NX_PASSWORD_ENCRYPTED,
        NEXT_PUBLIC_NX_CLOUD_USERNAME: process.env.NEXT_PUBLIC_NX_CLOUD_USERNAME,
        NEXT_PUBLIC_NX_CLOUD_PASSWORD: process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD,
        NEXT_PUBLIC_NX_CLOUD_PASSWORD_ENCRYPTED: process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD_ENCRYPTED,
        NX_CLOUD_TOKEN: process.env.NX_CLOUD_TOKEN
    };
});

ipcMain.handle('setup:get-config', async () => {
    return {
        NEXT_PUBLIC_NX_SYSTEM_ID: process.env.NEXT_PUBLIC_NX_SYSTEM_ID,
        NEXT_PUBLIC_NX_USERNAME: process.env.NEXT_PUBLIC_NX_USERNAME,
        NEXT_PUBLIC_NX_PASSWORD: process.env.NEXT_PUBLIC_NX_PASSWORD,
        NEXT_PUBLIC_NX_PASSWORD_ENCRYPTED: process.env.NEXT_PUBLIC_NX_PASSWORD_ENCRYPTED,
        NEXT_PUBLIC_NX_CLOUD_USERNAME: process.env.NEXT_PUBLIC_NX_CLOUD_USERNAME,
        NEXT_PUBLIC_NX_CLOUD_PASSWORD: process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD,
        NEXT_PUBLIC_NX_CLOUD_PASSWORD_ENCRYPTED: process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD_ENCRYPTED,
        NX_CLOUD_TOKEN: process.env.NX_CLOUD_TOKEN
    };
});

// Decrypt password on-demand (server-side only, never exposed to renderer)
ipcMain.handle('decrypt:vms-password', async () => {
    const encrypted = process.env.NEXT_PUBLIC_NX_PASSWORD_ENCRYPTED;
    return encrypted ? decryptPassword(encrypted) : null;
});

ipcMain.handle('decrypt:cloud-password', async () => {
    const encrypted = process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD_ENCRYPTED;
    return encrypted ? decryptPassword(encrypted) : null;
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

        return { success: true, systems, cloudAuthToken: Buffer.from(`${creds.cloudEmail}:${creds.cloudPassword}`).toString('base64') };
    } catch (e) {
        console.error('[Setup] Cloud Connectivity Error:', e);
        return { success: false, error: `Cloud Connectivity Error: ${e.message}` };
    }
});

ipcMain.handle('setup:check-relay', async (event, { systemId, vmsUser, vmsPassword, cloudAuthToken }) => {
    try {
        console.log(`[Setup] Phase 2: Verifying Local Login via Relay...`);

        // Pattern 1: Try REST v4 (Modern)
        const v4Url = `https://${systemId}.relay.vmsproxy.com/rest/v4/login/sessions`;
        let response = await fetch(v4Url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: vmsUser, password: vmsPassword, setCookie: true })
        });

        // Pattern 2: Try REST v3 (Legacy Fallback)
        if (!response.ok) {
            console.log(`[Setup] V4 Failed, trying V3 Fallback...`);
            const v3Url = `https://${systemId}.relay.vmsproxy.com/rest/v3/login/sessions`;
            response = await fetch(v3Url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // Some relays require the Cloud Bearer token to authorize the local login attempt
                    ...(cloudAuthToken ? { 'Authorization': `Bearer ${cloudAuthToken}` } : {})
                },
                body: JSON.stringify({ username: vmsUser, password: vmsPassword, setCookie: true })
            });
        }

        if (!response.ok) {
            const detail = await response.text();
            console.error(`[Setup] VMS Login Failed:`, detail);
            return { success: false, error: `VMS Verification Failed. Check Local Admin credentials.` };
        }

        const data = await response.json();
        const cloudToken = data.token || data.id;

        console.log(`[Setup] Relay connection verified successfully.`);
        return { success: true, cloudToken };
    } catch (e) {
        console.error(`[Setup] Relay Error:`, e);
        return { success: false, error: `Relay Connection Error: ${e.message}` };
    }
});

// Encryption utilities for secure password storage
const crypto = require('crypto');
const os = require('os');

// Derive encryption key from machine-specific data
function getEncryptionKey() {
    const machineId = os.hostname() + os.platform() + os.arch();
    return crypto.createHash('sha256').update(machineId).digest();
}

// Encrypt password using AES-256-GCM
function encryptPassword(password) {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    // Return iv:authTag:encrypted format
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

// Decrypt password using AES-256-GCM
function decryptPassword(encryptedData) {
    try {
        const key = getEncryptionKey();
        const parts = encryptedData.split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const authTag = Buffer.from(parts[1], 'hex');
        const encrypted = parts[2];

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('[Encryption] Failed to decrypt password:', error.message);
        return null;
    }
}

ipcMain.handle('setup:save', async (event, data) => {
    try {
        const salt = await bcrypt.genSalt(10);

        // Hash passwords for dashboard login verification
        const cloudHash = await bcrypt.hash(data.cloudPassword, salt);
        const vmsHash = await bcrypt.hash(data.password, salt);

        // Encrypt passwords for relay authentication (machine-specific)
        const vmsEncrypted = encryptPassword(data.password);
        const cloudEncrypted = encryptPassword(data.cloudPassword);

        const envContent = [
            `NEXT_PUBLIC_NX_SYSTEM_ID=${data.systemId}`,
            `NEXT_PUBLIC_NX_USERNAME=${data.username}`,
            `NEXT_PUBLIC_NX_PASSWORD=${vmsHash}`,
            `NEXT_PUBLIC_NX_PASSWORD_ENCRYPTED=${vmsEncrypted}`,
            '',
            `NEXT_PUBLIC_NX_CLOUD_USERNAME=${data.cloudEmail}`,
            `NEXT_PUBLIC_NX_CLOUD_PASSWORD=${cloudHash}`,
            `NEXT_PUBLIC_NX_CLOUD_PASSWORD_ENCRYPTED=${cloudEncrypted}`,
            `NX_CLOUD_TOKEN=${data.cloudToken || ''}`
        ].join('\n');

        fs.writeFileSync(CONFIG_PATH, envContent);

        // Reload into process.env
        process.env.NEXT_PUBLIC_NX_SYSTEM_ID = data.systemId;
        process.env.NEXT_PUBLIC_NX_USERNAME = data.username;
        process.env.NEXT_PUBLIC_NX_PASSWORD = vmsHash;
        process.env.NEXT_PUBLIC_NX_PASSWORD_ENCRYPTED = vmsEncrypted;
        process.env.NEXT_PUBLIC_NX_CLOUD_USERNAME = data.cloudEmail;
        process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD = cloudHash;
        process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD_ENCRYPTED = cloudEncrypted;
        process.env.NX_CLOUD_TOKEN = data.cloudToken;

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.on('setup:launch', () => {
    if (setupWindow) setupWindow.close();
    createMainWindow();
});

function startNextProd() {
    nextProcess = spawn('npm', ['run', 'start'], {
        cwd: path.join(process.resourcesPath, 'app.asar.unpacked'),
        shell: true,
        stdio: 'inherit'
    });
}


function stopNextProd() {
    if (nextProcess) {
        nextProcess.kill();
        nextProcess = null;
    }
}

async function waitForServer(url, timeout = 15000) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
        try {
            const res = await fetch(url);
            if (res.ok) return true;
        } catch (e) {
            // ignore
        }
        await new Promise(r => setTimeout(r, 300));
    }
    return false;
}

app.whenReady().then(async () => {
    autoUpdater.on("update-available", () => {
        console.log("Update available");
    });

    autoUpdater.on("update-downloaded", () => {
        console.log("Update downloaded, will install now...");
        autoUpdater.quitAndInstall();
    });

    // start next server in production
    startNextProd();

    // wait until server is ready
    const url = 'http://localhost:3130';
    const ready = await waitForServer(url);

    if (!ready) {
        console.error('Next server failed to start');
        app.quit();
        return;
    }

    if (process.env.NEXT_PUBLIC_NX_CLOUD_USERNAME && process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD) {
        createMainWindow();
    } else {
        createSetupWindow();
    }
});

app.on('before-quit', () => {
    stopNextProd();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});