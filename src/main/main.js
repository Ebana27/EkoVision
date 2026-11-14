const { app, BrowserWindow, desktopCapturer, dialog, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const net = require('node:net');
const { PeerServer } = require('peer');

const PORT_DEPART = 9000;
const NOMBRE_ESSAIS = 20;
const SIGNAL_PATH = '/myapp';
const DUREE_SPLASH = 1800;
const ICONE = path.join(__dirname, '../../resources/icon.png');

let mainWindow = null;
let splash = null;
let debutSplash = 0;
let serveurPeer = null;
let portSignal = null;

function portEstLibre(port) {
  return new Promise(function (resolve) {
    const serveur = net.createServer();
    serveur.once('error', function () {
      resolve(false);
    });
    serveur.once('listening', function () {
      serveur.close(function () {
        resolve(true);
      });
    });
    serveur.listen(port, '0.0.0.0');
  });
}

async function trouverPortLibre() {
  for (let i = 0; i < NOMBRE_ESSAIS; i++) {
    const port = PORT_DEPART + i;
    if (await portEstLibre(port)) return port;
  }
  return null;
}

function creerSplash() {
  splash = new BrowserWindow({
    width: 420,
    height: 300,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    center: true,
    backgroundColor: '#ffffff',
    icon: ICONE,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  splash.loadFile(path.join(__dirname, '../renderer/splash.html'));
  splash.on('closed', function () {
    splash = null;
  });
  debutSplash = Date.now();
}

function fermerSplash() {
  if (splash) splash.close();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 760,
    minHeight: 600,
    show: false,
    backgroundColor: '#ffffff',
    title: 'EkoVision',
    icon: ICONE,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', function () {
    const reste = Math.max(0, DUREE_SPLASH - (Date.now() - debutSplash));
    setTimeout(function () {
      fermerSplash();
      if (mainWindow) mainWindow.show();
    }, reste);
  });

  mainWindow.webContents.setWindowOpenHandler(function ({ url }) {
    if (url.startsWith('https://github.com/')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function verifierMisesAJour() {
  if (!app.isPackaged) return;

  autoUpdater.on('update-downloaded', function (info) {
    dialog.showMessageBox({
      type: 'info',
      title: 'Mise à jour',
      message: 'La version ' + info.version + ' est prête.',
      detail: 'Redémarrer EkoVision maintenant pour l’installer ?',
      buttons: ['Redémarrer', 'Plus tard'],
      defaultId: 0,
      cancelId: 1
    }).then(function (reponse) {
      if (reponse.response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on('error', function (erreur) {
    console.error('Mise à jour impossible :', erreur.message);
  });

  autoUpdater.checkForUpdates().catch(function () {});
}

ipcMain.handle('ekovision:get-screen-sources', async function () {
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: false
  });
  return sources.map(function (source) {
    return { id: source.id, name: source.name };
  });
});

ipcMain.handle('ekovision:get-signal-port', function () {
  return portSignal;
});

app.whenReady().then(async function () {
  creerSplash();

  portSignal = await trouverPortLibre();

  if (portSignal === null) {
    console.error('Aucun port libre entre ' + PORT_DEPART + ' et ' + (PORT_DEPART + NOMBRE_ESSAIS - 1));
  } else {
    try {
      serveurPeer = PeerServer({
        port: portSignal,
        path: SIGNAL_PATH,
        host: '0.0.0.0',
        allow_discovery: false
      });
      console.log('Signalisation PeerJS prête sur le port ' + portSignal);
    } catch (erreur) {
      console.error('Impossible de lancer PeerServer :', erreur.message);
      portSignal = null;
    }
  }

  createWindow();
  verifierMisesAJour();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (serveurPeer) {
    try {
      serveurPeer.close();
    } catch (erreur) {}
  }
  if (process.platform !== 'darwin') app.quit();
});