(() => {
  const $ = (id) => document.getElementById(id);
  const form = $('join-form'); const joinBtn = $('join-btn'); const leaveBtn = $('leave-btn');
  const status = $('status'); const streamStatus = $('stream-status'); const video = $('screen');
  let peer; let dataConn; let mediaCall; let connected = false; let pointerThrottle = 0;
  const studentName = () => `${$('first-name').value.trim()} ${$('last-name').value.trim()}`.trim();
  function setStatus(el, text, kind = '') { el.className = `status ${kind}`; el.querySelector('span').textContent = text; }
  function isLanIPv4(value) {
    const parts = value.split('.'); const octets = parts.map(Number);
    if (parts.length !== 4 || parts.some((part, i) => !/^\d{1,3}$/.test(part) || octets[i] < 0 || octets[i] > 255)) return false;
    return octets[0] === 10 || octets[0] === 127 || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 169 && octets[1] === 254);
  }
  function colorFor(id) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return `hsl(${Math.abs(h) % 360} 88% 66%)`; }
  function drawPointer(id, info) {
    const overlay = $('laser-overlay'); let el = document.getElementById(`remote-${CSS.escape(id)}`);
    if (!el) { el = document.createElement('div'); el.id = `remote-${id}`; el.className = 'laser'; el.style.setProperty('--laser-color', colorFor(id)); const label = document.createElement('span'); label.className = 'laser-label'; el.append(label); overlay.append(el); }
    el.style.left = `${Math.max(0, Math.min(1, info.x)) * 100}%`; el.style.top = `${Math.max(0, Math.min(1, info.y)) * 100}%`; el.querySelector('.laser-label').textContent = info.name || 'Élève';
    clearTimeout(el._hideTimer); if (!info.active) el._hideTimer = setTimeout(() => el.remove(), 900);
  }
  function handleData(message) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'pointer') drawPointer(message.id, message);
    if (message.type === 'roster') {
      const me = dataConn?.peer;
      for (const student of message.students || []) if (student.id !== me) drawPointer(student.id, { x: 0.015, y: 0.04, active: false, name: student.name });
    }
  }
  function connect(event) {
    event.preventDefault(); if (!form.reportValidity()) return;
    const host = $('teacher-host').value.trim();
    if (!isLanIPv4(host)) { setStatus(status, 'Entrez une adresse IPv4 privée du réseau local.', 'error'); return; }
    joinBtn.disabled = true; setStatus(status, 'Connexion au réseau local…');
    try {
      if (typeof Peer === 'undefined') throw new Error('PeerJS ne se charge pas. Installez les dépendances avec npm install.');
      peer = new Peer(undefined, { host, port: 9000, path: '/myapp', secure: false, debug: 1, config: { iceServers: [] } });
      peer.on('open', () => {
        dataConn = peer.connect('professeur-id', { reliable: true, serialization: 'json' });
        dataConn.on('open', () => { connected = true; dataConn.send({ type: 'hello', firstName: $('first-name').value.trim(), lastName: $('last-name').value.trim() }); setStatus(status, 'Connecté à la classe', 'online'); joinBtn.hidden = true; leaveBtn.hidden = false; $('first-name').disabled = true; $('last-name').disabled = true; $('teacher-host').disabled = true; });
        dataConn.on('data', handleData); dataConn.on('close', () => { if (connected) { setStatus(status, 'Connexion interrompue', 'error'); disconnect(false); } });
        dataConn.on('error', (err) => setStatus(status, `Erreur de connexion : ${err.type || err.message}`, 'error'));
      });
      peer.on('call', (call) => { mediaCall = call; call.on('stream', (stream) => { video.srcObject = stream; $('placeholder').hidden = true; setStatus(streamStatus, 'Flux reçu', 'online'); video.play().catch(() => {}); }); call.on('close', () => { video.srcObject = null; $('placeholder').hidden = false; setStatus(streamStatus, 'Flux interrompu'); }); call.answer(); });
      peer.on('error', (err) => { setStatus(status, err.type === 'peer-unavailable' ? 'Professeur introuvable. Vérifiez son IP et son partage.' : `Erreur réseau : ${err.type || err.message}`, 'error'); joinBtn.disabled = false; });
      peer.on('disconnected', () => setStatus(status, 'Signalisation interrompue', 'error'));
    } catch (error) { setStatus(status, error.message, 'error'); joinBtn.disabled = false; }
  }
  function normalizedPoint(event) {
    const rect = video.getBoundingClientRect();
    const vw = video.videoWidth || rect.width; const vh = video.videoHeight || rect.height;
    if (!vw || !vh || !rect.width || !rect.height) return null;
    const scale = Math.min(rect.width / vw, rect.height / vh);
    const width = vw * scale; const height = vh * scale;
    const left = rect.left + (rect.width - width) / 2; const top = rect.top + (rect.height - height) / 2;
    const x = (event.clientX - left) / width; const y = (event.clientY - top) / height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  }
  function sendPointer(event, active = true) {
    if (!dataConn?.open) return;
    const now = performance.now(); if (active && now - pointerThrottle < 35) return; pointerThrottle = now;
    const point = active ? normalizedPoint(event) : { x: 0, y: 0 };
    dataConn.send({ type: 'pointer', active: !!point && active, x: point?.x ?? 0, y: point?.y ?? 0 });
  }
  function disconnect(update = true) {
    connected = false;
    if (mediaCall) { try { mediaCall.close(); } catch (_) {} mediaCall = null; }
    if (dataConn) { try { dataConn.close(); } catch (_) {} dataConn = null; }
    if (peer) { try { peer.destroy(); } catch (_) {} peer = null; }
    video.srcObject = null; $('placeholder').hidden = false; $('laser-overlay').replaceChildren();
    setStatus(streamStatus, 'En attente de connexion'); $('first-name').disabled = false; $('last-name').disabled = false; $('teacher-host').disabled = false;
    joinBtn.hidden = false; joinBtn.disabled = false; leaveBtn.hidden = true;
    if (update) setStatus(status, 'Déconnecté');
  }
  form.addEventListener('submit', connect); leaveBtn.addEventListener('click', () => disconnect());
  const wrap = $('video-wrap');
  wrap.addEventListener('pointermove', (event) => { const p = normalizedPoint(event); if (p) drawPointer('mine', { ...p, name: studentName(), active: true }); sendPointer(event, true); });
  wrap.addEventListener('pointerleave', (event) => { document.getElementById('remote-mine')?.remove(); sendPointer(event, false); });
  $('display-name').textContent = '—'; $('first-name').addEventListener('input', () => { $('display-name').textContent = studentName() || '—'; }); $('last-name').addEventListener('input', () => { $('display-name').textContent = studentName() || '—'; });
  window.addEventListener('beforeunload', () => disconnect(false));
})();
