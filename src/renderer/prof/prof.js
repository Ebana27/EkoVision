(() => {
  const $ = (id) => document.getElementById(id);
  const startBtn = $('start-btn'); const stopBtn = $('stop-btn');
  const status = $('status'); const streamStatus = $('stream-status');
  const preview = $('preview'); const placeholder = $('placeholder');
  const peers = new Map(); const students = new Map(); const pointers = new Map();
  let peer; let localStream; let running = false;

  function setStatus(el, text, kind = '') { el.className = `status ${kind}`; el.querySelector('span').textContent = text; }
  function isLanIPv4(value) {
    const octets = value.split('.').map(Number);
    if (octets.length !== 4 || octets.some((part, i) => !/^\d{1,3}$/.test(value.split('.')[i]) || part < 0 || part > 255)) return false;
    return octets[0] === 10 || octets[0] === 127 || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 169 && octets[1] === 254);
  }
  function makePeer(host) {
    if (typeof Peer === 'undefined') throw new Error('PeerJS ne se charge pas. Installez les dépendances avec npm install.');
    return new Peer('professeur-id', { host, port: 9000, path: '/myapp', secure: false, debug: 1, config: { iceServers: [] } });
  }
  function colorFor(id) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0; return `hsl(${Math.abs(h) % 360} 88% 66%)`; }

  function renderStudents() {
    const list = $('student-list'); list.replaceChildren();
    if (!students.size) { const empty = document.createElement('span'); empty.className = 'empty-video'; empty.textContent = 'Aucun élève pour le moment'; list.append(empty); return; }
    for (const [id, info] of students) {
      const chip = document.createElement('span'); chip.className = 'student-chip'; chip.textContent = info.name || `Élève ${id.slice(-4)}`; list.append(chip);
    }
  }
  function drawPointer(id, info) {
    let el = pointers.get(id);
    if (!el) {
      el = document.createElement('div'); el.className = 'laser'; el.style.setProperty('--laser-color', colorFor(id));
      const label = document.createElement('span'); label.className = 'laser-label'; el.append(label);
      $('laser-overlay').append(el); pointers.set(id, el);
    }
    el.style.left = `${Math.max(0, Math.min(1, info.x)) * 100}%`;
    el.style.top = `${Math.max(0, Math.min(1, info.y)) * 100}%`;
    el.querySelector('.laser-label').textContent = info.name || 'Élève';
    el.hidden = false;
    clearTimeout(el._hideTimer);
    if (!info.active) el._hideTimer = setTimeout(() => { el.hidden = true; }, 800);
  }
  function relay(message, exceptId) {
    for (const [id, conn] of peers) if (id !== exceptId && conn.open) { try { conn.send(message); } catch (_) {} }
  }
  function handleConnection(conn) {
    peers.set(conn.peer, conn);
    conn.on('data', (message) => {
      if (!message || typeof message !== 'object') return;
      if (message.type === 'hello') {
        const student = { name: `${String(message.firstName || '').trim()} ${String(message.lastName || '').trim()}`.trim() || 'Élève' };
        students.set(conn.peer, student); renderStudents();
        if (localStream) { try { peer.call(conn.peer, localStream, { metadata: { name: 'EkoVision' } }); } catch (e) { console.error(e); } }
        relay({ type: 'roster', students: [...students].map(([id, s]) => ({ id, name: s.name })) });
      } else if (message.type === 'pointer') {
        const info = { x: Number(message.x), y: Number(message.y), active: !!message.active, name: students.get(conn.peer)?.name || 'Élève' };
        if (Number.isFinite(info.x) && Number.isFinite(info.y)) { drawPointer(conn.peer, info); relay({ type: 'pointer', id: conn.peer, ...info }, conn.peer); }
      }
    });
    conn.on('close', () => {
      peers.delete(conn.peer); students.delete(conn.peer);
      pointers.get(conn.peer)?.remove(); pointers.delete(conn.peer); renderStudents();
      relay({ type: 'roster', students: [...students].map(([id, s]) => ({ id, name: s.name })) });
    });
    conn.on('error', (e) => console.error('Connexion élève :', e));
  }
  async function start() {
    const ip = $('teacher-ip').value.trim();
    if (!isLanIPv4(ip)) { setStatus(status, 'Saisissez une adresse IPv4 privée du réseau local.', 'error'); return; }
    startBtn.disabled = true; setStatus(status, 'Préparation de la capture…');
    try {
      const sources = await window.ekoVision.getScreenSources();
      if (!sources.length) throw new Error('Aucun écran détecté.');
      const source = sources[0];
      localStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: source.id, maxFrameRate: 30 } } });
      preview.srcObject = localStream; placeholder.hidden = true; setStatus(streamStatus, `Diffusion active — ${source.name}`, 'online');
      peer = makePeer(ip);
      peer.on('open', () => { running = true; setStatus(status, `Prêt — adresse à communiquer : ${ip}:9000`, 'online'); stopBtn.disabled = false; });
      peer.on('connection', handleConnection);
      peer.on('call', (call) => { call.answer(localStream); });
      peer.on('error', (err) => { console.error(err); stopLocal(); setStatus(status, `Erreur PeerJS : ${err.type || err.message}`, 'error'); });
      localStream.getVideoTracks()[0].addEventListener('ended', stop);
    } catch (error) { console.error(error); setStatus(status, error.message || 'Impossible de démarrer le partage.', 'error'); stopLocal(); startBtn.disabled = false; }
  }
  function stopLocal() {
    running = false;
    for (const conn of peers.values()) { try { conn.close(); } catch (_) {} }
    peers.clear(); students.clear(); pointers.clear(); $('laser-overlay').replaceChildren(); renderStudents();
    if (peer) { try { peer.destroy(); } catch (_) {} peer = null; }
    if (localStream) { localStream.getTracks().forEach((t) => t.stop()); localStream = null; }
    preview.srcObject = null; placeholder.hidden = false;
    setStatus(streamStatus, 'Pas de diffusion'); startBtn.disabled = false; stopBtn.disabled = true;
  }
  function stop() { stopLocal(); setStatus(status, 'Diffusion arrêtée'); }
  startBtn.addEventListener('click', start); stopBtn.addEventListener('click', stop);
  window.addEventListener('beforeunload', stopLocal);
})();
