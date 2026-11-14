function setEtat(element, texte, type) {
  element.className = 'etat ' + (type || '');
  element.querySelector('span').textContent = texte;
}

function ipLocaleValide(ip) {
  const parties = ip.split('.');
  if (parties.length !== 4) return false;
  const n = parties.map(Number);
  for (let i = 0; i < 4; i++) {
    if (!/^\d{1,3}$/.test(parties[i]) || n[i] > 255) return false;
  }
  return n[0] === 10 || n[0] === 127 || (n[0] === 192 && n[1] === 168) || (n[0] === 172 && n[1] >= 16 && n[1] <= 31);
}

function ajouterStyle(css) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
}

function lireAdresse(texte) {
  const parties = texte.trim().split(':');
  if (parties.length > 2) return null;
  if (!ipLocaleValide(parties[0])) return null;
  let port = 9000;
  if (parties.length === 2) {
    if (!/^\d{1,5}$/.test(parties[1])) return null;
    port = Number(parties[1]);
    if (port < 1024 || port > 65535) return null;
  }
  return { ip: parties[0], port: port };
}
