const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const app = express();
const port = 8090;

const DATA_DIR = './data';
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const VORLAGEN_FILE = path.join(DATA_DIR, 'vorlagen.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Absolut leere Vorlagen beim ersten Start
if (!fs.existsSync(VORLAGEN_FILE)) {
    fs.writeFileSync(VORLAGEN_FILE, JSON.stringify({}, null, 2));
}

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

const db = new sqlite3.Database(path.join(DATA_DIR, 'galerie.db'), (err) => {
    if (!err) {
        db.run(`CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            image TEXT,
            vorlage TEXT,
            details TEXT
        )`);
    }
});

const storage = multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(UPLOADS_DIR));

app.get('/api/vorlagen', (req, res) => {
    const data = fs.readFileSync(VORLAGEN_FILE);
    res.json(JSON.parse(data));
});

app.post('/api/vorlagen', (req, res) => {
    const { name, felder } = req.body;
    const data = JSON.parse(fs.readFileSync(VORLAGEN_FILE));
    // Splittet nun nach Zeilenumbrüchen statt Kommas
    data[name] = felder.split('\n').map(f => f.trim()).filter(f => f.length > 0);
    fs.writeFileSync(VORLAGEN_FILE, JSON.stringify(data, null, 2));
    res.redirect(`http://${req.hostname}:${port}/`);
});

