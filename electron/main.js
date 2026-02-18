const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { spawn, fork } = require('child_process');
const net = require('net');

let nextProcess;
let mainWindow;
let setupWindow;
let cloudToken = null;
let currentPort = 3130;
let isInstallingUpdate = false;

const { exec } = require('child_process');

function killProcessTree(pid) {
    return new Promise((resolve) => {
        if (!pid) return resolve();

        if (process.platform === 'win32') {
            exec(`taskkill /PID ${pid} /T /F`, () => {
                resolve();
            });
        } else {
            try {
                process.kill(-pid, 'SIGKILL');
            } catch (e) {
                try { process.kill(pid, 'SIGKILL'); } catch { }
            }
            resolve();
        }
    });
}

const LOG_PATH = path.join(app.getPath('userData'), 'main.log');

function logtoFile(msg) {
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${msg}\n`;
    try {
        fs.appendFileSync(LOG_PATH, logLine);
    } catch (e) {
        console.error('Failed to write log:', e);
    }
    console.log(msg); // Keep console logging
}

logtoFile('-----------------------------------');
logtoFile(`App starting. User Data: ${app.getPath('userData')}`);
logtoFile(`Resources Path: ${process.resourcesPath}`);
logtoFile(`Is Packaged: ${app.isPackaged}`);

autoUpdater.autoDownload = true;

const isPackaged = app.isPackaged;

function getPreloadPath() {
    if (isPackaged) {
        return path.join(process.resourcesPath, 'app.asar', 'electron', 'preload.js');
    }
    return path.join(__dirname, 'preload.js');
}

function listDirRecursive(dir, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) return;
    try {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            const filePath = path.join(dir, file);
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) {
                logtoFile(`${'  '.repeat(depth)}[DIR] ${file}`);
                listDirRecursive(filePath, depth + 1, maxDepth);
            } else {
                logtoFile(`${'  '.repeat(depth)}[FILE] ${file}`);
            }
        });
    } catch (e) {
        logtoFile(`${'  '.repeat(depth)}[ERROR] ${e.message}`);
    }
}

function findServerJs(dir, depth = 0, maxDepth = 4) {
    if (depth > maxDepth) return null;
    try {
        const files = fs.readdirSync(dir);
        // Check current dir first
        if (files.includes('server.js')) return path.join(dir, 'server.js');

        // Then search subdirs
        for (const file of files) {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isDirectory()) {
                const found = findServerJs(filePath, depth + 1, maxDepth);
                if (found) return found;
            }
        }
    } catch (e) { }
    return null;
}

function findAvailablePort(startPort) {
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.unref();
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                resolve(findAvailablePort(startPort + 1));
            } else {
                reject(err);
            }
        });
        server.listen(startPort, () => {
            const { port } = server.address();
            server.close(() => {
                resolve(port);
            });
        });
    });
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

// Ensure JWT_SECRET exists for session persistence
if (!process.env.JWT_SECRET) {
    const crypto = require('crypto');
    // Generate a secure, persistent secret
    const secret = crypto.randomBytes(32).toString('hex');
    process.env.JWT_SECRET = secret;

    try {
        // Append to .env.local if file exists, or create it
        const content = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, 'utf8') : '';
        if (!content.includes('JWT_SECRET=')) {
            fs.appendFileSync(CONFIG_PATH, `\nJWT_SECRET=${secret}\n`);
            logtoFile('[Electron] Generated and persisted new JWT_SECRET');
        }
    } catch (e) {
        logtoFile(`[Electron] Failed to persist JWT_SECRET: ${e.message}`);
    }
}

function createSetupWindow() {
    setupWindow = new BrowserWindow({
        width: 800,
        height: 600,
        fullscreen: true,
        backgroundColor: '#0c0c0c',
        webPreferences: {
            preload: getPreloadPath(),
            nodeIntegration: false,
            contextIsolation: true,
        },
        autoHideMenuBar: true
    });

    setupWindow.setFullScreen(true);

    const setupHtmlPath = isPackaged
        ? path.join(process.resourcesPath, 'app.asar', 'electron', 'setup.html')
        : path.join(__dirname, 'setup.html');

    setupWindow.loadFile(setupHtmlPath);
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1920,
        height: 1080,
        fullscreen: true,
        autoHideMenuBar: true,
        webPreferences: {
            preload: getPreloadPath(),
            nodeIntegration: false,
            contextIsolation: true,
        }
    });

    mainWindow.setFullScreen(true);

    const url = `http://localhost:${currentPort}`;
    console.log(`[Electron] Loading URL: ${url}`);
    logtoFile(`[Electron] Loading URL: ${url}`);

    mainWindow.loadURL(url).catch(err => {
        const msg = `Failed to load ${url}: ${err.message}`;
        console.error(msg);
        logtoFile(msg);
        dialog.showErrorBox('Load Error', msg);
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

// Window Controls
ipcMain.on('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
});

ipcMain.on('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
        if (win.isMaximized()) {
            win.unmaximize();
        } else {
            win.maximize();
        }
    }
});

