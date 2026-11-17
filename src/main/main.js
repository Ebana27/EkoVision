const { app, BrowserWindow, desktopCapturer, dialog, ipcMain, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const fs = require('node:fs');
const { PeerServer } = require('peer');

const PORT_SIGNAL_DEPART = 9000;
const PORT_WEB_DEPART = 8000;
const NOMBRE_ESSAIS = 20;
const SIGNAL_PATH = '/myapp';
const DUREE_SPLASH = 3500;
const ICONE = path.join(__dirname, '../../resources/icon.png');
const RACINE = path.join(__dirname, '../..');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png'
};

const PAGES_WEB = {
  '/': 'src/renderer/web/index.html',
  '/web.js': 'src/renderer/web/web.js',
  '/main.css': 'src/renderer/main.css',
  '/outils.js': 'src/renderer/outils.js',
  '/logo.png': 'src/renderer/assets/ekovision-logo.png',
  '/peerjs.min.js': 'node_modules/peerjs/dist/peerjs.min.js'
};

app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');

let mainWindow = null;
let splash = null;
let debutSplash = 0;
let serveurPeer = null;
let serveurWeb = null;
let portSignal = null;
let portWeb = null;

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

async function trouverPortLibre(depart) {
  for (let i = 0; i < NOMBRE_ESSAIS; i++) {
    const port = depart + i;
    if (await portEstLibre(port)) return port;
  }
  return null;
}

function demarrerServeurWeb(port) {
  serveurWeb = http.createServer(function (requete, reponse) {
    const adresse = requete.url.split('?')[0];

    if (adresse === '/config.json') {
      reponse.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      reponse.end(JSON.stringify({ signalPort: portSignal }));
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(PAGES_WEB, adresse)) {
      reponse.writeHead(404);
      reponse.end('Page introuvable');
      return;
    }

    const fichier = PAGES_WEB[adresse];
    fs.readFile(path.join(RACINE, fichier), function (erreur, contenu) {
      if (erreur) {
        reponse.writeHead(500);
        reponse.end('Erreur du serveur');
        return;
      }
      reponse.writeHead(200, { 'Content-Type': TYPES[path.extname(fichier)] });
      reponse.end(contenu);
    });
  });

  serveurWeb.on('error', function (erreur) {
    console.error('Serveur web impossible :', erreur.message);
    portWeb = null;
  });

  serveurWeb.listen(port, '0.0.0.0');
  console.log('Page web des élèves prête sur le port ' + port);
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

ipcMain.handle('ekovision:get-web-port', function () {
  return portWeb;
});

app.whenReady().then(async function () {
  creerSplash();

  portSignal = await trouverPortLibre(PORT_SIGNAL_DEPART);

  if (portSignal === null) {
    console.error('Aucun port libre entre ' + PORT_SIGNAL_DEPART + ' et ' + (PORT_SIGNAL_DEPART + NOMBRE_ESSAIS - 1));
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

  portWeb = await trouverPortLibre(PORT_WEB_DEPART);

  if (portWeb === null) {
    console.error('Aucun port libre entre ' + PORT_WEB_DEPART + ' et ' + (PORT_WEB_DEPART + NOMBRE_ESSAIS - 1));
  } else {
    demarrerServeurWeb(portWeb);
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
  if (serveurWeb) {
    try {
      serveurWeb.close();
    } catch (erreur) {}
  }
  if (process.platform !== 'darwin') app.quit();
});