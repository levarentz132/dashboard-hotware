# Node Binaries Folder

This folder contains bundled executables that are packaged with the Electron application.

## Current Contents

- `node.exe` - Bundled Node.js runtime for the standalone server
- `ffmpeg.exe` - **REQUIRED** for video processing

## Setup Instructions

### FFmpeg Installation

**FFmpeg is required for video download and conversion features to work in the packaged Electron app.**

1. **Download FFmpeg for Windows:**
   - Go to: https://github.com/BtbN/FFmpeg-Builds/releases
   - Download the latest `ffmpeg-master-latest-win64-gpl.zip`
   - OR use direct link: https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip

2. **Extract and Copy:**
   - Extract the downloaded ZIP file
   - Navigate to `ffmpeg-master-latest-win64-gpl/bin/`
   - Copy `ffmpeg.exe` to this folder (`node-bin/`)

3. **Verify:**
   - Your `node-bin/` folder should contain:
     - `node.exe`
     - `ffmpeg.exe`
     - `README.md` (this file)

## Why is this needed?

In development mode (`npm run dev`), the app uses FFmpeg from your system PATH. However, when packaged as an .exe, the app needs its own bundled copy of FFmpeg to ensure:

- ✅ Consistent behavior across all installations
- ✅ Fast video processing performance
- ✅ No dependency on user's system configuration
- ✅ Reliable operation in restricted environments

## Build Process

When running `npm run dist`, electron-builder automatically:
1. Copies the entire `node-bin/` folder to `resources/node-bin/` in the packaged app
2. The app detects it's running in Electron and uses the bundled `ffmpeg.exe`
3. This is configured in `package.json` under `build.extraResources`

## Troubleshooting

If video downloads are slow in the packaged .exe:
- Verify `ffmpeg.exe` exists in this folder before building
- Check `resources/node-bin/ffmpeg.exe` exists in the installed app
- Check logs in `%APPDATA%/Hotware Dashboard/main.log` for FFmpeg path messages