ipcMain.on('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
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


let isServerStopping = false;
let healthCheckInterval;
let serverParams = null;
let restartAttempts = 0;
const MAX_RESTARTS = 5;
const RESTART_WINDOW = 60000; // 1 minute
let lastRestartTime = 0;

function launchServer(command, args, cwd, customEnv) {
    if (nextProcess) return;

    // Reset loop protection if enough time has passed
    if (Date.now() - lastRestartTime > RESTART_WINDOW) {
        restartAttempts = 0;
    }

    if (restartAttempts >= MAX_RESTARTS) {
        console.error('[Electron] Too many server restarts. Giving up.');
        return;
    }

    restartAttempts++;
    lastRestartTime = Date.now();

    logtoFile(`[Electron] Spawning server (Attempt ${restartAttempts}): ${command} ${args.join(' ')}`);
    serverParams = { command, args, cwd, customEnv };
    isServerStopping = false;

    nextProcess = spawn(command, args, {
        cwd,
        stdio: 'inherit',
        env: customEnv
    });

    nextProcess.on('error', (err) => {
        logtoFile(`[Electron] Failed to start server process: ${err.message}`);
    });

    nextProcess.on('exit', (code, signal) => {
        console.log(`[Electron] Server exited with code ${code}, signal ${signal}`);
        nextProcess = null;
        if (!isServerStopping) {
            console.log('[Electron] Server crashed or stopped unexpectedly. Restarting in 2s...');
            setTimeout(() => {
                launchServer(command, args, cwd, customEnv);
            }, 2000);
        }
    });
}

function startNextDev() {
    console.log('[Electron] Configuring Next.js dev server...');
    const cwd = __dirname.replace(/electron$/, '');
    const env = {
        ...process.env,
        PORT: currentPort,
        NODE_OPTIONS: '--max-old-space-size=1024'
    };
    launchServer('npm', ['run', 'dev'], cwd, env);
}

function launchNodeScript(scriptPath, env) {
    if (nextProcess) return;

    // Reset loop protection if enough time has passed
    if (Date.now() - lastRestartTime > RESTART_WINDOW) {
        restartAttempts = 0;
    }

    if (restartAttempts >= MAX_RESTARTS) {
        const msg = '[Electron] Too many server restarts. Giving up.';
        logtoFile(msg);
        dialog.showErrorBox('Server Error', 'The application server failed to start after multiple attempts. Please check logs.');
        return;
    }

    restartAttempts++;
    lastRestartTime = Date.now();

    logtoFile(`[Electron] Forking server (Attempt ${restartAttempts}): ${scriptPath}`);
    isServerStopping = false;

    try {
        // Use fork to run the server script with Electron's internal Node
        nextProcess = fork(scriptPath, [], {
            env: { ...process.env, ...env },
            cwd: path.dirname(scriptPath),
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
            detached: true
        });

        nextProcess.stdout.on('data', d => logtoFile(`[Next.js stdout] ${d.toString().trim()}`));
        nextProcess.stderr.on('data', d => logtoFile(`[Next.js stderr] ${d.toString().trim()}`));

        nextProcess.on('error', (err) => {
            logtoFile(`[Electron] Failed to fork process: ${err.message}`);
        });

        nextProcess.on('exit', (code, signal) => {
            logtoFile(`[Electron] Server exited with code ${code}, signal ${signal}`);
            nextProcess = null;
            if (!isServerStopping) {
                logtoFile('[Electron] Server crashed or stopped unexpectedly. Restarting in 2s...');
                setTimeout(() => {
                    launchNodeScript(scriptPath, env);
                }, 2000);
            }
        });
    } catch (e) {
        logtoFile(`[Electron] Critical error forking process: ${e.message}`);
        dialog.showErrorBox('Process Error', `Failed to start server process: ${e.message}`);
    }
}

// Helper function to recursively find server.js
function findServerJs(dir) {
    try {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
            const fullPath = path.join(dir, file.name);
            if (file.isDirectory()) {
                const found = findServerJs(fullPath);
                if (found) return found;
            } else if (file.isFile() && file.name === 'server.js') {
                return fullPath;
            }
        }
    } catch (e) {
        // Ignore errors like permission denied for specific directories
        logtoFile(`[Electron] Error reading directory ${dir}: ${e.message}`);
    }
    return null;
}

