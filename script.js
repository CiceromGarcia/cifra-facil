(function(){
  "use strict";

  /* ======================= Chord transposition engine ======================= */
  var SHARP_SCALE = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
  var FLAT_SCALE  = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
  var NOTE_TO_INDEX = {};
  SHARP_SCALE.forEach(function(n,i){ NOTE_TO_INDEX[n]=i; });
  FLAT_SCALE.forEach(function(n,i){ NOTE_TO_INDEX[n]=i; });
  var CHORD_RE = /^([A-G])(#|b)?([a-zA-Z0-9\+\(\)º°]*)(\/([A-G])(#|b)?)?$/;

  function transposeNote(note, accidental, semitones, preferFlat){
    var key = note + (accidental || '');
    var idx = NOTE_TO_INDEX[key];
    if (idx === undefined) return null;
    var newIdx = ((idx + semitones) % 12 + 12) % 12;
    return (preferFlat ? FLAT_SCALE : SHARP_SCALE)[newIdx];
  }
  function isChordToken(tok){ return CHORD_RE.test(tok); }
  function transposeChordToken(tok, semitones, preferFlat){
    var m = tok.match(CHORD_RE);
    if (!m) return tok;
    var root = m[1], acc = m[2], suffix = m[3] || '', bassRoot = m[5], bassAcc = m[6];
    var newRoot = transposeNote(root, acc, semitones, preferFlat);
    if (!newRoot) return tok;
    var result = newRoot + suffix;
    if (bassRoot){
      var newBass = transposeNote(bassRoot, bassAcc, semitones, preferFlat);
      if (newBass) result += '/' + newBass;
    }
    return result;
  }
  function isSectionLine(line){
    var t = line.trim();
    return t.length>0 && t.charAt(0)==='[' && t.charAt(t.length-1)===']';
  }
  function isChordLine(line){
    var t = line.trim();
    if (!t || isSectionLine(t)) return false;
    var tokens = t.split(/\s+/);
    var hasLetter = false;
    for (var i=0;i<tokens.length;i++){
      if (!isChordToken(tokens[i])) return false;
      if (/[A-G]/.test(tokens[i])) hasLetter = true;
    }
    return hasLetter;
  }
  // Classifies a line as blank | section | labelchord ([Intro] Fm Bb ...) | chord | lyric
  function parseLine(line){
    if (!line.trim()) return { type:'blank' };
    var m = line.match(/^(\s*)(\[[^\]]*\])(.*)$/);
    if (m){
      var rest = m[3];
      if (rest.trim() === '') return { type:'section', label:m[2] };
      if (isChordLine(rest)) return { type:'labelchord', label:m[2], rest:rest };
      return { type:'lyric', text:line };
    }
    if (isChordLine(line)) return { type:'chord', text:line };
    return { type:'lyric', text:line };
  }
  function transposeLine(line, semitones, preferFlat){
    return line.replace(/\S+/g, function(tok){
      return isChordToken(tok) ? transposeChordToken(tok, semitones, preferFlat) : tok;
    });
  }
  function detectPreferFlat(body){
    var flats = (body.match(/[A-G]b(?![a-zA-Z])/g) || []).length;
    var sharps = (body.match(/[A-G]#/g) || []).length;
    return flats >= sharps;
  }

  /* ======================= Chord fretboard diagrams ======================= */
  // Absolute-fret open-position shapes for the most common chords (low E to high e). null = muted string.
  var OPEN_SHAPES = {
    'E':[0,2,2,1,0,0], 'Em':[0,2,2,0,0,0], 'E7':[0,2,0,1,0,0], 'Em7':[0,2,0,0,0,0], 'Emaj7':[0,2,1,1,0,0], 'Esus4':[0,2,2,2,0,0],
    'A':[null,0,2,2,2,0], 'Am':[null,0,2,2,1,0], 'A7':[null,0,2,0,2,0], 'Am7':[null,0,2,0,1,0], 'Amaj7':[null,0,2,1,2,0], 'Asus4':[null,0,2,2,3,0],
    'D':[null,null,0,2,3,2], 'Dm':[null,null,0,2,3,1], 'D7':[null,null,0,2,1,2], 'Dm7':[null,null,0,2,1,1], 'Dmaj7':[null,null,0,2,2,2], 'Dsus4':[null,null,0,2,3,3],
    'G':[3,2,0,0,0,3], 'G7':[3,2,0,0,0,1], 'Gmaj7':[3,2,0,0,0,2],
    'C':[null,3,2,0,1,0], 'Cmaj7':[null,3,2,0,0,0], 'C7':[null,3,2,3,1,0]
  };
  // Movable barre templates (relative fret offsets from the barre position). Verified CAGED shapes.
  var E_SHAPE_TPL = { '':[0,2,2,1,0,0], 'm':[0,2,2,0,0,0], '7':[0,2,0,1,0,0], 'm7':[0,2,0,0,0,0], 'maj7':[0,2,1,1,0,0], 'sus4':[0,2,2,2,0,0] };
  var A_SHAPE_TPL = { '':[null,0,2,2,2,0], 'm':[null,0,2,2,1,0], '7':[null,0,2,0,2,0], 'm7':[null,0,2,0,1,0], 'maj7':[null,0,2,1,2,0], 'sus4':[null,0,2,2,3,0] };
  var QUALITY_ALIASES = { '':'', 'm':'m', '7':'7', 'm7':'m7', 'maj7':'maj7', 'sus4':'sus4', '4':'sus4', 'sus':'sus4' };

  function getChordShape(token){
    var m = token.match(CHORD_RE);
    if (!m) return null;
    var root = m[1] + (m[2] || '');
    var rawSuffix = (m[3] || '').toLowerCase();
    if (!QUALITY_ALIASES.hasOwnProperty(rawSuffix)) return null;
    var quality = QUALITY_ALIASES[rawSuffix];
    var exactKey = root + quality;
    if (OPEN_SHAPES.hasOwnProperty(exactKey)) return { frets: OPEN_SHAPES[exactKey].slice() };
    var idx = NOTE_TO_INDEX[root];
    if (idx === undefined) return null;
    var distFromE = ((idx - NOTE_TO_INDEX['E']) % 12 + 12) % 12;
    var distFromA = ((idx - NOTE_TO_INDEX['A']) % 12 + 12) % 12;
    var candidates = [];
    if (E_SHAPE_TPL[quality]) candidates.push({ barre: distFromE, template: E_SHAPE_TPL[quality] });
    if (A_SHAPE_TPL[quality]) candidates.push({ barre: distFromA, template: A_SHAPE_TPL[quality] });
    if (!candidates.length) return null;
    candidates.sort(function(a,b){ return a.barre - b.barre; });
    var chosen = candidates[0];
    var frets = chosen.template.map(function(v){ return v===null ? null : v + chosen.barre; });
    return { frets: frets };
  }

  function uniqueChordsInBody(body, offset, preferFlat){
    var seen = {};
    var out = [];
    body.split('\n').forEach(function(line){
      var p = parseLine(line);
      var text = p.type==='chord' ? p.text : (p.type==='labelchord' ? p.rest : null);
      if (!text) return;
      text.trim().split(/\s+/).forEach(function(tok){
        if (!isChordToken(tok)) return;
        var transposed = transposeChordToken(tok, offset, preferFlat);
        if (seen[transposed]) return;
        seen[transposed] = true;
        var shape = getChordShape(transposed);
        if (shape) out.push({ name: transposed, shape: shape });
      });
    });
    return out;
  }

  function chordDiagramSVG(shape){
    var frets = shape.frets;
    var positive = frets.filter(function(f){ return typeof f === 'number' && f>0; });
    var maxFret = positive.length ? Math.max.apply(null, positive) : 0;
    var minFret = positive.length ? Math.min.apply(null, positive) : 0;
    var baseFret = (maxFret <= 4) ? 1 : minFret;
    var rows = 4;
    var W = 64, topPad = 16, leftPad = 6, rightPad = 6, gridW = W - leftPad - rightPad;
    var rowH = 15, gridH = rows*rowH;
    var strings = 6;
    var stepX = gridW/(strings-1);
    var svg = '<svg width="'+W+'" height="'+(topPad+gridH+6)+'" viewBox="0 0 '+W+' '+(topPad+gridH+6)+'">';
    // nut or top line
    if (baseFret === 1){
      svg += '<rect x="'+leftPad+'" y="'+topPad+'" width="'+gridW+'" height="3" fill="var(--text)"></rect>';
    } else {
      svg += '<line x1="'+leftPad+'" y1="'+topPad+'" x2="'+(leftPad+gridW)+'" y2="'+topPad+'" stroke="var(--border)" stroke-width="1.5"></line>';
      svg += '<text x="'+(leftPad+gridW+3)+'" y="'+(topPad+rowH*0.8)+'" font-size="9" fill="var(--text-dim)">'+ (baseFret) +'fr</text>';
    }
    // fret lines
    for (var r=1;r<=rows;r++){
      var y = topPad + r*rowH;
      svg += '<line x1="'+leftPad+'" y1="'+y+'" x2="'+(leftPad+gridW)+'" y2="'+y+'" stroke="var(--border)" stroke-width="1.5"></line>';
    }
    // strings
    for (var s=0;s<strings;s++){
      var x = leftPad + s*stepX;
      svg += '<line x1="'+x+'" y1="'+topPad+'" x2="'+x+'" y2="'+(topPad+gridH)+'" stroke="var(--border)" stroke-width="1.5"></line>';
    }
    // detect a barre: 4+ strings sharing the same lowest fret value
    var barreCount = 0, barreVal = null, firstIdx=-1, lastIdx=-1;
    for (var i=0;i<strings;i++){
      if (frets[i] === baseFret){
        barreCount++;
        if (firstIdx===-1) firstIdx = i;
        lastIdx = i;
      }
    }
    if (barreCount >= 4 && baseFret>0 && (lastIdx-firstIdx)===barreCount-1){
      var by = topPad + (0.5)*rowH;
      var bx1 = leftPad + firstIdx*stepX, bx2 = leftPad + lastIdx*stepX;
      svg += '<line x1="'+bx1+'" y1="'+by+'" x2="'+bx2+'" y2="'+by+'" stroke="var(--chord)" stroke-width="8" stroke-linecap="round"></line>';
      barreVal = baseFret;
    }
    // markers above nut + dots
    for (var i2=0;i2<strings;i2++){
      var xx = leftPad + i2*stepX;
      var v = frets[i2];
      if (v === null){
        svg += '<text x="'+xx+'" y="'+(topPad-5)+'" font-size="9" fill="var(--text-dim)" text-anchor="middle">x</text>';
      } else if (v === 0){
        svg += '<text x="'+xx+'" y="'+(topPad-5)+'" font-size="9" fill="var(--text-dim)" text-anchor="middle">o</text>';
      } else if (barreVal !== null && v === barreVal){
        // covered by barre bar already
      } else {
        var rowIdx = v - baseFret;
        if (rowIdx>=0 && rowIdx<rows){
          var cy = topPad + rowIdx*rowH + rowH/2;
          svg += '<circle cx="'+xx+'" cy="'+cy+'" r="4.2" fill="var(--chord)"></circle>';
        }
      }
    }
    svg += '</svg>';
    return svg;
  }

  function renderChordsSection(body, offset, preferFlat){
    var chords = uniqueChordsInBody(body, offset, preferFlat);
    if (!chords.length) return '';
    var html = '<div class="chords-section"><h3>Acordes desta música</h3><div class="chords-grid">';
    chords.forEach(function(c){
      html += '<div class="chord-card"><span class="chord-name">'+escapeHtml(c.name)+'</span>'+chordDiagramSVG(c.shape)+'</div>';
    });
    html += '</div></div>';
    return html;
  }

  /* ======================= Storage ======================= */
  var LS_SONGS = 'cifra-facil:songs';
  var LS_PREFS = 'cifra-facil:prefs';
  var LS_TRANSPOSE_PREFIX = 'cifra-facil:transpose:';

  function loadLocalSongs(){
    try { var raw = localStorage.getItem(LS_SONGS); return raw ? JSON.parse(raw) : null; }
    catch(e){ return null; }
  }
  function cacheLocalSongs(list){
    try { localStorage.setItem(LS_SONGS, JSON.stringify(list)); } catch(e){}
  }
  function loadPrefs(){
    try { var raw = localStorage.getItem(LS_PREFS); return raw ? JSON.parse(raw) : {}; }
    catch(e){ return {}; }
  }
  function savePrefs(p){
    try { localStorage.setItem(LS_PREFS, JSON.stringify(p)); } catch(e){}
  }
  function getSongTranspose(id){
    var v = parseInt(localStorage.getItem(LS_TRANSPOSE_PREFIX+id) || '0', 10);
    return isNaN(v) ? 0 : v;
  }
  function setSongTranspose(id, val){
    try { localStorage.setItem(LS_TRANSPOSE_PREFIX+id, String(val)); } catch(e){}
  }

  /* ======================= State ======================= */
  // Songs ship embedded in this HTML file (see <script id="app-data"> above). The first
  // time the app runs on a device it loads that seed list; after that, anything added,
  // edited or starred is cached to localStorage on that device -- there's no server, so
  // changes made here don't appear on other devices/links.
  function loadSeedSongs(){
    try {
      var el = document.getElementById('app-data');
      return el ? (JSON.parse(el.textContent) || []) : [];
    } catch(e){ return []; }
  }
  var cachedSongs = loadLocalSongs();
  var songs = cachedSongs !== null ? cachedSongs : loadSeedSongs();

  var prefs = loadPrefs();
  var ui = {
    view: 'library',
    search: '',
    styleFilter: prefs.styleFilter || 'all',
    favOnly: !!prefs.favOnly,
    sortMode: prefs.sortMode || 'title',
    fontSize: prefs.fontSize || 15,
    currentId: null,
    navList: [],
    editingId: null,
    menuOpen: false,
    autoScrollOn: false,
    scrollSpeed: prefs.scrollSpeed || 4,
    theme: prefs.theme || 'system'
  };

  /* ======================= Theme ======================= */
  function applyTheme(theme){
    // Uses data-cf-theme (not data-theme) so this doesn't fight with the Claude Artifact
    // host's own light/dark sync, which also writes to <html data-theme="...">.
    var root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-cf-theme', theme);
    else root.removeAttribute('data-cf-theme');
  }
  applyTheme(ui.theme); // apply immediately, before first render, to avoid a flash of the wrong theme
  function themeIcon(theme){
    if (theme === 'light') return '&#9728;';   // sun
    if (theme === 'dark') return '&#9790;';    // crescent moon
    return '&#9680;';                          // half circle = follow system
  }
  function themeTitle(theme){
    if (theme === 'light') return 'Tema: claro (toque para escuro)';
    if (theme === 'dark') return 'Tema: escuro (toque para automático)';
    return 'Tema: automático (toque para claro)';
  }
  function cycleTheme(){
    var order = ['system','light','dark'];
    var idx = order.indexOf(ui.theme);
    ui.theme = order[(idx+1) % order.length];
    prefs.theme = ui.theme; savePrefs(prefs);
    applyTheme(ui.theme);
    render();
  }

  /* ======================= Auto-scroll ======================= */
  var autoScrollRAF = null;
  var autoScrollLastTs = null;
  var autoScrollPos = null; // fractional virtual scroll position, kept in JS so slow speeds don't get lost to pixel rounding
  function stopAutoScroll(){
    if (autoScrollRAF !== null){ cancelAnimationFrame(autoScrollRAF); autoScrollRAF = null; }
    autoScrollLastTs = null;
    autoScrollPos = null;
  }
  function autoScrollStep(ts){
    if (!ui.autoScrollOn){ autoScrollRAF = null; return; }
    if (autoScrollLastTs === null){
      autoScrollLastTs = ts;
      autoScrollPos = window.scrollY;
      autoScrollRAF = requestAnimationFrame(autoScrollStep);
      return;
    }
    var dt = ts - autoScrollLastTs;
    autoScrollLastTs = ts;
    var pxPerSec = 6 + ui.scrollSpeed * 6; // speed 1..10 -> ~12..66 px/s
    autoScrollPos += pxPerSec * dt / 1000;
    window.scrollTo(0, autoScrollPos);
    var doc = document.documentElement;
    if (window.scrollY + window.innerHeight >= doc.scrollHeight - 2){
      ui.autoScrollOn = false;
      stopAutoScroll();
      updateAutoScrollUI();
      return;
    }
    autoScrollRAF = requestAnimationFrame(autoScrollStep);
  }
  function startAutoScroll(){
    if (autoScrollRAF !== null) return;
    autoScrollLastTs = null;
    autoScrollRAF = requestAnimationFrame(autoScrollStep);
  }
  function updateAutoScrollUI(){
    var btn = appEl.querySelector('[data-action="autoscroll-toggle"]');
    if (btn){
      btn.innerHTML = ui.autoScrollOn ? '&#10074;&#10074;' : '&#9654;';
      btn.classList.toggle('on', ui.autoScrollOn);
      btn.setAttribute('aria-label', ui.autoScrollOn ? 'Pausar rolagem automática' : 'Iniciar rolagem automática');
    }
  }
  function toggleAutoScroll(){
    ui.autoScrollOn = !ui.autoScrollOn;
    if (ui.autoScrollOn) startAutoScroll(); else stopAutoScroll();
    updateAutoScrollUI();
  }

  /* ======================= Utilities ======================= */
  function uid(){
    return 'song-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }
  // Accepts a normal YouTube link (watch?v=, youtu.be/, shorts/, or an embed link already)
  // and returns an embeddable https://www.youtube.com/embed/<id> URL, or null if it doesn't
  // look like a YouTube link -- this only ever points at YouTube's own official player.
  function youtubeEmbedUrl(url){
    if (!url) return null;
    var m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? 'https://www.youtube.com/embed/' + m[1] : null;
  }
  function toast(msg){
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function(){ el.remove(); }, 1800);
  }
  function uniqueStyles(){
    var set = {};
    songs.forEach(function(s){ if (s.style) set[s.style]=true; });
    return Object.keys(set).sort(function(a,b){ return a.localeCompare(b,'pt-BR'); });
  }

  /* ======================= Persistence ======================= */
  // Cifra Fácil is a static page (hosted on GitHub Pages) with no server and no login.
  // Songs start from the seed embedded in this file and, from then on, live only in
  // this browser's localStorage -- call this after any change to the `songs` array.
  function saveSongs(){
    cacheLocalSongs(songs);
  }

  /* ======================= Auto-detect from pasted text ======================= */
  function autoDetect(text){
    var lines = text.split('\n');
    var result = { title:null, artist:null, tone:null };
    var consumedIdx = {};
    var nonEmpty = [];
    for (var i=0;i<lines.length;i++){
      if (lines[i].trim().length>0) nonEmpty.push(i);
      if (nonEmpty.length>=6) break;
    }
    // Tom:
    for (i=0;i<lines.length;i++){
      var mTom = lines[i].match(/^\s*Tom:\s*(.+)$/i);
      if (mTom){ result.tone = mTom[1].trim(); consumedIdx[i]=true; break; }
    }
    // Afinação / Composição lines within first 6 non-empty
    nonEmpty.forEach(function(i){
      if (/^\s*(Afina[çc][ãa]o|Composi[çc][ãa]o de)\s*:/i.test(lines[i])) consumedIdx[i]=true;
    });
    // Title = first non-empty, non-consumed, non chord/section line
    var picked = [];
    for (var k=0;k<nonEmpty.length && picked.length<2;k++){
      var idx = nonEmpty[k];
      if (consumedIdx[idx]) continue;
      var pType = parseLine(lines[idx]).type;
      if (pType !== 'lyric') continue;
      picked.push(idx);
    }
    if (picked[0] !== undefined){ result.title = lines[picked[0]].trim(); consumedIdx[picked[0]]=true; }
    if (picked[1] !== undefined){ result.artist = lines[picked[1]].trim(); consumedIdx[picked[1]]=true; }

    var bodyLines = lines.filter(function(l,i){ return !consumedIdx[i]; });
    while (bodyLines.length && bodyLines[0].trim()==='') bodyLines.shift();
    result.body = bodyLines.join('\n');
    return result;
  }

  /* ======================= Rendering ======================= */
  var appEl = document.getElementById('app');
  appEl.addEventListener('click', function(e){
    var tok = e.target.closest('.chord-tok');
    if (!tok) return;
    e.stopPropagation();
    if (activePopoverEl === tok && activePopover){ closeChordPopover(); return; }
    showChordPopover(tok);
  });
  document.addEventListener('click', function(e){
    if (activePopover && !e.target.closest('.chord-popover') && !e.target.closest('.chord-tok')) closeChordPopover();
  }, true);
  window.addEventListener('scroll', closeChordPopover, true);

  function render(){
    if (ui.view === 'library') renderLibrary();
    else if (ui.view === 'viewer') renderViewer();
    else if (ui.view === 'form') renderForm();
  }

  function filteredSortedSongs(){
    var list = songs.slice();
    if (ui.favOnly) list = list.filter(function(s){ return s.favorite; });
    if (ui.styleFilter && ui.styleFilter !== 'all') list = list.filter(function(s){ return s.style === ui.styleFilter; });
    if (ui.search.trim()){
      var q = ui.search.trim().toLowerCase();
      list = list.filter(function(s){
        return (s.title||'').toLowerCase().indexOf(q)>=0 || (s.artist||'').toLowerCase().indexOf(q)>=0;
      });
    }
    if (ui.sortMode !== 'manual'){
      list.sort(function(a,b){
        if (ui.sortMode === 'artist') return (a.artist||'').localeCompare(b.artist||'','pt-BR') || a.title.localeCompare(b.title,'pt-BR');
        if (ui.sortMode === 'style') return (a.style||'').localeCompare(b.style||'','pt-BR') || a.title.localeCompare(b.title,'pt-BR');
        if (ui.sortMode === 'favorite') return (b.favorite?1:0) - (a.favorite?1:0) || a.title.localeCompare(b.title,'pt-BR');
        return a.title.localeCompare(b.title,'pt-BR');
      });
    }
    // 'manual' mode: preserve the order already stored in `songs` (set by dragging).
    return list;
  }

  function renderLibrary(){
    closeChordPopover();
    var list = filteredSortedSongs();
    var styles = uniqueStyles();

    var html = '';
    html += '<div class="topbar">';
    html += '<div class="brand"><h1>Cifra <span class="mark">Fácil</span></h1>';
    html += '<div class="topbar-actions">';
    if (!isStandaloneMode && (canInstall || isIOSDevice)) html += '<button class="install-btn" data-action="install">&#8681; Instalar app</button>';
    html += '<button class="icon-btn theme-btn" data-action="theme-toggle" title="'+themeTitle(ui.theme)+'" aria-label="'+themeTitle(ui.theme)+'">'+themeIcon(ui.theme)+'</button>';
    html += '</div></div>';
    html += '<div class="search-row"><input class="search-input" id="search-input" type="text" placeholder="Buscar música ou artista..." value="'+escapeHtml(ui.search)+'"></div>';
    html += '<div class="filter-row">';
    html += '<button class="chip'+(ui.favOnly?' active':'')+'" data-action="toggle-fav-filter">&#9733; Favoritas</button>';
    html += '<select class="chip" id="style-filter" style="appearance:none;">';
    html += '<option value="all"'+(ui.styleFilter==='all'?' selected':'')+'>Todos estilos</option>';
    styles.forEach(function(s){ html += '<option value="'+escapeHtml(s)+'"'+(ui.styleFilter===s?' selected':'')+'>'+escapeHtml(s)+'</option>'; });
    html += '</select>';
    html += '<select class="sort-select" id="sort-select">';
    html += '<option value="title"'+(ui.sortMode==='title'?' selected':'')+'>Título A-Z</option>';
    html += '<option value="artist"'+(ui.sortMode==='artist'?' selected':'')+'>Artista A-Z</option>';
    html += '<option value="style"'+(ui.sortMode==='style'?' selected':'')+'>Estilo</option>';
    html += '<option value="favorite"'+(ui.sortMode==='favorite'?' selected':'')+'>Favoritas primeiro</option>';
    html += '<option value="manual"'+(ui.sortMode==='manual'?' selected':'')+'>Ordem manual</option>';
    html += '</select>';
    html += '</div></div>';

    if (list.length === 0){
      html += '<div class="empty-state"><div class="big">Nenhuma música ainda</div>Toque no botão + para adicionar sua primeira cifra.</div>';
    } else {
      html += '<ul class="song-list">';
      list.forEach(function(s){
        html += '<li class="song-card" data-open="'+s.id+'">';
        html += '<button class="drag-handle" data-drag-handle aria-label="Arrastar para reordenar">⠿</button>';
        html += '<div class="info"><div class="title">'+escapeHtml(s.title)+'</div>';
        html += '<div class="meta">'+(s.artist?escapeHtml(s.artist):'<span></span>');
        if (s.tone) html += '<span class="tone-badge">'+escapeHtml(s.tone)+'</span>';
        if (s.style) html += '<span class="style-pill">'+escapeHtml(s.style)+'</span>';
        html += '</div></div>';
        html += '<button class="star-btn'+(s.favorite?' on':'')+'" data-star="'+s.id+'">'+(s.favorite?'&#9733;':'&#9734;')+'</button>';
        html += '</li>';
      });
      html += '</ul>';
    }
    html += '<button class="fab" data-action="add">+</button>';

    appEl.innerHTML = html;

    document.getElementById('search-input').addEventListener('input', function(e){
      ui.search = e.target.value; renderLibrary();
      var el = document.getElementById('search-input'); el.focus(); el.setSelectionRange(el.value.length, el.value.length);
    });
    document.getElementById('style-filter').addEventListener('change', function(e){
      ui.styleFilter = e.target.value; prefs.styleFilter = ui.styleFilter; savePrefs(prefs); renderLibrary();
    });
    document.getElementById('sort-select').addEventListener('change', function(e){
      ui.sortMode = e.target.value; prefs.sortMode = ui.sortMode; savePrefs(prefs); renderLibrary();
    });
    appEl.querySelector('[data-action="toggle-fav-filter"]').addEventListener('click', function(){
      ui.favOnly = !ui.favOnly; prefs.favOnly = ui.favOnly; savePrefs(prefs); renderLibrary();
    });
    var installBtn = appEl.querySelector('[data-action="install"]');
    if (installBtn) installBtn.addEventListener('click', doInstallClick);
    appEl.querySelector('[data-action="theme-toggle"]').addEventListener('click', cycleTheme);
    appEl.querySelector('[data-action="add"]').addEventListener('click', function(){
      ui.editingId = null; ui.view = 'form'; render();
    });
    appEl.querySelectorAll('[data-star]').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        var id = btn.getAttribute('data-star');
        var song = songs.find(function(s){ return s.id===id; });
        if (song){ song.favorite = !song.favorite; saveSongs(); renderLibrary(); }
      });
    });
    appEl.querySelectorAll('[data-open]').forEach(function(card){
      card.addEventListener('click', function(){
        var id = card.getAttribute('data-open');
        openViewer(id, list.map(function(s){ return s.id; }));
      });
    });
    appEl.querySelectorAll('[data-drag-handle]').forEach(function(handle){
      handle.addEventListener('click', function(e){ e.stopPropagation(); e.preventDefault(); });
      handle.addEventListener('pointerdown', function(e){
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        beginDrag(handle.closest('.song-card'), e.pointerId, e.clientY);
      });
    });
  }

  /* ======================= Drag to reorder (library list) ======================= */
  var dragState = null;

  function beginDrag(card, pointerId, clientY){
    dragState = { card: card, list: card.parentElement, startY: clientY, pointerId: pointerId };
    card.classList.add('dragging');
    try { card.setPointerCapture(pointerId); } catch(e){}
    card.addEventListener('pointermove', onDragMove);
    card.addEventListener('pointerup', endDrag);
    card.addEventListener('pointercancel', endDrag);
  }

  function applyDragTransform(){
    var card = dragState.card;
    var dy = dragState.lastClientY - dragState.startY;
    card.style.transform = 'translateY(' + dy + 'px)';
  }

  function onDragMove(e){
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    e.preventDefault();
    dragState.lastClientY = e.clientY;
    applyDragTransform();

    var card = dragState.card;
    var guard = 0;
    while (guard++ < 12){
      var rect = card.getBoundingClientRect();
      var center = rect.top + rect.height/2;
      var next = card.nextElementSibling;
      var prev = card.previousElementSibling;
      if (next && next.classList && next.classList.contains('song-card')){
        var nr = next.getBoundingClientRect();
        if (center > nr.top + nr.height/2){
          dragState.list.insertBefore(next, card);
          dragState.startY += nr.height;
          applyDragTransform();
          continue;
        }
      }
      if (prev && prev.classList && prev.classList.contains('song-card')){
        var pr = prev.getBoundingClientRect();
        if (center < pr.top + pr.height/2){
          dragState.list.insertBefore(card, prev);
          dragState.startY -= pr.height;
          applyDragTransform();
          continue;
        }
      }
      break;
    }
  }

  function endDrag(e){
    if (!dragState || e.pointerId !== dragState.pointerId) return;
    var card = dragState.card;
    var list = dragState.list;
    card.removeEventListener('pointermove', onDragMove);
    card.removeEventListener('pointerup', endDrag);
    card.removeEventListener('pointercancel', endDrag);
    try { card.releasePointerCapture(dragState.pointerId); } catch(err){}
    card.classList.remove('dragging');
    card.style.transform = '';
    var newOrder = Array.prototype.slice.call(list.querySelectorAll('.song-card')).map(function(c){ return c.getAttribute('data-open'); });
    dragState = null;
    applyManualReorder(newOrder);
    renderLibrary();
  }

  // Reorders `songs` so the given ids (a subset -- whatever was visible/dragged) appear
  // in this new relative order, keeping every other song in its existing position.
  function applyManualReorder(newIdOrder){
    var byId = {};
    songs.forEach(function(s){ byId[s.id] = s; });
    var idSet = {};
    newIdOrder.forEach(function(id){ idSet[id] = true; });
    var qi = 0;
    songs = songs.map(function(s){
      if (idSet[s.id]){ var next = byId[newIdOrder[qi]]; qi++; return next; }
      return s;
    });
    ui.sortMode = 'manual';
    prefs.sortMode = 'manual';
    savePrefs(prefs);
    saveSongs();
  }

  function openViewer(id, navList){
    stopAutoScroll(); ui.autoScrollOn = false;
    ui.currentId = id;
    ui.navList = navList && navList.length ? navList : songs.map(function(s){ return s.id; });
    ui.view = 'viewer';
    ui.menuOpen = false;
    render();
  }

  function renderViewer(){
    closeChordPopover();
    var song = songs.find(function(s){ return s.id===ui.currentId; });
    if (!song){ ui.view='library'; return renderLibrary(); }
    var offset = getSongTranspose(song.id);
    var preferFlat = detectPreferFlat(song.body || '');
    var toneMatch = (song.tone||'').match(/^([A-G])(#|b)?(.*)$/);
    var toneLabel;
    if (toneMatch){
      var tr = transposeChordToken(toneMatch[1]+(toneMatch[2]||'')+toneMatch[3], offset, preferFlat);
      toneLabel = tr;
    } else {
      toneLabel = (offset>0?'+':'')+offset;
    }

    var html = '<div class="viewer">';
    html += '<div class="viewer-top">';
    html += '<div class="viewer-top-row">';
    html += '<button class="icon-btn" data-action="back">&#8592;</button>';
    html += '<div class="viewer-title-block"><h2>'+escapeHtml(song.title)+'</h2><div class="artist">'+escapeHtml(song.artist||'')+'</div></div>';
    html += '<button class="star-btn'+(song.favorite?' on':'')+'" data-action="fav" style="font-size:24px;">'+(song.favorite?'&#9733;':'&#9734;')+'</button>';
    html += '<button class="icon-btn theme-btn" data-action="theme-toggle" title="'+themeTitle(ui.theme)+'" aria-label="'+themeTitle(ui.theme)+'">'+themeIcon(ui.theme)+'</button>';
    html += '<button class="icon-btn" data-action="menu">&#8942;</button>';
    html += '</div>';
    html += '<div class="controls-row">';
    html += '<div class="stepper"><button data-action="tone-down">&#8722;</button><span class="value">'+escapeHtml(toneLabel)+'</span><button data-action="tone-up">&#43;</button></div>';
    if (offset !== 0) html += '<button class="reset-link" data-action="tone-reset">tom original</button>';
    html += '<div class="stepper"><button data-action="font-down">A&#8722;</button><span class="value plain">'+ui.fontSize+'</span><button data-action="font-up">A&#43;</button></div>';
    html += '</div>';
    html += '<div class="autoscroll-row">';
    html += '<button class="autoscroll-btn'+(ui.autoScrollOn?' on':'')+'" data-action="autoscroll-toggle" aria-label="'+(ui.autoScrollOn?'Pausar rolagem automática':'Iniciar rolagem automática')+'">'+(ui.autoScrollOn?'&#10074;&#10074;':'&#9654;')+'</button>';
    html += '<div class="speed-control"><span class="lbl">Velocidade</span><input type="range" class="speed-slider" data-action="speed-slider" min="1" max="10" step="1" value="'+ui.scrollSpeed+'"><span class="speed-value">'+ui.scrollSpeed+'</span></div>';
    html += '</div>';
    if (ui.menuOpen){
      html += '<div class="menu-pop">';
      html += '<button data-action="edit">Editar</button>';
      html += '<button class="danger" data-action="delete">Excluir</button>';
      html += '</div>';
    }
    html += '</div>';

    var embedUrl = youtubeEmbedUrl(song.videoUrl);
    if (embedUrl){
      html += '<div class="video-embed"><iframe src="'+escapeHtml(embedUrl)+'" title="Vídeo de '+escapeHtml(song.title)+'" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>';
    }

    html += '<div class="cifra-scroll"><div class="cifra-body" style="--cifra-font-size:'+ui.fontSize+'px;">';
    html += renderCifraLines(song.body || '', offset, preferFlat);
    html += '</div></div>';
    html += renderChordsSection(song.body || '', offset, preferFlat);

    html += '<div class="viewer-bottom">';
    html += '<button class="nav-btn prev" data-action="prev">&#8592; Anterior</button>';
    html += '<button class="nav-btn next" data-action="next">Próxima &#8594;</button>';
    html += '</div>';
    html += '</div>';

    appEl.innerHTML = html;

    appEl.querySelector('[data-action="autoscroll-toggle"]').addEventListener('click', toggleAutoScroll);
    appEl.querySelector('[data-action="speed-slider"]').addEventListener('input', function(e){
      ui.scrollSpeed = parseInt(e.target.value, 10) || 1;
      prefs.scrollSpeed = ui.scrollSpeed; savePrefs(prefs);
      var valEl = appEl.querySelector('.speed-value'); if (valEl) valEl.textContent = ui.scrollSpeed;
    });
    appEl.querySelector('[data-action="back"]').addEventListener('click', function(){ stopAutoScroll(); ui.autoScrollOn=false; ui.view='library'; render(); });
    appEl.querySelector('[data-action="fav"]').addEventListener('click', function(){ song.favorite=!song.favorite; saveSongs(); renderViewer(); });
    appEl.querySelector('[data-action="theme-toggle"]').addEventListener('click', cycleTheme);
    appEl.querySelector('[data-action="menu"]').addEventListener('click', function(){ ui.menuOpen=!ui.menuOpen; renderViewer(); });
    appEl.querySelector('[data-action="tone-up"]').addEventListener('click', function(){ setSongTranspose(song.id, offset+1); renderViewer(); });
    appEl.querySelector('[data-action="tone-down"]').addEventListener('click', function(){ setSongTranspose(song.id, offset-1); renderViewer(); });
    var resetBtn = appEl.querySelector('[data-action="tone-reset"]');
    if (resetBtn) resetBtn.addEventListener('click', function(){ setSongTranspose(song.id, 0); renderViewer(); });
    appEl.querySelector('[data-action="font-up"]').addEventListener('click', function(){ ui.fontSize=Math.min(32, ui.fontSize+2); prefs.fontSize=ui.fontSize; savePrefs(prefs); renderViewer(); });
    appEl.querySelector('[data-action="font-down"]').addEventListener('click', function(){ ui.fontSize=Math.max(11, ui.fontSize-2); prefs.fontSize=ui.fontSize; savePrefs(prefs); renderViewer(); });
    appEl.querySelector('[data-action="prev"]').addEventListener('click', function(){ navigate(-1); });
    appEl.querySelector('[data-action="next"]').addEventListener('click', function(){ navigate(1); });
    var editBtn = appEl.querySelector('[data-action="edit"]');
    if (editBtn) editBtn.addEventListener('click', function(){ stopAutoScroll(); ui.autoScrollOn=false; ui.menuOpen=false; ui.editingId=song.id; ui.view='form'; render(); });
    var delBtn = appEl.querySelector('[data-action="delete"]');
    if (delBtn) delBtn.addEventListener('click', function(){
      if (confirm('Excluir "'+song.title+'"? Essa ação não pode ser desfeita.')){
        stopAutoScroll(); ui.autoScrollOn=false;
        ui.menuOpen = false;
        songs = songs.filter(function(s){ return s.id!==song.id; });
        saveSongs();
        ui.view='library'; render();
      }
    });
  }

  function navigate(dir){
    stopAutoScroll(); ui.autoScrollOn=false;
    var idx = ui.navList.indexOf(ui.currentId);
    if (idx === -1){ ui.currentId = ui.navList[0]; render(); return; }
    var next = (idx + dir + ui.navList.length) % ui.navList.length;
    ui.currentId = ui.navList[next];
    ui.menuOpen = false;
    renderViewer();
  }

  function renderChordTokensHtml(line, offset, preferFlat){
    var parts = line.match(/\s+|\S+/g) || [];
    return parts.map(function(part){
      if (/^\s+$/.test(part)) return escapeHtml(part);
      if (isChordToken(part)){
        var t = transposeChordToken(part, offset, preferFlat);
        return '<span class="chord-tok" data-chord="'+escapeHtml(t)+'">'+escapeHtml(t)+'</span>';
      }
      return escapeHtml(part);
    }).join('');
  }

  function renderCifraLines(body, offset, preferFlat){
    return body.split('\n').map(function(line){
      var p = parseLine(line);
      if (p.type === 'blank') return '<div class="line blank"></div>';
      if (p.type === 'section') return '<div class="line section">'+escapeHtml(p.label)+'</div>';
      if (p.type === 'labelchord') return '<div class="line labelchord"><span class="lbl">'+escapeHtml(p.label)+'</span>'+renderChordTokensHtml(p.rest, offset, preferFlat)+'</div>';
      if (p.type === 'chord') return '<div class="line chord">'+renderChordTokensHtml(p.text, offset, preferFlat)+'</div>';
      return '<div class="line lyric">'+escapeHtml(p.text)+'</div>';
    }).join('');
  }

  /* ---- Tap-to-see chord popover ---- */
  var activePopover = null;
  var activePopoverEl = null;
  function closeChordPopover(){
    if (activePopover){ activePopover.remove(); activePopover = null; activePopoverEl = null; }
  }
  function showChordPopover(el){
    var name = el.getAttribute('data-chord');
    var shape = getChordShape(name);
    closeChordPopover();
    if (!shape){ toast('Sem diagrama para '+name+'.'); return; }
    var pop = document.createElement('div');
    pop.className = 'chord-popover';
    pop.innerHTML = '<div class="chord-popover-name">'+escapeHtml(name)+'</div>'+chordDiagramSVG(shape);
    document.body.appendChild(pop);
    var rect = el.getBoundingClientRect();
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var left = Math.min(Math.max(8, rect.left + rect.width/2 - pw/2), window.innerWidth - pw - 8);
    var top = rect.top - ph - 10;
    if (top < 8) top = rect.bottom + 10;
    pop.style.left = left+'px';
    pop.style.top = top+'px';
    activePopover = pop;
    activePopoverEl = el;
  }

  /* ======================= Add / Edit form ======================= */
  function renderForm(){
    closeChordPopover();
    var editing = ui.editingId ? songs.find(function(s){ return s.id===ui.editingId; }) : null;
    var styles = uniqueStyles();

    var html = '<div class="form-view">';
    html += '<div class="form-header"><button class="icon-btn" data-action="cancel">&#8592;</button><h2>'+(editing?'Editar música':'Nova música')+'</h2></div>';

    html += '<div class="paste-hint">Selecione todo o texto da cifra (Ctrl+A) e copie (Ctrl+C). Cole abaixo — título, artista e tom são detectados automaticamente.</div>';
    html += '<div class="field"><label>Cifra completa (colar aqui)</label><textarea class="cifra-input" id="f-paste" placeholder="Cole aqui o texto da cifra...">'+escapeHtml(editing?editing.body:'')+'</textarea></div>';
    html += '<div class="detect-row"><button class="link-btn" id="detect-btn">Detectar automaticamente &#8594;</button></div>';

    html += '<div class="field-row">';
    html += '<div class="field"><label>Título</label><input id="f-title" type="text" value="'+escapeHtml(editing?editing.title:'')+'"></div>';
    html += '<div class="field"><label>Artista</label><input id="f-artist" type="text" value="'+escapeHtml(editing?editing.artist:'')+'"></div>';
    html += '</div>';
    html += '<div class="field-row">';
    html += '<div class="field"><label>Tom</label><input id="f-tone" type="text" placeholder="ex: G, Am, C#m" value="'+escapeHtml(editing?editing.tone:'')+'"></div>';
    html += '<div class="field"><label>Estilo</label><input id="f-style" list="style-list" type="text" placeholder="ex: Sertanejo, Rock" value="'+escapeHtml(editing?editing.style:'')+'"></div>';
    html += '</div>';
    html += '<div class="field"><label>Link do vídeo (YouTube, opcional)</label><input id="f-video" type="text" placeholder="Cole aqui o link do YouTube" value="'+escapeHtml(editing?(editing.videoUrl||''):'')+'"></div>';
    html += '<datalist id="style-list">'+styles.map(function(s){ return '<option value="'+escapeHtml(s)+'">'; }).join('')+'</datalist>';

    html += '<label class="fav-toggle"><input type="checkbox" id="f-fav" '+(editing&&editing.favorite?'checked':'')+'> Marcar como favorita</label>';

    html += '<div class="form-actions">';
    if (editing) html += '<button class="btn danger" id="f-delete">Excluir</button>';
    html += '<button class="btn" id="f-cancel">Cancelar</button>';
    html += '<button class="btn primary" id="f-save">Salvar</button>';
    html += '</div>';
    html += '</div>';

    appEl.innerHTML = html;

    function runDetect(){
      var text = document.getElementById('f-paste').value;
      if (!text.trim()) return;
      var d = autoDetect(text);
      var titleEl = document.getElementById('f-title');
      var artistEl = document.getElementById('f-artist');
      var toneEl = document.getElementById('f-tone');
      if (!titleEl.value.trim() && d.title) titleEl.value = d.title;
      if (!artistEl.value.trim() && d.artist) artistEl.value = d.artist;
      if (!toneEl.value.trim() && d.tone) toneEl.value = d.tone;
      document.getElementById('f-paste').value = d.body;
    }
    document.getElementById('detect-btn').addEventListener('click', runDetect);
    document.getElementById('f-paste').addEventListener('paste', function(){
      setTimeout(runDetect, 30);
    });

    appEl.querySelector('[data-action="cancel"]').addEventListener('click', backFromForm);
    document.getElementById('f-cancel').addEventListener('click', backFromForm);
    function backFromForm(){
      ui.view = editing ? 'viewer' : 'library';
      render();
    }

    document.getElementById('f-save').addEventListener('click', function(){
      var title = document.getElementById('f-title').value.trim();
      var body = document.getElementById('f-paste').value;
      if (!title){ toast('Dê um título pra música.'); return; }
      if (editing){
        editing.title = title;
        editing.artist = document.getElementById('f-artist').value.trim();
        editing.tone = document.getElementById('f-tone').value.trim();
        editing.style = document.getElementById('f-style').value.trim();
        editing.favorite = document.getElementById('f-fav').checked;
        editing.body = body;
        editing.videoUrl = document.getElementById('f-video').value.trim();
        saveSongs();
        ui.currentId = editing.id; ui.view = 'viewer'; render();
      } else {
        var newSong = {
          id: uid(),
          title: title,
          artist: document.getElementById('f-artist').value.trim(),
          tone: document.getElementById('f-tone').value.trim(),
          style: document.getElementById('f-style').value.trim(),
          favorite: document.getElementById('f-fav').checked,
          body: body,
          videoUrl: document.getElementById('f-video').value.trim(),
          createdAt: Date.now()
        };
        songs.push(newSong);
        saveSongs();
        ui.view = 'library'; render();
        toast('Música adicionada!');
      }
    });

    if (editing){
      var delBtn = document.getElementById('f-delete');
      if (delBtn) delBtn.addEventListener('click', function(){
        if (confirm('Excluir "'+editing.title+'"?')){
          songs = songs.filter(function(s){ return s.id!==editing.id; });
          saveSongs();
          ui.view='library'; render();
        }
      });
    }
  }

  /* ======================= Init ======================= */
  var ICON_192 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAYAAABS3GwHAAAEvElEQVR4nO3dy3EbRxiF0SFL0TgLb13cKgbH5Bi4dXnrLJiOvHBBRUnAYB49/brnBABOSf833QMCzZelM39//e1b62vgOm/vHy+tr+Gzphdj2FmWtlFU/8GGnjW1Y6j2www+e9QK4fIfYvA54+oQLntxg09JV4VQ/EUNPlcqHcJryRcz/Fyt9IwVqcng00KJ1eD0CmD4aaXE7J0KwPDT2tkZPByA4acXZ2bxUACGn94cncndARh+enVkNncFYPjp3d4Z3RyA4WcUe2Z1UwCGn9FsndmnARh+RrVldot+FAJGsxqAuz+jezbDDwMw/MxibZZtgYh2NwB3f2bzaKatAET7JQB3f2Z1b7atAET7IQB3f2b384xbAYj2PQB3f1J8nnUrANEEQLTXZbH9Ic9t5q0ARBMA0QRANAEQ7cUDMMm+tL6Ao37/65/Wl8An//75R+tLOMQWiCJGvSEJgGgCINqwzwA3tfeea0t9i33w7Xpa7sFH3f4sywQB1LLlP7mHYWQfW6AN9t7hRr4jphHAE0eHWQRjEMCKs0Msgv4J4IFSwyuCvgmAaAK4o/Rd2yrQLwEQTQBEEwDRBEA0ARBNAEQTwB2lP8zmw3H9EgDRBPBAqbu2u3/fBLDi7PAa/v4J4ImjQ2z4xyCADfYOs+Efh69EbnQb6t6+E8w5Atjp85D7DvD4bIGINuzZoD5j358RV0IrANGGfwbo4UAo1zDuajxUAPf+oXsYAMY1RABOZeMq3T8DOJWNK3UdgFPZuFq3ATiVjRq6DMCpbNTSZQBQS3cBOJWNmroLAGoSANEEQDQBEE0ARBMA0boLwKls1NRdAFBTlwE4lY1augxgWZzKRh3dBrAsTmXjel0HsCxOZeNaQ3wl0qlsXGWIAG6cykZp3W+B4EpOhqOYEVdjKwDRhnoGuKeHE9Fcw7ir8fAB0MYsp/QJgF1mO6XPMwCbzXhKnwDYZNZT+gTAUzOf0icAVs1+Sp8AiCYAHko4pU8ARBMA0QRANAEQTQBEEwDRBMBDCaf0CYBoAmDV7Kf0CYCnZj6lTwBsMuspfQJgsxlP6fOVSHaZ7ZQ+AXDILKf02QIRTQBEczQixdgCwWCGfwju4UhA1zDuamwFIJoAiCYAogmAaAIgmgCIJgCiCYBoAiCaAIgmAKIJgGgCIJoAiCYAogmAaAIgmgCIJgCiCYBoAiCaAIgmAKI5GY5inAxHrBGHf1kGXgGgBCsA0QRANAEQTQBEEwDRBEA0ARBNAEQTANEEQLTXt/ePl9YXAS28vX+8WAGIJgCiCYBoAiDa67L8/zDQ+kKgptvMWwGIJgCifQ/ANogUn2fdCkC0HwKwCjC7n2fcCkC0XwKwCjCre7NtBSDa3QCsAszm0UxbAYj2MACrALNYm+XVFUAEjO7ZDNsCEe1pAFYBRrVldjetACJgNFtndvMWSASMYs+s7noGEAG92zujux+CRUCvjszmoXeBREBvjs7k4bdBRUAvzsziqd8DiIDWzs7g6V+EiYBWSsxe0eH1J1epoeRNt+hHIawGXK30jF02sFYDSrrq5nr5HVsInHH1rqLalkUI7FFrO119zy4E1tR+jmz60CoGlqXtmyfdvWsjirn19k7hf+B8l9PjovukAAAAAElFTkSuQmCC';
  var ICON_512 = 'data:image/png;base64,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';
  var ICON_180 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALQAAAC0CAYAAAA9zQYyAAAEcElEQVR4nO3dzXHbSBSF0ZZqopksvHVpOzE4Jsfg7ZS3zkLpeBZjuigZFP4a6O6Lc9YuESV9enwUwfZT6cC///z9s/U1sN/Lt9en1tfQ5AIEfA0tAj/tAUV8bWfFfeiDiJgpR8Z9yBcWMkscEfZz7S8oZpY6opVqvyFCZo9a07rKhBYze9VqaNdvhZA5wp5pvXlCi5mj7GlrU9Bi5mhbG1sdtJg5y5bWVgUtZs62trnFQYuZVta0tyhoMdPa0gZngxYzvVjSYvW3vqGlD4M2nenNXJMPgxYzvfqoTSsHUSaDNp3p3aNG/whazIxiqlUrB1HeBG06M5r3zZrQRBE0UX4Hbd1gVPftmtBEETRRnkuxbjC+W8MmNFEETRRBE+XJ/kwSE5oof7W+gDU+ff3e+hIu6ceXz60vYTETmlkjDRJBE0XQRBlqh745Y6db8jR71m55u5YWu+xI60YpgwZ9pDU/wJahMc3KcWfrNBptiiUTNFEE/cveKWtK90HQRBF0qTddTen2BE0UQRNF0EQRNFEETRRBl3pvXXsLvD1BE0XQv+ydrqZzHwRNFEHf2TplTed+uB/6nVucPd3gz3KCfuCjsIXcLyvHjB9fPr8JWMx9EzRRhjoKzO2Z7YzyzGRCE2XIF4UtP85/1cceRfdBT31DP339PsxTIOfqNui5yeBMDKZ0uUNvOewFSukw6C2BipqbroLeE6aoKaWjoGsEKWq6CRpq6CLompPVlL62LoKGWgRNFEETRdBEETRRugi65v0Y7u24ti6Chlq6CbrGZDWd6SboUvYFKWZK6SzoUraFKWZuugu6lHWBipl73X5iZe4EIyEzpdugb+7D9bEr5nS5csBWDpphkVGeFU1oonS/Q0+56mEvDpqZN2TQHO99yKO8IBc0b4x+wI+gKaWsXy16DduLQqLOQxE0UQR9cWkH/AiaKIK+sMQDfgRNFEETRdBEETRRBH1hieehCJoogr64tPNQBE0UQRN1wI/bRymlzB8b8ejf90bQvDH6eSiCZtL7sHsP+cYOTRTncrCICQ0NDLlDX/VsDOdyzDOhiSJoogiaKIImiqCJImiiCJoogiaKoIkiaKIImiiCJoqgiSJoogiaKIImiqCJImiiCJoogiaKoIkiaKI4aIZFHDRDjFFiLmWwCQ1zTGiiCJoogiaKoIkiaKIImiiCJoqgiSJoogiaKM8v316fWl8E1PDy7fXJhCaKoIkiaKI8l/L/7tH6QmCPW8MmNFEETZTfQVs7GNV9uyY0UQRNlDdBWzsYzftmTWii/BG0Kc0oplqdnNCipnePGrVyEOVh0KY0vfqozQ8ntKjpzVyTVg6izAZtStOLJS0umtCiprWlDS5eOURNK2vaW7VDi5qzrW1u9YtCUXOWLa1t+iuHqDna1sY2/9lO1BxlT1tVovT/tFBDjSFZ5Y0V05q9ajVUPUTTmjVqD8Pqb32b1ix1RCuHxmdaM+XIoXfaNBX3tZ31zN1kPRD3NbRYP7vYdwWeoYfXT/8Bzst9ETqGrSIAAAAASUVORK5CYII=';

  function injectInstallTags(){
    if (document.getElementById('cf-install-tags')) return;
    var holder = document.createElement('div');
    holder.id = 'cf-install-tags';
    holder.style.display = 'none';
    document.body.appendChild(holder);

    var manifest = {
      name: 'Cifra Fácil',
      short_name: 'Cifra Fácil',
      start_url: location.href.split('#')[0],
      display: 'standalone',
      background_color: '#F5EEE0',
      theme_color: '#B4552A',
      icons: [
        { src: ICON_192, sizes: '192x192', type: 'image/png' },
        { src: ICON_512, sizes: '512x512', type: 'image/png' }
      ]
    };
    var manifestUri = 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(manifest));

    function addTag(tag, attrs){
      var el = document.createElement(tag);
      Object.keys(attrs).forEach(function(k){ el.setAttribute(k, attrs[k]); });
      document.head.appendChild(el);
    }
    addTag('link', { rel:'manifest', href: manifestUri });
    addTag('meta', { name:'theme-color', content:'#B4552A' });
    addTag('meta', { name:'apple-mobile-web-app-capable', content:'yes' });
    addTag('meta', { name:'mobile-web-app-capable', content:'yes' });
    addTag('meta', { name:'apple-mobile-web-app-status-bar-style', content:'black-translucent' });
    addTag('meta', { name:'apple-mobile-web-app-title', content:'Cifra Fácil' });
    addTag('link', { rel:'apple-touch-icon', href: ICON_180 });
  }

  /* ---- Install as app (Android one-tap prompt + iOS instructions) ---- */
  var canInstall = false;
  var deferredInstallPrompt = null;
  var isStandaloneMode = false;
  var isIOSDevice = false;

  function detectPlatform(){
    try { isStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch(e){}
    isIOSDevice = /iphone|ipad|ipod/i.test(navigator.userAgent || '');
  }

  function wireInstallEvents(){
    window.addEventListener('beforeinstallprompt', function(e){
      e.preventDefault();
      deferredInstallPrompt = e;
      canInstall = true;
      if (ui.view === 'library') renderLibrary();
    });
    window.addEventListener('appinstalled', function(){
      canInstall = false; deferredInstallPrompt = null; isStandaloneMode = true;
      if (ui.view === 'library') renderLibrary();
      toast('Cifra Fácil instalado!');
    });
  }

  function doInstallClick(){
    if (deferredInstallPrompt){
      var promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      canInstall = false;
      promptEvent.prompt();
    } else if (isIOSDevice){
      showIOSInstallHint();
    } else {
      toast('Use o menu do navegador e escolha "Adicionar à tela de início".');
    }
  }

  function showIOSInstallHint(){
    var overlay = document.createElement('div');
    overlay.className = 'install-hint-overlay';
    overlay.innerHTML =
      '<div class="install-hint-card">' +
        '<div class="install-hint-title">Instalar no iPhone</div>' +
        '<div class="install-hint-steps">1. Toque no ícone de compartilhar <b>&#8593;</b> na barra do Safari.<br>2. Escolha <b>"Adicionar à Tela de Início"</b>.<br>3. Toque em <b>Adicionar</b>.</div>' +
        '<button class="btn primary" id="install-hint-close">Entendi</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function(e){ if (e.target === overlay) overlay.remove(); });
    document.getElementById('install-hint-close').addEventListener('click', function(){ overlay.remove(); });
  }

  function init(){
    injectInstallTags();
    detectPlatform();
    wireInstallEvents();
    render();
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
