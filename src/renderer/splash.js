ajouterStyle(`
html,body{height:100%;overflow:hidden}
body{display:grid;place-items:center;box-shadow:inset 0 0 0 1px var(--line)}
.splash{width:100%;padding:0 48px;text-align:center}
.splash img{width:72px;height:72px;object-fit:contain}
.splash h1{font-size:22px;letter-spacing:.14em;margin:16px 0 4px}
.splash p{margin:0 0 28px;color:var(--muted)}
.chargement{height:3px;background:var(--line);border-radius:2px;overflow:hidden}
.chargement span{display:block;width:40%;height:100%;background:var(--green);animation:aller-retour 1.2s ease-in-out infinite}
.splash small{display:block;margin-top:24px;color:var(--muted);font-size:11px}
@keyframes aller-retour{0%{margin-left:-40%}100%{margin-left:100%}}
`);