// Helper function to recursively list directory contents for debugging
function listDirRecursive(dir, indent = 0) {
    const prefix = '  '.repeat(indent);
    try {
        const files = fs.readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
            logtoFile(`${prefix}- ${file.name}`);
            if (file.isDirectory()) {
                listDirRecursive(path.join(dir, file.name), indent + 1);
            }
        }
    } catch (e) {
        logtoFile(`${prefix}- Error listing ${dir}: ${e.message}`);
    }
}

function startNextProd() {
    logtoFile('[Electron] Configuring Next.js prod server...');

    if (isPackaged) {
        // In packaged mode, run the standalone server bundled in app.asar.unpacked
        let serverPath = path.join(process.resourcesPath, 'app.asar.unpacked', '.next', 'standalone', 'server.js');
        logtoFile(`[Electron] Checking server path: ${serverPath}`);

        if (!fs.existsSync(serverPath)) {
            const msg = `[Electron] Standalone server not found at expected path. Searching deeply...`;
            logtoFile(msg);

            // Try to find server.js recursively
            const unpackedRoot = path.join(process.resourcesPath, 'app.asar.unpacked');
            const foundPath = findServerJs(unpackedRoot);

            if (foundPath) {
                logtoFile(`[Electron] FOUND server.js at: ${foundPath}`);
                serverPath = foundPath;
            } else {
                logtoFile(`[Electron] FATAL: server.js not found in ${unpackedRoot}`);
                logtoFile(`[Electron] Directory dump of ${unpackedRoot}:`);
                listDirRecursive(unpackedRoot);

                dialog.showErrorBox('Setup Error', `Core application file missing: server.js\nSee main.log`);
                return false;
            }
        }

        const serverDir = path.dirname(serverPath);
        const nodeModulesPath = path.join(serverDir, 'node_modules');

        const env = {
            ...process.env,
            PORT: currentPort,
            NODE_ENV: 'production',
            HOSTNAME: 'localhost',
            NODE_PATH: nodeModulesPath
        };

        logtoFile(`[Electron] Setting NODE_PATH to: ${nodeModulesPath}`);

        if (fs.existsSync(nodeModulesPath)) {
            logtoFile('[Electron] Verified standalone node_modules exists.');
        } else {
            logtoFile(`[Electron] WARNING: Standalone node_modules NOT FOUND at ${nodeModulesPath}`);
        }

        launchNodeScript(serverPath, env);
        return true;
    } else {
        // In development production simulation, use npm start
        const cwd = __dirname.replace(/electron$/, '');
        const env = {
            ...process.env,
            NODE_ENV: 'production',
            PORT: currentPort,
            NODE_OPTIONS: '--max-old-space-size=512'
        };

        launchServer('npm', ['run', 'start'], cwd, env);
        return true;
    }
}

function stopNextServer() {
    return new Promise(async (resolve) => {
        isServerStopping = true;
        if (healthCheckInterval) {
            clearInterval(healthCheckInterval);
            healthCheckInterval = null;
        }

        if (!nextProcess) {
            resolve();
            return;
        }

        console.log('[Electron] Stopping Next.js server...');

        // Listen for exit
        const exitHandler = () => {
            logtoFile('[Electron] Child process exited.');
            nextProcess = null;
            resolve();
        };

        nextProcess.once('exit', exitHandler);

        // Kill it
        await killProcessTree(nextProcess.pid);

        // Force kill fallback if it doesn't exit in 3s
        setTimeout(() => {
            if (nextProcess) {
                logtoFile('[Electron] Force killing child process...');

                try {
                    nextProcess.removeListener('exit', exitHandler);
                    killProcessTree(nextProcess.pid);
                } catch (e) { }

                nextProcess = null;
                resolve();
            }
        }, 3000);
    });
}

