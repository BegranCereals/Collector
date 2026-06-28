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

// --- API VORLAGEN ---
app.get('/api/vorlagen', (req, res) => {
    res.json(JSON.parse(fs.readFileSync(VORLAGEN_FILE)));
});

app.post('/api/vorlagen', (req, res) => {
    const { name, felder } = req.body;
    const data = JSON.parse(fs.readFileSync(VORLAGEN_FILE));
    
    // Verarbeite Zeilen. Erkennt auch ":rating" Suffix
    data[name] = felder.split('\n').map(f => f.trim()).filter(f => f.length > 0);
    
    fs.writeFileSync(VORLAGEN_FILE, JSON.stringify(data, null, 2));
    res.redirect(`http://${req.hostname}:${port}/`);
});

app.post('/api/vorlagen/delete', (req, res) => {
    const { name } = req.body;
    const data = JSON.parse(fs.readFileSync(VORLAGEN_FILE));
    delete data[name];
    fs.writeFileSync(VORLAGEN_FILE, JSON.stringify(data, null, 2));
    res.json({ success: true });
});

// --- ITEMS CRUD ---
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

app.post('/api/items/edit', upload.single('image'), (req, res) => {
    const { id, title, vorlage } = req.body;
    
    let details = {};
    for (let key in req.body) {
        if (key.startsWith('feld_')) {
            details[key.replace('feld_', '')] = req.body[key];
        }
    }

    if (req.file) {
        const image = req.file.filename;
        db.run("UPDATE items SET title = ?, image = ?, vorlage = ?, details = ? WHERE id = ?", 
            [title, image, vorlage, JSON.stringify(details), id], () => res.redirect(`http://${req.hostname}:${port}/`));
    } else {
        db.run("UPDATE items SET title = ?, vorlage = ?, details = ? WHERE id = ?", 
            [title, vorlage, JSON.stringify(details), id], () => res.redirect(`http://${req.hostname}:${port}/`));
    }
});

app.post('/api/items/delete', (req, res) => {
    const { id } = req.body;
    db.run("DELETE FROM items WHERE id = ?", [id], () => res.json({ success: true }));
});

