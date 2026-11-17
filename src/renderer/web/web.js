ajouterStyle(`
.page{max-width:720px}
.champ{display:flex;flex-direction:column;gap:4px;margin-bottom:12px}
.champ label{font-size:12px;color:var(--muted)}
.champ input{height:44px;border:1px solid var(--line);border-radius:6px;padding:0 10px;outline:none;font-size:16px}
.champ input:focus{border-color:var(--green)}
#formulaire .btn{width:100%;height:46px;margin-bottom:12px}
.ecran{margin-bottom:16px}
#plein-ecran{position:absolute;top:10px;right:10px;height:34px;padding:0 12px;font-size:12px}
.fichier{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 0;border-top:1px solid var(--line);font-size:13px}
.fichier span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fichier .btn{height:34px;padding:0 12px;font-size:12px;flex:none}
@media(max-width:600px){.page{padding:16px}}
`);

const TAILLE_MAX = 20 * 1024 * 1024;

const formulaire = document.getElementById('formulaire');
const champPrenom = document.getElementById('prenom');
const champNom = document.getElementById('nom');
const boutonRejoindre = document.getElementById('rejoindre');
const boutonQuitter = document.getElementById('quitter');
const etat = document.getElementById('etat');
const ecran = document.getElementById('ecran');
const video = document.getElementById('video');
const vide = document.getElementById('vide');
const boutonPleinEcran = document.getElementById('plein-ecran');
const listeFichiers = document.getElementById('liste-fichiers');
const aucunFichier = document.getElementById('aucun-fichier');

let peer = null;
let connexion = null;

function verrouiller(oui) {
  champPrenom.disabled = oui;
  champNom.disabled = oui;
}

function formaterTaille(octets) {
  if (octets < 1024 * 1024) return Math.max(1, Math.round(octets / 1024)) + ' Ko';
  return (octets / (1024 * 1024)).toFixed(1) + ' Mo';
}

function ajouterFichier(message) {
  const donnees = message.donnees;
  if (!donnees || donnees.byteLength > TAILLE_MAX) return;

  const nom = String(message.nom).replace(/[\\/:*?"<>|]/g, '_').slice(0, 100);
  const url = URL.createObjectURL(new Blob([donnees]));

  const ligne = document.createElement('div');
  ligne.className = 'fichier';

  const texte = document.createElement('span');
  texte.textContent = nom + ' (' + formaterTaille(donnees.byteLength) + ')';

  const bouton = document.createElement('button');
  bouton.className = 'btn clair';
  bouton.type = 'button';
  bouton.textContent = 'Télécharger';
  bouton.addEventListener('click', function () {
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = nom;
    lien.click();
  });

  ligne.append(texte, bouton);
  listeFichiers.append(ligne);
  aucunFichier.hidden = true;
}

function recevoir(message) {
  if (message && message.type === 'fichier') ajouterFichier(message);
}

function afficherFlux(flux) {
  video.srcObject = flux;
  vide.hidden = true;
  boutonPleinEcran.hidden = false;
  video.play().catch(function () {});
}

function effacerFlux() {
  video.srcObject = null;
  vide.hidden = false;
  boutonPleinEcran.hidden = true;
  if (document.fullscreenElement) document.exitFullscreen();
}

function quitter() {
  const ancienPeer = peer;
  peer = null;
  connexion = null;
  if (ancienPeer) ancienPeer.destroy();
  effacerFlux();
  verrouiller(false);
  boutonRejoindre.hidden = false;
  boutonRejoindre.disabled = false;
  boutonQuitter.hidden = true;
}

async function rejoindre(event) {
  event.preventDefault();
  boutonRejoindre.disabled = true;
  setEtat(etat, 'Connexion…', '');

  let config = null;
  try {
    const reponse = await fetch('/config.json');
    config = await reponse.json();
  } catch (erreur) {
    setEtat(etat, 'Impossible de joindre le professeur.', 'erreur');
    boutonRejoindre.disabled = false;
    return;
  }

  if (!config.signalPort) {
    setEtat(etat, 'La classe n’est pas disponible pour le moment.', 'erreur');
    boutonRejoindre.disabled = false;
    return;
  }

  peer = new Peer(undefined, {
    host: location.hostname,
    port: config.signalPort,
    path: '/myapp',
    secure: false,
    config: { iceServers: [] }
  });

  peer.on('open', function () {
    connexion = peer.connect('professeur-id', { reliable: true });

    connexion.on('open', function () {
      connexion.send({ type: 'hello', prenom: champPrenom.value.trim(), nom: champNom.value.trim() });
      setEtat(etat, 'Connecté à la classe', 'ok');
      boutonRejoindre.hidden = true;
      boutonQuitter.hidden = false;
      verrouiller(true);
    });

    connexion.on('data', recevoir);

    connexion.on('close', function () {
      if (peer) {
        quitter();
        setEtat(etat, 'Connexion interrompue', 'erreur');
      }
    });
  });

  peer.on('call', function (appel) {
    appel.answer();
    appel.on('stream', afficherFlux);
    appel.on('close', effacerFlux);
  });

  peer.on('error', function (erreur) {
    const texte = erreur.type === 'peer-unavailable'
      ? 'Professeur introuvable. Il doit d’abord démarrer le partage.'
      : 'Erreur réseau : ' + erreur.type;
    quitter();
    setEtat(etat, texte, 'erreur');
  });
}

function pleinEcran() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
    return;
  }
  if (ecran.requestFullscreen) ecran.requestFullscreen();
  else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
}

formulaire.addEventListener('submit', rejoindre);
boutonQuitter.addEventListener('click', function () {
  quitter();
  setEtat(etat, 'Déconnecté', '');
});
boutonPleinEcran.addEventListener('click', pleinEcran);
window.addEventListener('beforeunload', function () {
  if (peer) peer.destroy();
});