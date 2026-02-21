import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFile } from 'node:fs/promises';

// Handle dirname
const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

// Global error handling to capture startup crashes
process.on('uncaughtException', (error: any) => {
    dialog.showErrorBox('Application Error', error.stack || error.message);
});

// The built directory structure
process.env.APP_ROOT = path.join(_dirname, '..')

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null = null

function createWindow() {
    try {
        win = new BrowserWindow({
            width: 1200,
            height: 800,
            show: false, // Don't show until ready
            icon: path.join(process.env.VITE_PUBLIC || '', 'vite.svg'),
            webPreferences: {
                preload: path.join(_dirname, 'preload.js'),
                nodeIntegration: false,
                contextIsolation: true,
            },
        })

        // Graceful window showing
        win.once('ready-to-show', () => {
            win?.show()
        })

        // Test active push message to Renderer-process.
        win.webContents.on('did-finish-load', () => {
            win?.webContents.send('main-process-message', (new Date).toLocaleString())
        })

        if (VITE_DEV_SERVER_URL) {
            win.loadURL(VITE_DEV_SERVER_URL)
        } else {
            const indexPath = path.join(RENDERER_DIST, 'index.html')
            win.loadFile(indexPath).catch((err: any) => {
                dialog.showErrorBox('Load Error', `Failed to load index.html: ${err.message}\nPath: ${indexPath}`);
            });
        }
    } catch (error: any) {
        dialog.showErrorBox('Window Creation Error', error.message);
    }
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
        win = null
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

app.whenReady().then(createWindow).catch((err: any) => {
    dialog.showErrorBox('Initialization Error', err.message);
});

ipcMain.handle('save-xlsx-download', async (_event, payload: { fileName: string; base64: string }) => {
    try {
        const safeName = (payload.fileName || 'export.xlsx').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
        const downloadsDir = app.getPath('downloads')
        const filePath = path.join(downloadsDir, safeName)
        const buffer = Buffer.from(payload.base64, 'base64')
        await writeFile(filePath, buffer)
        return { ok: true, filePath }
    } catch (error: any) {
        return { ok: false, error: error?.message || 'Failed to save file' }
    }
})