// --- MAIN FRONTEND ---
app.get('/', (req, res) => {
    db.all("SELECT * FROM items ORDER BY id DESC", [], (err, rows) => {
        const itemsJson = JSON.stringify(rows || []);

        res.send(`
        <!DOCTYPE html>
        <html lang="de">
        <head>
            <meta charset="UTF-8">
            <title>Collector Premium</title>
            <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
            <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
            <style>
                .line-clamp-1 { display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden; }
                .rating-star:hover, .rating-star.active { color: #f59e0b; }
            </style>
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
                    <button onclick="filterKategorie('all')" id="btn-all" class="w-full text-left px-4 py-2.5 rounded-xl bg-blue-600/10 text-blue-400 font-medium border border-blue-500/20 flex items-center gap-3 transition-all cursor-pointer">
                        <span class="material-icons text-sm">dashboard</span> Alle Items
                    </button>
                    <div id="sidebarKategorien" class="space-y-1"></div>
                </div>

                <div class="p-4 border-t border-gray-800 bg-gray-950/50">
                    <button onclick="openVorlagenManager()" class="w-full bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2 border border-gray-700 cursor-pointer">
                        <span class="material-icons text-sm text-green-400">settings</span> Vorlagen verwalten
                    </button>
                </div>
            </aside>

            <main class="flex-1 flex flex-col h-full relative overflow-hidden">
                <header class="p-6 bg-gray-900/40 border-b border-gray-900 flex flex-col md:flex-row gap-4 items-center justify-between backdrop-blur-md sticky top-0 z-10">
                    <div class="relative w-full max-w-md">
                        <span class="material-icons absolute left-3 top-2.5 text-gray-400 text-xl">search</span>
                        <input type="text" id="suche" oninput="sucheUndFilter()" placeholder="Sammlung durchsuchen..." class="w-full bg-gray-800/80 border border-gray-700 rounded-xl pl-11 pr-4 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 transition-colors">
                    </div>

                    <div class="flex items-center gap-2 w-full md:w-auto">
                        <span class="material-icons text-gray-400 text-sm">sort</span>
                        <select id="sortKey" onchange="sucheUndFilter()" class="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer">
                            <option value="id">Hinzugefügt am</option>
                            <option value="title">Titel</option>
                        </select>
                        <select id="sortOrder" onchange="sucheUndFilter()" class="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer">
                            <option value="DESC">Absteigend</option>
                            <option value="ASC">Aufsteigend</option>
                        </select>
                    </div>
                    
                    <button onclick="openAddModal()" class="fixed top-4 right-6 z-50 bg-blue-600 hover:bg-blue-500 text-white font-bold p-4 rounded-full shadow-xl flex items-center justify-center hover:scale-110 transition-all cursor-pointer">
                        <span class="material-icons text-2xl">add</span>
                    </button>
                </header>

                <div class="flex-1 overflow-y-auto p-8">
                    <div id="galerieGrid" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6"></div>
                </div>
            </main>

            <div id="itemModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm hidden items-center justify-center z-50 p-4">
                <div class="bg-gray-900 border border-gray-800 p-8 rounded-2xl max-w-4xl w-11/12 relative shadow-2xl max-h-[90vh] overflow-y-auto">
                    <button onclick="closeModal('itemModal')" class="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer"><span class="material-icons">close</span></button>
                    <h2 id="itemModalTitle" class="text-2xl font-black mb-6 text-blue-400 flex items-center gap-2">Neues Item</h2>
                    
                    <form id="itemForm" action="/add" method="POST" enctype="multipart/form-data" class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <input type="hidden" name="id" id="editItemId">
                        <div class="space-y-4">
                            <div>
                                <label class="block text-xs font-medium mb-1 text-gray-400">Titel</label>
                                <input type="text" name="title" id="itemFormTitle" required class="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500">
                            </div>
                            <div>
                                <label class="block text-xs font-medium mb-1 text-gray-400">Cover-Bild <span id="imageRequiredNote" class="text-gray-500">(Pflicht)</span></label>
                                <input type="file" name="image" id="itemFormImage" accept="image/*" class="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-sm text-white file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-500 cursor-pointer">
                            </div>
                            <div>
                                <label class="block text-xs font-medium mb-1 text-gray-400">Kategorie-Vorlage</label>
                                <select name="vorlage" id="vorlageSelect" onchange="rendereFormularFelder()" class="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 cursor-pointer"></select>
                            </div>
                        </div>
                        <div class="flex flex-col justify-between">
                            <div>
                                <label class="block text-xs font-medium mb-2 text-gray-400">Zusatzfelder</label>
                                <div id="dynamischeFelder" class="space-y-4 bg-gray-950 p-4 rounded-xl border border-gray-800 max-h-[300px] overflow-y-auto"></div>
                            </div>
                            <button type="submit" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors mt-4 cursor-pointer">Speichern</button>
                        </div>
                    </form>
                </div>
            </div>

            <div id="detailModal" class="fixed inset-0 bg-black/90 backdrop-blur-md hidden items-center justify-center z-40 p-4" onclick="closeModal('detailModal')">
                
                <button onclick="blaettern(-1, event)" class="fixed left-6 top-1/2 -translate-y-1/2 bg-gray-900/80 border border-gray-800 text-white hover:bg-blue-600 p-4 rounded-full shadow-2xl transition-all cursor-pointer z-50">
                    <span class="material-icons text-3xl">chevron_left</span>
                </button>

                <div class="bg-gray-900 border border-gray-800 rounded-2xl max-w-5xl w-11/12 overflow-hidden shadow-2xl flex flex-col md:flex-row relative max-h-[85vh]" onclick="event.stopPropagation()">
                    <button onclick="closeModal('detailModal')" class="absolute top-4 right-4 bg-black/60 text-white p-2 rounded-full hover:bg-black/90 z-10 cursor-pointer">
                        <span class="material-icons">close</span>
                    </button>
                    
                    <div class="md:w-1/2 bg-black/40 flex items-center justify-center p-4">
                        <img id="detailImg" src="" class="w-full h-full object-contain max-h-[60vh] rounded-lg">
                    </div>
                    
                    <div class="md:w-1/2 p-8 flex flex-col justify-between bg-gray-900 border-l border-gray-800/50">
                        <div class="overflow-y-auto max-h-[50vh] pr-2">
                            <span id="detailBadge" class="text-xs font-bold uppercase bg-blue-600/20 text-blue-400 px-3 py-1 rounded-md tracking-wider inline-block mb-3">Kategorie</span>
                            <h2 id="detailTitle" class="text-3xl font-black text-white mb-6 tracking-wide">Titel</h2>
                            <div id="detailFields" class="space-y-4"></div>
                        </div>

                        <div class="flex gap-3 border-t border-gray-800 pt-4 mt-4">
                            <button onclick="editAktuellesItem()" class="flex-1 bg-yellow-600/20 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-600 hover:text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all cursor-pointer">
                                <span class="material-icons text-sm">edit</span> Bearbeiten
                            </button>
                            <button onclick="deleteAktuellesItem()" class="flex-1 bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600 hover:text-white py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all cursor-pointer">
                                <span class="material-icons text-sm">delete</span> Löschen
                            </button>
                        </div>
                    </div>
                </div>

                <button onclick="blaettern(1, event)" class="fixed right-6 top-1/2 -translate-y-1/2 bg-gray-900/80 border border-gray-800 text-white hover:bg-blue-600 p-4 rounded-full shadow-2xl transition-all cursor-pointer z-50">
                    <span class="material-icons text-3xl">chevron_right</span>
                </button>
            </div>

            <div id="vorlagenModal" class="fixed inset-0 bg-black/70 backdrop-blur-sm hidden items-center justify-center z-50 p-4">
                <div class="bg-gray-900 border border-gray-800 p-8 rounded-2xl max-w-4xl w-11/12 relative shadow-2xl max-h-[90vh] flex flex-col">
                    <button onclick="closeModal('vorlagenModal')" class="absolute top-4 right-4 text-gray-400 hover:text-white cursor-pointer"><span class="material-icons">close</span></button>
                    
                    <div class="flex justify-between items-center mb-6 border-b border-gray-800 pb-4">
                        <h2 class="text-2xl font-black text-green-400 flex items-center gap-2">
                            <span class="material-icons">settings</span> Vorlagen-Manager
                        </h2>
                        <button onclick="neueVorlageForm()" class="bg-green-600 hover:bg-green-500 text-white font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-1 cursor-pointer">
                            <span class="material-icons text-sm">add</span> Neue Vorlage
                        </button>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 overflow-hidden">
                        <div class="border-r border-gray-800 pr-4 overflow-y-auto space-y-2">
                            <p class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Existierende Vorlagen</p>
                            <div id="managerVorlagenListe" class="space-y-1"></div>
                        </div>

                        <div class="md:col-span-2 overflow-y-auto pl-2">
                            <form action="/api/vorlagen" method="POST" id="vorlagenForm" class="space-y-4 hidden">
                                <h3 id="vorlageEditorTitle" class="text-lg font-bold text-white">Vorlage bearbeiten</h3>
                                <div>
                                    <label class="block text-xs text-gray-400 mb-1">Name der Vorlage</label>
                                    <input type="text" name="name" id="vorlageFormName" required class="w-full bg-gray-800 border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-green-500">
                                </div>
                                <div>
                                    <div class="flex justify-between items-center mb-1">
                                        <label class="block text-xs text-gray-400">Felder definieren (Eins pro Zeile)</label>
                                        <span class="text-[10px] text-yellow-500 bg-yellow-500/10 px-2 py-0.5 rounded border border-yellow-500/20">Tipp: hänge ':rating' an für Sterne!</span>
                                    </div>
                                    <textarea name="felder" id="vorlageFormFelder" rows="8" placeholder="Zustand&#10;Kaufpreis&#10;Grafik:rating" required class="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm text-white focus:outline-none focus:border-green-500 whitespace-pre font-mono"></textarea>
                                </div>
                                <div class="flex gap-3">
                                    <button type="submit" class="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-2.5 rounded-xl cursor-pointer transition-colors">Vorlage保存</button>
                                    <button type="button" id="vorlageDeleteBtn" onclick="loescheVorlage()" class="bg-red-600/20 text-red-400 border border-red-500/30 hover:bg-red-600 hover:text-white px-4 rounded-xl font-bold transition-all cursor-pointer hidden">Löschen</button>
                                </div>
                            </form>
                            <div id="vorlageEmptyState" class="text-center py-16 text-gray-500 text-sm">
                                Wähle eine Vorlage links aus oder erstelle eine neue.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <script>
                let alleItems = ${itemsJson};
                let globaleVorlagen = {};
                // QoL: Lade die letzte aktive Kategorie aus dem localStorage oder nimm standardmäßig 'all'
                let aktuelleKategorie = localStorage.getItem('collector_aktuelle_kategorie') || 'all';
                let aktuellAngezeigteItemIds = [];
                let aktuellerItemIndex = -1;

                function openModal(id) {
                    const m = document.getElementById(id);
                    m.classList.remove('hidden');
                    m.classList.add('flex');
                }
                function closeModal(id) {
                    document.getElementById(id).classList.replace('flex', 'hidden');
                }

                function openAddModal() {
                    document.getElementById('itemModalTitle').innerText = "Neues Item eintragen";
                    document.getElementById('itemForm').action = "/add";
                    document.getElementById('editItemId').value = "";
                    document.getElementById('itemFormTitle').value = "";
                    document.getElementById('itemFormImage').required = true;
                    document.getElementById('imageRequiredNote').classList.remove('hidden');
                    
                    const keys = Object.keys(globaleVorlagen);
                    if(keys.length > 0) {
                        document.getElementById('vorlageSelect').disabled = false;
                        
                        // QoL: Wenn eine spezifische Kategorie aktiv ist, wähle sie automatisch im Dropdown vor
                        if (aktuelleKategorie !== 'all' && keys.includes(aktuelleKategorie)) {
                            document.getElementById('vorlageSelect').value = aktuelleKategorie;
                        }
                        
                        rendereFormularFelder();
                    }
                    openModal('itemModal');
                }

                async function ladeVorlagen() {
                    const res = await fetch('/api/vorlagen');
                    globaleVorlagen = await res.json();
                    
                    const select = document.getElementById('vorlageSelect');
                    if(Object.keys(globaleVorlagen).length > 0) {
                        select.innerHTML = Object.keys(globaleVorlagen).map(v => \`<option value="\${v}">\${v}</option>\`).join('');
                        rendereFormularFelder();
                    } else {
                        select.innerHTML = '<option value="">Keine Vorlagen vorhanden - Bitte erst erstellen!</option>';
                        select.disabled = true;
                    }

                    const sidebar = document.getElementById('sidebarKategorien');
                    sidebar.innerHTML = Object.keys(globaleVorlagen).map(v => \`
                        <button onclick="filterKategorie('\${v}')" id="btn-\${v}" class="w-full text-left px-4 py-2 rounded-xl text-gray-400 hover:bg-gray-800/50 hover:text-gray-100 font-medium flex items-center gap-3 transition-all text-sm border border-transparent cursor-pointer">
                            <span class="material-icons text-sm text-gray-500">folder</span> \${v}
                        </button>
                    \`).join('');
                    
                    // QoL: UI Zustand wiederherstellen
                    filterKategorie(aktuelleKategorie);
                }

                // QoL: Passt die Sortieroptionen im Dropdown dynamisch an die Felder der aktuellen Kategorie an
                function updateSortDropdownOptions() {
                    const sortKeySelect = document.getElementById('sortKey');
                    const aktuellerWert = sortKeySelect.value;
                    
                    // Standardoptionen zurücksetzen
                    let html = \`
                        <option value="id">Hinzugefügt am</option>
                        <option value="title">Titel</option>
                    \`;
                    
                    // Wenn eine Kategorie aktiv ist, füge alle Zusatzfelder hinzu
                    if (aktuelleKategorie !== 'all' && globaleVorlagen[aktuelleKategorie]) {
                        globaleVorlagen[aktuelleKategorie].forEach(f => {
                            const reinesFeld = f.replace(':rating', '');
                            html += \`<option value="details.\${reinesFeld}">Feld: \${reinesFeld}</option>\`;
                        });
                    }
                    
                    sortKeySelect.innerHTML = html;
                    
                    // Versuche alten Wert zu behalten, falls er noch existiert
                    if ([...sortKeySelect.options].some(o => o.value === aktuellerWert)) {
                        sortKeySelect.value = aktuellerWert;
                    }
                }

                function rendereFormularFelder(vorausgefuellteDetails = {}) {
                    const typ = document.getElementById('vorlageSelect').value;
                    const bereich = document.getElementById('dynamischeFelder');
                    const felder = globaleVorlagen[typ] || [];
                    
                    if(felder.length === 0) { bereich.classList.add('hidden'); return; }
                    bereich.classList.remove('hidden');
                    
                    bereich.innerHTML = felder.map(f => {
                        let reinesFeld = f;
                        let istRating = false;
                        if(f.endsWith(':rating')) {
                            reinesFeld = f.replace(':rating', '');
                            istRating = true;
                        }

                        const alterWert = vorausgefuellteDetails[reinesFeld] || '';

                        if(istRating) {
                            const ratingWert = parseInt(alterWert) || 0;
                            return \`
                            <div>
                                <label class="block text-xs mb-1 text-gray-400 font-medium">\${reinesFeld}</label>
                                <input type="hidden" name="feld_\${reinesFeld}" id="rating_val_\${reinesFeld}" value="\${ratingWert}">
                                <div class="flex gap-1 bg-gray-900 p-2 rounded-lg border border-gray-800 select-none">
                                    \${[...Array(10)].map((_, i) => \`
                                        <span onclick="setRating('\${reinesFeld}', \${i+1})" data-value="\${i+1}" class="material-icons rating-star cursor-pointer text-xl text-gray-600 \${i+1 <= ratingWert ? 'active' : ''}">star</span>
                                    \`).join('')}
                                </div>
                            </div>\`;
                        } else {
                            return \`
                            <div>
                                <label class="block text-xs mb-1 text-gray-400 font-medium">\${reinesFeld}</label>
                                <input type="text" name="feld_\${reinesFeld}" value="\${alterWert}" class="w-full bg-gray-800 border border-gray-700 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-blue-500">
                            </div>\`;
                        }
                    }).join('');
                }

                function setRating(feldName, wert) {
                    document.getElementById('rating_val_' + feldName).value = wert;
                    const container = document.getElementById('rating_val_' + feldName).nextElementSibling;
                    container.querySelectorAll('.rating-star').forEach(star => {
                        const starVal = parseInt(star.getAttribute('data-value'));
                        if(starVal <= wert) { star.classList.add('active'); } else { star.classList.remove('active'); }
                    });
                }

                function filterKategorie(kat) {
                    aktuelleKategorie = kat;
                    // QoL: Im Browser-Speicher sichern
                    localStorage.setItem('collector_aktuelle_kategorie', kat);
                    
                    document.querySelectorAll('[id^="btn-"]').forEach(btn => btn.classList.remove('bg-blue-600/10', 'text-blue-400', 'border-blue-500/20'));
                    const aktivBtn = document.getElementById('btn-' + kat);
                    if(aktivBtn) aktivBtn.classList.add('bg-blue-600/10', 'text-blue-400', 'border-blue-500/20');
                    
                    updateSortDropdownOptions();
                    sucheUndFilter();
                }

                function sucheUndFilter() {
                    const suchBegriff = document.getElementById('suche').value.toLowerCase();
                    const grid = document.getElementById('galerieGrid');
                    
                    const sortKey = document.getElementById('sortKey').value;
                    const sortOrder = document.getElementById('sortOrder').value;
                    
                    // 1. Filtern
                    let gefiltert = alleItems.filter(item => {
                        const passtKategorie = (aktuelleKategorie === 'all' || item.vorlage === aktuelleKategorie);
                        const passtSuche = item.title.toLowerCase().includes(suchBegriff);
                        return passtKategorie && passtSuche;
                    });

                    // 2. QoL: Sortieren (Unterstützt ID, Titel und geschachtelte Zusatzfelder aus "details")
                    gefiltert.sort((a, b) => {
                        let valA, valB;
                        
                        if (sortKey.startsWith('details.')) {
                            const subKey = sortKey.replace('details.', '');
                            let detailsA = {}, detailsB = {};
                            try { detailsA = JSON.parse(a.details) || {}; } catch(e){}
                            try { detailsB = JSON.parse(b.details) || {}; } catch(e){}
                            valA = detailsA[subKey] || '';
                            valB = detailsB[subKey] || '';
                            
                            // Wenn es sich um Zahlen / Ratings handelt, als Zahl vergleichen
                            if (!isNaN(valA) && !isNaN(valB) && valA !== '' && valB !== '') {
                                valA = parseFloat(valA);
                                valB = parseFloat(valB);
                            }
                        } else {
                            valA = a[sortKey];
                            valB = b[sortKey];
                        }

                        if (typeof valA === 'string') valA = valA.toLowerCase();
                        if (typeof valB === 'string') valB = valB.toLowerCase();

                        if (valA < valB) return sortOrder === 'ASC' ? -1 : 1;
                        if (valA > valB) return sortOrder === 'ASC' ? 1 : -1;
                        return 0;
                    });

                    aktuellAngezeigteItemIds = gefiltert.map(i => i.id);

                    if(gefiltert.length === 0) {
                        grid.innerHTML = '<p class="text-gray-500 text-center col-span-full py-12 text-sm">Keine passenden Items gefunden.</p>';
                        return;
                    }

                    grid.innerHTML = gefiltert.map(item => \`
                        <div onclick="openDetailModal(\${item.id})" class="bg-gray-900 rounded-2xl overflow-hidden border border-gray-800/80 cursor-pointer hover:scale-[102%] hover:border-gray-700 hover:shadow-xl transition-all flex flex-col group">
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

                function openDetailModal(id) {
                    const item = alleItems.find(i => i.id === id);
                    if(!item) return;

                    aktuellerItemIndex = aktuellAngezeigteItemIds.indexOf(id);

                    document.getElementById('detailImg').src = '/uploads/' + item.image;
                    document.getElementById('detailTitle').innerText = item.title;
                    document.getElementById('detailBadge').innerText = item.vorlage;

                    const fieldsDiv = document.getElementById('detailFields');
                    fieldsDiv.innerHTML = '';

                    try {
                        const details = JSON.parse(item.details);
                        let hatInhalt = false;
                        const templateFields = globaleVorlagen[item.vorlage] || [];

                        for (let key in details) {
                            if(details[key] !== undefined && details[key] !== '') {
                                hatInhalt = true;
                                const istRatingTyp = templateFields.includes(key + ':rating');

                                if(istRatingTyp) {
                                    const ratingInt = parseInt(details[key]) || 0;
                                    fieldsDiv.innerHTML += \`
                                        <div class="bg-gray-950/60 border border-gray-800 p-4 rounded-xl">
                                            <span class="text-[10px] text-gray-500 font-bold uppercase block tracking-wider mb-1">\${key}</span>
                                            <div class="flex gap-0.5 text-amber-500">
                                                \${[...Array(10)].map((_, i) => \`<span class="material-icons text-lg">\${i < ratingInt ? 'star' : 'star_border'}</span>\`).join('')}
                                                <span class="text-xs text-gray-400 ml-2 font-bold">\${ratingInt}/10</span>
                                            </div>
                                        </div>\`;
                                } else {
                                    fieldsDiv.innerHTML += \`
                                        <div class="bg-gray-950/60 border border-gray-800 p-4 rounded-xl">
                                            <span class="text-[10px] text-gray-500 font-bold uppercase block tracking-wider mb-0.5">\${key}</span>
                                            <span class="text-sm text-gray-200 font-medium">\${details[key]}</span>
                                        </div>\`;
                                }
                            }
                        }
                        if(!hatInhalt) fieldsDiv.innerHTML = '<p class="text-xs text-gray-500 italic">Keine zusätzlichen Details hinterlegt.</p>';
                    } catch(e) {
                        fieldsDiv.innerHTML = \`<p class="text-sm text-gray-300 bg-gray-950 p-4 rounded-xl border border-gray-800">\${item.details}</p>\`;
                    }

                    openModal('detailModal');
                }

                function blaettern(richtung, event) {
                    if(event) event.stopPropagation();
                    if(aktuellAngezeigteItemIds.length <= 1) return;

                    let neuerIndex = aktuellerItemIndex + richtung;
                    if(neuerIndex < 0) neuerIndex = aktuellAngezeigteItemIds.length - 1;
                    if(neuerIndex >= aktuellAngezeigteItemIds.length) neuerIndex = 0;

                    openDetailModal(aktuellAngezeigteItemIds[neuerIndex]);
                }

                function editAktuellesItem() {
                    const id = aktuellAngezeigteItemIds[aktuellerItemIndex];
                    const item = alleItems.find(i => i.id === id);
                    if(!item) return;

                    closeModal('detailModal');

                    document.getElementById('itemModalTitle').innerText = "Item bearbeiten";
                    document.getElementById('itemForm').action = "/api/items/edit";
                    document.getElementById('editItemId').value = item.id;
                    document.getElementById('itemFormTitle').value = item.title;
                    document.getElementById('itemFormImage').required = false; 
                    document.getElementById('imageRequiredNote').classList.add('hidden');
                    document.getElementById('vorlageSelect').value = item.vorlage;

                    let details = {};
                    try { details = JSON.parse(item.details); } catch(e){}
                    rendereFormularFelder(details);

                    openModal('itemModal');
                }

                async function deleteAktuellesItem() {
                    const id = aktuellAngezeigteItemIds[aktuellerItemIndex];
                    if(!confirm("Möchtest du dieses Item wirklich unwiderruflich löschen?")) return;

                    const res = await fetch('/api/items/delete', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ id: id })
                    });
                    const data = await res.json();
                    if(data.success) {
                        window.location.reload();
                    }
                }

                function openVorlagenManager() {
                    const listeDiv = document.getElementById('managerVorlagenListe');
                    listeDiv.innerHTML = Object.keys(globaleVorlagen).map(v => \`
                        <div onclick="waehleVorlageEditor('\${v}')" class="w-full text-left px-3 py-2 rounded-xl text-gray-300 hover:bg-gray-800 hover:text-white font-medium flex items-center justify-between text-xs cursor-pointer border border-transparent transition-all">
                            <span class="flex items-center gap-2"><span class="material-icons text-sm text-gray-500">folder</span> \${v}</span>
                            <span class="material-icons text-sm text-gray-500">chevron_right</span>
                        </div>
                    \`).join('');

                    neueVorlageForm(); 
                    openModal('vorlagenModal');
                }

                function waehleVorlageEditor(name) {
                    document.getElementById('vorlageEmptyState').classList.add('hidden');
                    document.getElementById('vorlagenForm').classList.remove('hidden');
                    document.getElementById('vorlageDeleteBtn').classList.remove('hidden');
                    
                    document.getElementById('vorlageEditorTitle').innerText = "Vorlage editieren: " + name;
                    document.getElementById('vorlageFormName').value = name;
                    
                    const felderArray = globaleVorlagen[name] || [];
                    document.getElementById('vorlageFormFelder').value = felderArray.join('\\n');
                }

                function neueVorlageForm() {
                    document.getElementById('vorlageEmptyState').classList.add('hidden');
                    document.getElementById('vorlagenForm').classList.remove('hidden');
                    document.getElementById('vorlageDeleteBtn').classList.add('hidden');

                    document.getElementById('vorlageEditorTitle').innerText = "Neue Vorlage erstellen";
                    document.getElementById('vorlageFormName').value = "";
                    document.getElementById('vorlageFormFelder').value = "";
                }

                async function loescheVorlage() {
                    const name = document.getElementById('vorlageFormName').value;
                    if(!confirm(\`Möchtest du die Vorlage "\${name}" löschen? Items dieser Kategorie behalten ihre Daten, verlieren aber das Rating-Format.\`)) return;

                    const res = await fetch('/api/vorlagen/delete', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ name: name })
                    });
                    const data = await res.json();
                    if(data.success) {
                        window.location.reload();
                    }
                }

                document.addEventListener('keydown', (e) => {
                    const detailModal = document.getElementById('detailModal');
                    if (!detailModal.classList.contains('hidden')) {
                        if (e.key === 'ArrowLeft') blaettern(-1);
                        if (e.key === 'ArrowRight') blaettern(1);
                        if (e.key === 'Escape') closeModal('detailModal');
                    }
                });

                ladeVorlagen();
            </script>
        </body>
        </html>
        `);
    });
});

app.listen(port, () => console.log(`Premium-Galerie läuft auf Port ${port}`));