function startHealthCheck() {
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
    }

    console.log('[Electron] Starting health check monitor...');
    healthCheckInterval = setInterval(async () => {
        if (isInstallingUpdate) return;
        if (isServerStopping) return;
        if (!nextProcess) return;

        // Simple fetch check
        try {
            // Using a short timeout to detect hangs
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const res = await fetch(`http://localhost:${currentPort}`, {
                method: 'HEAD',
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok && res.status >= 500) {
                console.warn(`[Health] Server returned error status ${res.status}`);
            }
        } catch (e) {
            console.error(`[Health] Check failed: ${e.message}`);
            // If we can't connect, trigger a restart
            if (nextProcess && !isServerStopping) {
                console.log('[Health] Server appears unresponsive. Restarting...');
                // Kill process, let exit handler restart it
                killProcessTree(nextProcess.pid);
            }
        }
    }, 15000); // Check every 15 seconds
}

async function waitForServer(url, timeout = 30000) {
    const start = Date.now();
    logtoFile(`[Electron] Waiting for server at ${url} (Timeout: ${timeout}ms)...`);

    while (Date.now() - start < timeout) {
        try {
            const res = await fetch(url);
            if (res.ok) {
                logtoFile('[Electron] Server is ready!');
                return true;
            }
        } catch (e) {
            // ignore
        }
        await new Promise(r => setTimeout(r, 500));
    }
    logtoFile('[Electron] Server wait timed out.');
    return false;
}

app.whenReady().then(async () => {
    // Find free port
    const startPort = parseInt(process.env.PORT || '3130', 10);
    currentPort = await findAvailablePort(startPort);
    console.log(`[Electron] Found available port: ${currentPort}`);

    // Start next server (dev or prod based on packaging or NODE_ENV)
    const isProduction = isPackaged || process.env.NODE_ENV === 'production';

    if (isProduction) {
        const success = startNextProd();
        if (!success) {
            app.quit();
            return;
        }
    } else {
        startNextDev();
    }

    // wait until server is ready
    const url = `http://localhost:${currentPort}`;
    const ready = await waitForServer(url);

    if (!ready) {
        const msg = 'Next server failed to start (Timeout 30s)';
        logtoFile(msg);
        await dialog.showMessageBox({
            type: 'error',
            title: 'Startup Error',
            message: 'The application service failed to initialize.',
            detail: 'Please check the log file in your user data folder:\n' + LOG_PATH
        });
        app.quit();
        return;
    }

    if (process.env.NEXT_PUBLIC_NX_CLOUD_USERNAME && process.env.NEXT_PUBLIC_NX_CLOUD_PASSWORD) {
        createMainWindow();
    } else {
        createSetupWindow();
    }

    // Start monitoring only after initial successful launch
    startHealthCheck();

    autoUpdater.checkForUpdates();
});

autoUpdater.on('update-available', (info) => {
    logtoFile(`[AutoUpdater] Update available: Version ${info.version}`);
    const win = mainWindow || setupWindow;
    if (win) win.webContents.send('update-available', info);
});

autoUpdater.on('update-not-available', (info) => {
    logtoFile('[AutoUpdater] No Update available.');
    const win = mainWindow || setupWindow;
    if (win) win.webContents.send('update-not-available', info);
});

autoUpdater.on('download-progress', (progressObj) => {
    const win = mainWindow || setupWindow;
    if (win) win.webContents.send('download-progress', progressObj);
});

autoUpdater.on('update-downloaded', async (info) => {
    logtoFile(`[AutoUpdater] Update downloaded: ${info.version}`);

    const win = mainWindow || setupWindow;

    const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded. Restart to apply update?`,
        buttons: ['Restart', 'Later'],
        defaultId: 0
    });

    if (response === 0) {
        isInstallingUpdate = true;

        await stopNextServer();

        process.nextTick(() => {
            autoUpdater.quitAndInstall(false, true);
        });
    }
});

autoUpdater.on('error', (err) => {
    logtoFile(`[AutoUpdater] Error: ${err.message}`);
    const win = mainWindow || setupWindow;
    if (win) win.webContents.send('update-error', err.message);
});

let isAppQuitting = false;

app.on('before-quit', async (e) => {
    if (isInstallingUpdate) {
        logtoFile('[Electron] Update install quit. Skipping cleanup.');
        return;
    }

    if (isAppQuitting) return;

    e.preventDefault();
    isAppQuitting = true;

    logtoFile('[Electron] Intercepted quit for cleanup...');

    await stopNextServer();

    logtoFile('[Electron] Cleanup done. Quitting now.');

    app.exit(0);
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});