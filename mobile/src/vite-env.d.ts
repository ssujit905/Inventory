/// <reference types="vite/client" />
/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
    interface ProcessEnv {
        readonly APP_ROOT: string
        /**
         * The public directory path relative to the project root.
         */
        readonly VITE_PUBLIC: string
    }
}

interface Window {
    ipcRenderer: import('electron').IpcRenderer
}