app.get('/', (req, res) => {
    db.all("SELECT * FROM items ORDER BY id DESC", [], (err, rows) => {
        // Generiere JSON-String der Items für das Frontend-Live-Filtering
        const itemsJson = JSON.stringify(rows || []);

        res.send(`
        <!DOCTYPE html>
        <html lang="de">
        <head>
            <meta charset="UTF-8">
            <title>Collector Galerie</title>
            <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
            <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
        </head>
        <body class="bg-gray-950 text-gray-100 font-sans flex h-screen overflow-hidden">

            <aside class="w-80 bg-gray-900 border-r border-gray-800 flex flex-col h-full">
                <div class="p-6 border-b border-gray-800">
                    <h1 class="text-2xl font-black tracking-wider text-blue-500 flex items-center gap-2">
                        <span class="material-icons">layers</span> COLLECTOR
                    </h1>
                </div>

                <div class="flex-1 overflow-y-auto p-4 space-y-2">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2">Kategorien</p>
                    <button onclick="filterKategorie('all')" id="btn-all" class="w-full text-left px-4 py-2.5 rounded-xl bg-blue-600/10 text-blue-400 font-medium border border-blue-500/20 flex items-center gap-3 transition-all">
                        <span class="material-icons text-sm">dashboard</span> Alle Items
                    </button>
                    <div id="sidebarKategorien" class="space-y-1">
                        </div>
                </div>

                <div class="p-4 border-t border-gray-800 bg-gray-950/50">
                    <h2 class="text-sm font-bold text-green-400 mb-3 flex items-center gap-1">
                        <span class="material-icons text-base">add_box</span> Neue Vorlage erstellen
                    </h2>
                    <form action="http://${req.hostname}:${port}/api/vorlagen" method="POST" class="space-y-3">
                        <input type="text" name="name" placeholder="z.B. Nintendo Spiele" required class="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-green-500">
                        <div>
                            <label class="block text-[11px] text-gray-400 mb-1">Felder (Ein Feld pro Zeile):</label>
                            <textarea name="felder" rows="3" placeholder="Zustand&#10;Besitzer&#10;Kaufpreis" required class="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-green-500 whitespace-pre"></textarea>
                        </div>
                        <button type="submit" class="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 rounded-lg text-xs transition-colors">Vorlage speichern</button>
                    </form>
                </div>
            </aside>

            <main class="flex-1 flex flex-col h-full relative overflow-hidden">
                
                <header class="p-6 bg-gray-900/40 border-b border-gray-900 flex items-center justify-between backdrop-blur-md sticky top-0 z-10">
                    <div class="relative w-full max-w-md">
                        <span class="material-icons absolute left-3 top-2.5 text-gray-400 text-xl">search</span>
                        <input type="text" id="suche" oninput="sucheUndFilter()" placeholder="Sammlung durchsuchen..." class="w-full bg-gray-800/80 border border-gray-700 rounded-xl pl-11 pr-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors">
                    </div>
                    
                    <button onclick="openModal('addModal')" class="fixed top-4 right-6 z-50 bg-blue-600 hover:bg-blue-500 text-white font-bold p-3 rounded-full shadow-xl flex items-center justify-center hover:scale-110 transition-all cursor-pointer">
                        <span class="material-icons text-2xl">add</span>
                    </button>
                </header>

                <div class="flex-1 overflow-y-auto p-8">
                    <div id="galerieGrid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                        </div>
                </div>
            </main>

            <div id="addModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm hidden items-center justify-center z-50 p-4">
                <div class="bg-gray-900 border border-gray-800 p-6 rounded-2xl max-w-md w-full relative shadow-2xl">
                    <button onclick="closeModal('addModal')" class="absolute top-4 right-4 text-gray-400 hover:text-white">
                        <span class="material-icons">close</span>
                    </button>
                    <h2 class="text-xl font-bold mb-4 text-blue-400 flex items-center gap-2">
                        <span class="material-icons">add_photo_alternate</span> Neues Item eintragen
                    </h2>
                    <form action="http://${req.hostname}:${port}/add" method="POST" enctype="multipart/form-data" class="space-y-4">
                        <div>
                            <label class="block text-xs font-medium mb-1 text-gray-400">Titel</label>
                            <input type="text" name="title" required class="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-blue-500">
                        </div>
                        <div>
                            <label class="block text-xs font-medium mb-1 text-gray-400">Cover-Bild</label>
                            <input type="file" name="image" accept="image/*" required class="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-white file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer">
                        </div>
                        <div>
                            <label class="block text-xs font-medium mb-1 text-gray-400">Vorlage wählen</label>
                            <select name="vorlage" id="vorlageSelect" onchange="rendereFormularFelder()" class="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-blue-500"></select>
                        </div>
                        <div id="dynamischeFelder" class="space-y-3 bg-gray-950 p-4 rounded-xl border border-gray-800 hidden max-h-48 overflow-y-auto"></div>
                        <button type="submit" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 rounded-xl transition-colors shadow-lg shadow-blue-600/20">In Galerie speichern</button>
                    </form>
                </div>
            </div>

            <div id="detailModal" class="fixed inset-0 bg-black/85 backdrop-blur-md hidden items-center justify-center z-50 p-4" onclick="closeModal('detailModal')">
                <div class="bg-gray-900 border border-gray-800 rounded-2xl max-w-3xl w-full overflow-hidden shadow-2xl flex flex-col md:flex-row relative" onclick="event.stopPropagation()">
                    <button onclick="closeModal('detailModal')" class="absolute top-4 right-4 bg-black/50 text-white p-1 rounded-full hover:bg-black/80 z-10 transition-colors">
                        <span class="material-icons">close</span>
                    </button>
                    <div class="md:w-1/2 bg-black flex items-center justify-center min-h-[300px]">
                        <img id="detailImg" src="" class="w-full h-full object-contain max-h-[500px]">
                    </div>
                    <div class="md:w-1/2 p-6 flex flex-col justify-between bg-gray-900">
                        <div>
                            <span id="detailBadge" class="text-xs font-bold uppercase bg-blue-600/20 text-blue-400 px-2.5 py-1 rounded-md tracking-wider inline-block mb-2">Kategorie</span>
                            <h2 id="detailTitle" class="text-2xl font-black text-white mb-4 border-b border-gray-800 pb-2">Titel</h2>
                            <div id="detailFields" class="space-y-3 overflow-y-auto max-h-[250px] pr-2">
                                </div>
                        </div>
                    </div>
                </div>
            </div>

            <script>
                const alleItems = ${itemsJson};
                let globaleVorlagen = {};
                let aktuelleKategorie = 'all';

                // Modals öffnen/schließen
                function openModal(id) {
                    const m = document.getElementById(id);
                    m.classList.remove('hidden');
                    m.classList.add('flex');
                }
                function closeModal(id) {
                    const m = document.getElementById(id);
                    m.classList.remove('flex');
                    m.classList.add('hidden');
                }

                // Vorlagen aus API laden und Sidebar + Dropdown bauen
                async function ladeVorlagen() {
                    const res = await fetch('http://' + window.location.hostname + ':' + window.location.port + '/api/vorlagen');
                    globaleVorlagen = await res.json();
                    
                    // 1. Dropdown im Add-Modal befüllen
                    const select = document.getElementById('vorlageSelect');
                    if(Object.keys(globaleVorlagen).length > 0) {
                        select.innerHTML = Object.keys(globaleVorlagen).map(v => \`<option value="\${v}">\${v}</option>\`).join('');
                        rendereFormularFelder();
                    } else {
                        select.innerHTML = '<option value="">Keine Vorlagen vorhanden</option>';
                    }

                    // 2. Sidebar-Buttons bauen
                    const sidebar = document.getElementById('sidebarKategorien');
                    sidebar.innerHTML = Object.keys(globaleVorlagen).map(v => \`
                        <button onclick="filterKategorie('\${v}')" id="btn-\${v}" class="w-full text-left px-4 py-2 rounded-xl text-gray-400 hover:bg-gray-800/50 hover:text-gray-100 font-medium flex items-center gap-3 transition-all text-sm border border-transparent">
                            <span class="material-icons text-sm text-gray-500">folder</span> \${v}
                        </button>
                    \`).join('');
                    
                    sucheUndFilter();
                }

                // Felder im Hinzufügen-Formular generieren
                function rendereFormularFelder() {
                    const typ = document.getElementById('vorlageSelect').value;
                    const bereich = document.getElementById('dynamischeFelder');
                    const felder = globaleVorlagen[typ] || [];
                    
                    if(felder.length === 0) {
                        bereich.classList.add('hidden');
                        return;
                    }
                    
                    bereich.classList.remove('hidden');
                    bereich.innerHTML = felder.map(f => \`
                        <div>
                            <label class="block text-[11px] mb-1 text-gray-400 font-medium">\${f}</label>
                            <input type="text" name="feld_\${f}" class="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-blue-500">
                        </div>
                    \`).join('');
                }

                // Kategorie-Filter setzen
                function filterKategorie(kat) {
                    aktuelleKategorie = kat;
                    
                    // CSS-Klassen der Buttons updaten
                    document.querySelectorAll('[id^="btn-"]').forEach(btn => {
                        btn.classList.remove('bg-blue-600/10', 'text-blue-400', 'border-blue-500/20');
                        btn.classList.add('text-gray-400');
                    });
                    
                    const aktivBtn = document.getElementById('btn-' + kat);
                    if(aktivBtn) {
                        aktivBtn.classList.remove('text-gray-400');
                        aktivBtn.classList.add('bg-blue-600/10', 'text-blue-400', 'border-blue-500/20');
                    }

                    sucheUndFilter();
                }

                // Kombinierte Suche & Kategorie-Filterung
                function sucheUndFilter() {
                    const suchBegriff = document.getElementById('suche').value.toLowerCase();
                    const grid = document.getElementById('galerieGrid');
                    
                    const gefiltert = alleItems.filter(item => {
                        const passtKategorie = (aktuelleKategorie === 'all' || item.vorlage === aktuelleKategorie);
                        const passtSuche = item.title.toLowerCase().includes(suchBegriff);
                        return passtKategorie && passtSuche;
                    });

                    if(gefiltert.length === 0) {
                        grid.innerHTML = '<p class="text-gray-500 text-center col-span-full py-12 text-sm">Keine passenden Items gefunden.</p>';
                        return;
                    }

                    grid.innerHTML = gefiltert.map(item => \`
                        <div onclick="openDetailModal(\${item.id})" class="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800/80 cursor-pointer hover:scale-[103%] hover:border-gray-700 hover:shadow-xl transition-all flex flex-col group">
                            <div class="w-full h-56 bg-gray-950 overflow-hidden relative">
                                <img src="/uploads/\${item.image}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300">
                            </div>
                            <div class="p-4 flex-1 flex flex-col justify-between">
                                <h3 class="font-bold text-white tracking-wide text-sm line-clamp-1 group-hover:text-blue-400 transition-colors">\${item.title}</h3>
                                <span class="text-[10px] font-bold bg-gray-800 text-gray-400 border border-gray-700/60 px-2 py-0.5 rounded-md mt-2 self-start uppercase tracking-wider">\${item.vorlage}</span>
                            </div>
                        </div>
                    \`).join('');
                }

                // Detail Modal öffnen und mit Daten befüllen
                function openDetailModal(id) {
                    const item = alleItems.find(i => i.id === id);
                    if(!item) return;

                    document.getElementById('detailImg').src = '/uploads/' + item.image;
                    document.getElementById('detailTitle').innerText = item.title;
                    document.getElementById('detailBadge').innerText = item.vorlage;

                    const fieldsDiv = document.getElementById('detailFields');
                    fieldsDiv.innerHTML = '';

                    try {
                        const details = JSON.parse(item.details);
                        let hatInhalt = false;
                        for (let key in details) {
                            if(details[key]) {
                                hatInhalt = true;
                                fieldsDiv.innerHTML += \`
                                    <div class="bg-gray-950/60 border border-gray-800 p-3 rounded-xl">
                                        <span class="text-[10px] text-gray-500 font-bold uppercase block tracking-wider">\${key}</span>
                                        <span class="text-sm text-gray-200 font-medium">\${details[key]}</span>
                                    </div>\`;
                            }
                        }
                        if(!hatInhalt) {
                            fieldsDiv.innerHTML = '<p class="text-xs text-gray-500 italic">Keine zusätzlichen Details hinterlegt.</p>';
                        }
                    } catch(e) {
                        fieldsDiv.innerHTML = \`<p class="text-sm text-gray-300 bg-gray-950 p-3 rounded-xl border border-gray-800">\${item.details}</p>\`;
                    }

                    openModal('detailModal');
                }

                ladeVorlagen();
            </script>
        </body>
        </html>
        `);
    });
});

app.post('/add', upload.single('image'), (req, res) => {
    const { title, vorlage } = req.body;
    const image = req.file ? req.file.filename : '';
    
    let details = {};
    for (let key in req.body) {
        if (key.startsWith('feld_')) {
            details[key.replace('feld_', '')] = req.body[key];
        }
    }

    db.run("INSERT INTO items (title, image, vorlage, details) VALUES (?, ?, ?, ?)", 
        [title, image, vorlage, JSON.stringify(details)], 
        () => res.redirect(`http://${req.hostname}:${port}/`)
    );
});

app.listen(port, () => console.log(`Galerie läuft auf Port ${port}`));
