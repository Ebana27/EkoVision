ajouterStyle(`
.barre{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px;margin-bottom:20px}
.champ-ip{display:flex;flex-direction:column;gap:4px}
.champ-ip label{font-size:12px;color:var(--muted)}
.champ-ip input{height:40px;width:260px;border:1px solid var(--line);border-radius:6px;padding:0 10px;outline:none}
.champ-ip input:focus{border-color:var(--green)}
.barre .etat{height:40px;margin-left:auto}
.grille{display:grid;grid-template-columns:minmax(0,1fr) 280px;gap:20px;align-items:start}
.ligne-eleve{padding:8px 0;border-top:1px solid var(--line);font-size:13px}
input[type=file]{width:100%;margin-bottom:12px;font-size:12px}
#envoyer{width:100%;margin-bottom:12px}
.adresse-web{margin:8px 0 0;font-weight:600;word-break:break-all;user-select:all}
@media(max-width:800px){.grille{grid-template-columns:1fr}.barre .etat{margin-left:0}}
`);

const TAILLE_MAX = 20 * 1024 * 1024;

const champIp = document.getElementById('ip');
const boutonDemarrer = document.getElementById('demarrer');
const boutonArreter = document.getElementById('arreter');
const etat = document.getElementById('etat');
const apercu = document.getElementById('apercu');
const vide = document.getElementById('vide');
const listeEleves = document.getElementById('liste-eleves');
const nombre = document.getElementById('nombre');
const champFichier = document.getElementById('fichier');
const boutonEnvoyer = document.getElementById('envoyer');
const etatFichier = document.getElementById('etat-fichier');
const adresseWeb = document.getElementById('adresse-web');

let peer = null;
let flux = null;
let port = null;
let portWeb = null;
const connexions = {};
const eleves = {};

function afficherEleves() {
  listeEleves.replaceChildren();
  const ids = Object.keys(eleves);
  nombre.textContent = ids.length;
  if (ids.length === 0) {
    const p = document.createElement('p');
    p.className = 'aucun';
    p.textContent = 'Aucun élève pour le moment';
    listeEleves.append(p);
    return;
  }
  for (const id of ids) {
    const ligne = document.createElement('div');
    ligne.className = 'ligne-eleve';
    ligne.textContent = eleves[id];
    listeEleves.append(ligne);
  }
}

function envoyerATous(message) {
  for (const id in connexions) {
    if (connexions[id].open) connexions[id].send(message);
  }
}

function recevoirConnexion(conn) {
  connexions[conn.peer] = conn;

  conn.on('data', function (message) {
    if (message && message.type === 'hello') {
      const nomComplet = (String(message.prenom || '') + ' ' + String(message.nom || '')).trim();
      eleves[conn.peer] = nomComplet || 'Élève';
      afficherEleves();
      if (flux) peer.call(conn.peer, flux);
    }
  });

  conn.on('close', function () {
    delete connexions[conn.peer];
    delete eleves[conn.peer];
    afficherEleves();
  });
}

async function demarrer() {
  const ip = champIp.value.trim();
  if (!ipLocaleValide(ip)) {
    setEtat(etat, 'Entrez une adresse IP locale valide.', 'erreur');
    return;
  }
  if (typeof Peer === 'undefined') {
    setEtat(etat, 'PeerJS introuvable : lancez npm install.', 'erreur');
    return;
  }

  boutonDemarrer.disabled = true;
  setEtat(etat, 'Préparation de la capture…', '');

  try {
    port = await window.ekoVision.getSignalPort();
    if (!port) throw new Error('Aucun port libre trouvé (9000 à 9019).');
    portWeb = await window.ekoVision.getWebPort();
    const sources = await window.ekoVision.getScreenSources();
    if (sources.length === 0) throw new Error('Aucun écran détecté.');
    flux = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sources[0].id,
          maxFrameRate: 30
        }
      }
    });
  } catch (erreur) {
    setEtat(etat, erreur.message || 'Impossible de démarrer le partage.', 'erreur');
    boutonDemarrer.disabled = false;
    return;
  }

  apercu.srcObject = flux;
  vide.hidden = true;
  flux.getVideoTracks()[0].addEventListener('ended', arreter);

  peer = new Peer('professeur-id', {
    host: ip,
    port: port,
    path: '/myapp',
    secure: false,
    config: { iceServers: [] }
  });

  peer.on('open', function () {
    setEtat(etat, 'Partage actif — donnez cette adresse aux élèves : ' + ip + ':' + port, 'ok');
    adresseWeb.textContent = portWeb ? 'http://' + ip + ':' + portWeb : 'Indisponible';
    boutonArreter.disabled = false;
  });

  peer.on('connection', recevoirConnexion);

  peer.on('error', function (erreur) {
    arreter();
    setEtat(etat, 'Erreur réseau : ' + erreur.type, 'erreur');
  });
}

function arreter() {
  for (const id in connexions) connexions[id].close();
  for (const id in connexions) delete connexions[id];
  for (const id in eleves) delete eleves[id];
  afficherEleves();

  if (peer) {
    peer.destroy();
    peer = null;
  }
  if (flux) {
    flux.getTracks().forEach(function (piste) { piste.stop(); });
    flux = null;
  }

  apercu.srcObject = null;
  vide.hidden = false;
  boutonDemarrer.disabled = false;
  boutonArreter.disabled = true;
  adresseWeb.textContent = '—';
  setEtat(etat, 'Partage arrêté', '');
}

async function envoyerFichier() {
  const fichier = champFichier.files[0];
  if (!fichier) {
    setEtat(etatFichier, 'Choisissez un fichier.', 'erreur');
    return;
  }
  if (fichier.size > TAILLE_MAX) {
    setEtat(etatFichier, 'Fichier trop lourd (maximum 20 Mo).', 'erreur');
    return;
  }
  const nombreEleves = Object.keys(connexions).length;
  if (!peer || nombreEleves === 0) {
    setEtat(etatFichier, 'Aucun élève connecté.', 'erreur');
    return;
  }

  boutonEnvoyer.disabled = true;
  setEtat(etatFichier, 'Envoi en cours…', '');
  const donnees = await fichier.arrayBuffer();
  envoyerATous({ type: 'fichier', nom: fichier.name, donnees: donnees });
  setEtat(etatFichier, 'Envoyé à ' + nombreEleves + ' élève(s).', 'ok');
  champFichier.value = '';
  boutonEnvoyer.disabled = false;
}

boutonDemarrer.addEventListener('click', demarrer);
boutonArreter.addEventListener('click', arreter);
boutonEnvoyer.addEventListener('click', envoyerFichier);
window.addEventListener('beforeunload', function () {
  if (peer) peer.destroy();
});