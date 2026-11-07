const { app, BrowserWindow, desktopCapturer, ipcMain, shell } = require('electron');
const path = require('node:path');
const { PeerServer } = require('peer');

const SIGNAL_PORT = 9000;
const SIGNAL_PATH = '/myapp';
let mainWindow;
let peerHttpServer;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 760,
    minHeight: 600,
    backgroundColor: '#101b2b',
    title: 'EkoVision',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://github.com/')) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

ipcMain.handle('ekovision:get-screen-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: false
  });
  return sources.map(({ id, name, thumbnail }) => ({
    id,
    name,
    thumbnail: thumbnail.toDataURL()
  }));
});

app.whenReady().then(() => {
  // Signalisation hébergée sur l'ordinateur du professeur : aucune dépendance cloud.
  PeerServer({
    port: SIGNAL_PORT,
    path: SIGNAL_PATH,
    host: '0.0.0.0',
    allow_discovery: false
  }, (server) => {
    peerHttpServer = server;
    console.log(`Signalisation PeerJS prête sur le port ${SIGNAL_PORT}`);
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (peerHttpServer && peerHttpServer.listening) peerHttpServer.close();
  if (process.platform !== 'darwin') app.quit();
});
