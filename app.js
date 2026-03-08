/* ============================================================
   THEME
============================================================ */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const moon = document.getElementById('theme-icon-moon');
  const sun  = document.getElementById('theme-icon-sun');
  if (theme === 'dark') {
    if (moon) moon.style.display = '';
    if (sun)  sun.style.display  = 'none';
  } else {
    if (moon) moon.style.display = 'none';
    if (sun)  sun.style.display  = '';
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next    = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem('devprep_theme', next);
}

// Apply saved theme immediately (before DOM loads to avoid flash)
(function () {
  const saved = localStorage.getItem('devprep_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
})();

/* ============================================================
   DevPrep GT — app.js
   Stack: Vanilla JS + Groq API + Supabase (PostgreSQL) + Web Speech API
============================================================ */

// ============================================================
// SUPABASE CONFIG  ← pegar credenciales aquí
// ============================================================

// SUPABASE_URL y SUPABASE_KEY vienen de config.js (ver config.example.js)

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// GROQ CONFIG — la key vive en Supabase Edge Function, no aqui
// ============================================================

const GROQ_MODEL     = 'llama-3.3-70b-versatile';
const GROQ_PROXY_URL = `${SUPABASE_URL}/functions/v1/groq-proxy`;

// ============================================================
// CONSTANTS
// ============================================================

const SYSTEM_BASE = `Eres un entrevistador técnico senior y coach de carrera con 10 años de experiencia
en el mercado tech guatemalteco. Conoces empresas como Tigo, CGI Guatemala,
Banco Industrial, GBM Guatemala, y startups locales.

Contexto del mercado tech Guatemala 2025:
- Salario mínimo nacional 2025: Q3,973/mes (no agrícola, departamento de Guatemala)
- Developer junior (0-2 años): Q6,385 – Q12,000/mes
- Developer mid (3-5 años): Q12,000 – Q25,000/mes
- Developer senior (5+ años): Q25,000 – Q35,000/mes
- El inglés técnico es muy valorado, especialmente para empresas con clientes en EE.UU.
- Empresas locales piden mucho: .NET, Java, PHP
- Startups y empresas modernas: React, Node.js, Python, Flutter, mobile
- Principales empleadores tech en GT: Tigo, Claro, CGI, Banco Industrial, BAM, GBM

Responde siempre en español. Sé directo, profesional y útil.`;

const LINKS_EMPLEO_GT = [
  { nombre: "LinkedIn Guatemala",     url: "https://gt.linkedin.com/jobs",                             descripcion: "El más importante para tech. Activa 'Open to Work' en tu perfil.",          tipo: "Internacional" },
  { nombre: "Tecoloco",               url: "https://www.tecoloco.com.gt/empleo/programador",            descripcion: "Bolsa de trabajo líder en Guatemala. Sección específica de programadores.", tipo: "Local Guatemala" },
  { nombre: "Computrabajo Guatemala", url: "https://gt.computrabajo.com/trabajo-de-programador",        descripcion: "Gran volumen de ofertas locales para desarrolladores.",                    tipo: "Local Guatemala" },
  { nombre: "UnMejorEmpleo",          url: "https://www.unmejorempleo.com.gt/trabajo-programador.html", descripcion: "Bolsa local con ofertas de empresas guatemaltecas.",                       tipo: "Local Guatemala" },
  { nombre: "Indeed Guatemala",       url: "https://www.indeed.com/jobs?l=Guatemala",                   descripcion: "Mezcla de empleos locales e internacionales remotos.",                    tipo: "Internacional" },
  { nombre: "Torre.ai",               url: "https://torre.ai",                                          descripcion: "Plataforma latinoamericana de tech. Muy usada en GT para roles remotos.", tipo: "Latam / Remoto" },
  { nombre: "Get on Board",           url: "https://www.getonbrd.com",                                  descripcion: "Empleos tech en Latinoamérica. Muchos remotos accesibles desde Guatemala.", tipo: "Latam / Remoto" },
  { nombre: "Workana",                url: "https://www.workana.com",                                   descripcion: "Para freelance o proyectos mientras consigues empleo fijo.",               tipo: "Freelance / Remoto" }
];

// ============================================================
// STATE
// ============================================================

const appState = {
  usuario: null,
  cvTexto: "",
  puestoObjetivo: "",
  documentoPreparacion: "",
  mensajesEntrevista: [],
  numPreguntas: 10,
  entrevistaTerminada: false,
  reporteFinal: "",
  recognition: null,
  isListening: false,
  vozEntrevistador: true,
  // Training
  trainingProgress: {},     // { moduloId: { score, xp, completado } }
  currentQuiz: {
    modulo: null,
    preguntas: [],
    idx: 0,
    corazones: 3,
    score: 0,
    respondido: false
  }
};

// ============================================================
// TRAINING CONSTANTS
// ============================================================

const TRAINING_MODULES = [
  { id: 'presentacion', icon: '🎤', title: 'Presentación',     color: '#FF9F1C', colorDim: 'rgba(255,159,28,0.12)',  area: 'presentación personal, elevator pitch de 30 segundos y cómo hablar de ti en la entrevista' },
  { id: 'stack',        icon: '💻', title: 'Stack técnico',    color: '#00D9C0', colorDim: 'rgba(0,217,192,0.12)',   area: 'tecnologías, lenguajes, frameworks y herramientas técnicas del CV' },
  { id: 'conceptos',   icon: '📚', title: 'Conceptos clave',  color: '#C792EA', colorDim: 'rgba(199,146,234,0.12)', area: 'temas técnicos a repasar, conceptos y recursos de estudio' },
  { id: 'proyectos',   icon: '🚀', title: 'Proyectos',        color: '#00E676', colorDim: 'rgba(0,230,118,0.12)',   area: 'proyectos personales y experiencia laboral usando el método STAR' },
  { id: 'softskills',  icon: '🤝', title: 'Soft Skills',      color: '#FF5370', colorDim: 'rgba(255,83,112,0.12)',  area: 'preguntas de comportamiento, habilidades blandas y situaciones de trabajo en equipo' },
  { id: 'salario',     icon: '💰', title: 'Negociación',      color: '#FFB74D', colorDim: 'rgba(255,183,77,0.12)',  area: 'expectativas salariales, negociación y cómo responder preguntas de dinero en Guatemala' },
];

// ============================================================
// AUTH STATE — Supabase session listener
// ============================================================

db.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    appState.usuario = session.user;
    const nombre = session.user.user_metadata?.nombre || session.user.email.split('@')[0];
    document.getElementById('user-display-name').textContent = nombre;
    const homeName = document.getElementById('home-nombre');
    if (homeName) homeName.textContent = nombre.split(' ')[0];
    mostrarPantalla('screen-home');
    cargarHistorial();
  } else {
    appState.usuario = null;
    mostrarPantalla('screen-landing');
  }
});

// ============================================================
// AUTH FUNCTIONS
// ============================================================

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((b, i) =>
    b.classList.toggle('active', (tab === 'login' && i === 0) || (tab === 'register' && i === 1))
  );
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.getElementById(`auth-${tab}`).classList.add('active');
}

async function loginUsuario() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showError('Ingresa tu email y contraseña.'); return; }

  showLoading('Iniciando sesión...');
  const { error } = await db.auth.signInWithPassword({ email, password });
  hideLoading();
  if (error) showError(tradError(error.message));
}

async function registrarUsuario() {
  const nombre   = document.getElementById('register-nombre').value.trim();
  const email    = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;

  if (!nombre)             { showError('Ingresa tu nombre.'); return; }
  if (!email)              { showError('Ingresa tu correo.'); return; }
  if (password.length < 6) { showError('La contraseña debe tener al menos 6 caracteres.'); return; }

  showLoading('Creando tu cuenta...');
  const { data, error } = await db.auth.signUp({
    email,
    password,
    options: { data: { nombre } }
  });
  hideLoading();

  if (error) { showError(tradError(error.message)); return; }

  // Insertar perfil en tabla profiles
  if (data.user) {
    await db.from('profiles').insert({
      id:     data.user.id,
      nombre,
      email
    });
  }

  showSuccess('Cuenta creada. Revisa tu email para confirmar (o ya puedes entrar).');
}

async function cerrarSesion() {
  window.speechSynthesis.cancel();
  await db.auth.signOut();
}

function tradError(msg) {
  if (msg.includes('Invalid login'))          return 'Email o contraseña incorrectos.';
  if (msg.includes('already registered'))     return 'Ya existe una cuenta con ese email.';
  if (msg.includes('Password should be'))     return 'La contraseña debe tener al menos 6 caracteres.';
  if (msg.includes('Unable to validate'))     return 'Email inválido.';
  if (msg.includes('Email not confirmed'))    return 'Confirma tu email antes de entrar.';
  if (msg.includes('too many requests'))      return 'Demasiados intentos. Espera unos minutos.';
  return 'Error: ' + msg;
}

// ============================================================
// SUPABASE DB — GUARDAR
// ============================================================

async function guardarDocumento(puesto, documento) {
  if (!appState.usuario) return;
  const { error } = await db.from('documentos').insert({
    user_id:    appState.usuario.id,
    puesto,
    documento,
    cv_resumen: appState.cvTexto.substring(0, 300)
  });
  if (error) {
    console.error('Error guardando documento:', error.message);
    showError('No se pudo guardar el documento en el historial: ' + error.message);
  } else {
    showSuccess('Documento guardado en tu historial.');
  }
}

async function guardarEntrevista(puesto, reporte, puntuacion) {
  if (!appState.usuario) return;
  const transcripcion = appState.mensajesEntrevista
    .filter(m => !(m.role === 'user' && m.content === 'Inicia la entrevista por favor.'))
    .map(m => ({ rol: m.role === 'assistant' ? 'entrevistador' : 'candidato', texto: m.content }));

  const { error } = await db.from('entrevistas').insert({
    user_id:       appState.usuario.id,
    puesto,
    num_preguntas: appState.numPreguntas,
    reporte,
    puntuacion:    puntuacion || 0,
    transcripcion
  });
  if (error) {
    console.error('Error guardando entrevista:', error.message);
    showError('No se pudo guardar la entrevista en el historial: ' + error.message);
  } else {
    showSuccess('Entrevista guardada en tu historial.');
  }
}

// ============================================================
// SUPABASE DB — CARGAR HISTORIAL
// ============================================================

function actualizarStats(docs, ents) {
  const elDocs  = document.getElementById('stat-docs');
  const elEnts  = document.getElementById('stat-entrevistas');
  const elScore = document.getElementById('stat-score');
  const elUlt   = document.getElementById('stat-ultima');

  if (elDocs)  elDocs.textContent  = docs  ? docs.length  : 0;
  if (elEnts)  elEnts.textContent  = ents  ? ents.length  : 0;

  if (elScore && ents && ents.length > 0) {
    const conScore = ents.filter(e => e.puntuacion > 0);
    if (conScore.length > 0) {
      const avg = Math.round(conScore.reduce((s, e) => s + e.puntuacion, 0) / conScore.length);
      elScore.textContent = avg + '/100';
    } else {
      elScore.textContent = 'N/A';
    }
  } else if (elScore) {
    elScore.textContent = 'N/A';
  }

  if (elUlt) {
    const todas = [
      ...(docs  || []).map(d => d.creado_en),
      ...(ents  || []).map(e => e.creado_en)
    ].sort().reverse();
    elUlt.textContent = todas.length > 0 ? formatFecha(todas[0]) : '—';
  }
}

async function cargarHistorial() {
  if (!appState.usuario) return;
  const uid = appState.usuario.id;

  // Documentos
  const { data: docs } = await db
    .from('documentos')
    .select('id, puesto, creado_en')
    .eq('user_id', uid)
    .order('creado_en', { ascending: false })
    .limit(10);

  const docsContainer = document.getElementById('historial-docs');
  if (!docs || docs.length === 0) {
    docsContainer.innerHTML = '<p class="historial-empty">// sin documentos generados</p>';
  } else {
    docsContainer.innerHTML = docs.map(d => `
      <div class="historial-item">
        <div class="hi-icon">📄</div>
        <div class="hi-info">
          <div class="hi-puesto">${d.puesto}</div>
          <div class="hi-fecha">${formatFecha(d.creado_en)}</div>
        </div>
        <button class="btn btn-secondary small" onclick="verDocumentoId('${d.id}')">Ver →</button>
      </div>`).join('');
  }

  // Entrevistas
  const { data: ents } = await db
    .from('entrevistas')
    .select('id, puesto, num_preguntas, puntuacion, creado_en')
    .eq('user_id', uid)
    .order('creado_en', { ascending: false })
    .limit(10);

  const entContainer = document.getElementById('historial-entrevistas');
  if (!ents || ents.length === 0) {
    entContainer.innerHTML = '<p class="historial-empty">// sin entrevistas registradas</p>';
  } else {
    entContainer.innerHTML = ents.map(d => {
      const score = d.puntuacion ? `<span class="hi-score">${d.puntuacion}/100</span>` : '';
      return `
        <div class="historial-item">
          <div class="hi-icon">💬</div>
          <div class="hi-info">
            <div class="hi-puesto">${d.puesto} ${score}</div>
            <div class="hi-fecha">${formatFecha(d.creado_en)} · ${d.num_preguntas} preguntas</div>
          </div>
          <button class="btn btn-secondary small" onclick="verEntrevistaId('${d.id}')">Ver →</button>
        </div>`;
    }).join('');
  }

  actualizarStats(docs, ents);
}

async function verDocumentoId(id) {
  const { data, error } = await db.from('documentos').select('documento, puesto').eq('id', id).single();
  if (error || !data) { showError('No se pudo cargar el documento.'); return; }
  document.getElementById('historial-detalle-content').innerHTML = markdownToHTML(data.documento);
  mostrarPantalla('screen-historial-detalle');
}

async function verEntrevistaId(id) {
  const { data, error } = await db.from('entrevistas').select('reporte, puesto').eq('id', id).single();
  if (error || !data) { showError('No se pudo cargar la entrevista.'); return; }
  document.getElementById('historial-detalle-content').innerHTML = markdownToHTML(data.reporte);
  mostrarPantalla('screen-historial-detalle');
}

function switchHistorialTab(tab) {
  document.querySelectorAll('.htab').forEach((b, i) =>
    b.classList.toggle('active', (tab === 'docs' && i === 0) || (tab === 'entrevistas' && i === 1))
  );
  document.querySelectorAll('.historial-list').forEach(l => l.classList.remove('active'));
  document.getElementById(`historial-${tab}`).classList.add('active');
}

function formatFecha(iso) {
  return new Date(iso).toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' });
}

function extractPuntuacion(reporte) {
  const match = reporte.match(/PUNTUACI[ÓO]N GENERAL[:\s]*(\d+)/i);
  return match ? parseInt(match[1]) : 0;
}

// ============================================================
// NAVIGATION
// ============================================================

const SCREENS_SIN_TOGGLE = new Set(['screen-m2-chat', 'screen-training-quiz']);

function mostrarPantalla(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.style.display = SCREENS_SIN_TOGGLE.has(id) ? 'none' : '';
}

// ============================================================
// GROQ API
// ============================================================

async function callAI(systemPrompt, messages, maxTokens = 2048) {
  const { data: { session } } = await db.auth.getSession();
  if (!session) throw new Error('Sesion expirada. Vuelve a iniciar sesion.');

  const res = await fetch(GROQ_PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_KEY
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      max_tokens: maxTokens,
      temperature: 0.8
    })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || `Error ${res.status}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Respuesta vacía. Intenta de nuevo.');
  return text;
}

// ============================================================
// VOICE
// ============================================================

function initVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  const micBtn = document.getElementById('btn-mic');
  if (micBtn) micBtn.style.display = 'flex';
  const note = document.getElementById('voice-support-note');
  if (note) note.style.display = 'flex';

  if (appState.recognition) return;

  appState.recognition = new SR();
  appState.recognition.lang = 'es-ES';
  appState.recognition.continuous = false;
  appState.recognition.interimResults = false;

  appState.recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    const input = document.getElementById('input-respuesta');
    if (input) input.value = transcript;
    appState.isListening = false;
    setMicState(false);
  };

  appState.recognition.onerror = () => { appState.isListening = false; setMicState(false); };
  appState.recognition.onend   = () => { appState.isListening = false; setMicState(false); };
}

function setMicState(active) {
  const btn = document.getElementById('btn-mic');
  if (!btn) return;
  btn.classList.toggle('listening', active);
  btn.textContent = active ? '⏹' : '🎤';
}

function startListening() {
  if (!appState.recognition) return;
  if (appState.isListening) {
    appState.recognition.stop();
    appState.isListening = false;
    setMicState(false);
    return;
  }
  appState.isListening = true;
  setMicState(true);
  try { appState.recognition.start(); } catch (e) { console.warn(e); }
}

function toggleVozEntrevistador() {
  appState.vozEntrevistador = !appState.vozEntrevistador;
  const btn = document.getElementById('voice-toggle');
  if (btn) {
    btn.textContent = appState.vozEntrevistador ? '🔊 Voz ON' : '🔇 Voz OFF';
    btn.classList.toggle('active', appState.vozEntrevistador);
  }
  if (!appState.vozEntrevistador) window.speechSynthesis.cancel();
}

function updateSpeechBubble(texto) {
  const el = document.getElementById('latest-bubble-text');
  if (!el) return;
  const clean = texto.replace(/[*#\[\]_`>]/g, '').replace(/\s+/g, ' ').trim();
  el.textContent = clean.length > 220 ? clean.substring(0, 220) + '...' : clean;
}

function setCharTalking(active) {
  const char = document.getElementById('marcos-char');
  if (!char) return;
  char.classList.toggle('is-talking', active);
}

function hablarTexto(texto) {
  if (!appState.vozEntrevistador || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const clean = texto.replace(/[*#\[\]_`>]/g, ' ').replace(/\s+/g, ' ').trim();
  const utt = new SpeechSynthesisUtterance(clean);
  utt.lang = 'es-ES';
  utt.rate = 1.05;
  setCharTalking(true);
  utt.onend   = () => setCharTalking(false);
  utt.onerror = () => setCharTalking(false);
  window.speechSynthesis.speak(utt);
}

// ============================================================
// UTILS
// ============================================================

function markdownToHTML(texto) {
  const lines = texto.split('\n');
  const out = [];
  let inList = false;
  for (const line of lines) {
    const listMatch = line.match(/^[-*] (.+)$/);
    if (listMatch) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(listMatch[1])}</li>`);
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      if      (line.match(/^#### /)) out.push(`<h5>${inline(line.slice(5))}</h5>`);
      else if (line.match(/^### /))  out.push(`<h4>${inline(line.slice(4))}</h4>`);
      else if (line.match(/^## /))   out.push(`<h3>${inline(line.slice(3))}</h3>`);
      else if (line.match(/^# /))    out.push(`<h2>${inline(line.slice(2))}</h2>`);
      else if (line.trim() === '')   out.push('<br>');
      else                           out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}

function inline(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,     '<em>$1</em>')
    .replace(/`(.+?)`/g,       '<code>$1</code>');
}

function showLoading(msg = 'Procesando...') {
  const el = document.getElementById('loading-overlay');
  if (!el) return;
  el.querySelector('.loading-msg').textContent = msg;
  el.classList.add('active');
}

function hideLoading() {
  document.getElementById('loading-overlay')?.classList.remove('active');
}

function showError(msg) {
  const el = document.getElementById('error-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 5000);
}

function showSuccess(msg) {
  const el = document.getElementById('success-toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ============================================================
// MODULE 1 — CV INPUT
// ============================================================

function irModulo1() {
  mostrarPantalla('screen-m1-input');
  mostrarTab('tab-paste');
}

function mostrarTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  document.querySelector(`.tab-btn[data-tab="${tabId}"]`)?.classList.add('active');
}

function handleFileSelect(input) {
  const file = input.files[0];
  if (file) document.getElementById('file-name-display').textContent = `✓ ${file.name}`;
}

async function leerArchivoPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let texto = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    texto += content.items.map(item => item.str).join(' ') + '\n';
  }
  return texto;
}

async function generarDocumento() {
  const puesto = document.getElementById('puesto-m1').value.trim();
  if (!puesto) { showError('Selecciona el área técnica.'); return; }

  let cvTexto = '';
  const activeTab = document.querySelector('.tab-content.active');

  if (activeTab.id === 'tab-pdf') {
    const file = document.getElementById('cv-file').files[0];
    if (!file) { showError('Sube tu CV en PDF.'); return; }
    cvTexto = await leerArchivoPDF(file);
    if (cvTexto.length < 100) {
      showError('Tu PDF parece estar escaneado. Usa la pestaña "Pegar texto".');
      return;
    }
  } else {
    cvTexto = document.getElementById('cv-textarea').value.trim();
    if (!cvTexto) { showError('Pega el contenido de tu CV.'); return; }
  }

  appState.cvTexto = cvTexto;
  appState.puestoObjetivo = puesto;

  const userMessage = `El usuario quiere prepararse para una entrevista como developer.

PUESTO AL QUE APLICA: ${puesto}

CONTENIDO DE SU CV:
---
${cvTexto}
---

Genera un documento de preparación completo y 100% personalizado basado en el CV real.
NO uses información genérica. Cada sección debe estar anclada en lo que dice su CV.

## 1. TU PERFIL EN 30 SEGUNDOS
Escribe exactamente cómo debe responder "Háblame de ti".
Máximo 4 oraciones. Natural, no robótico. Usa su nombre si aparece en el CV.

## 2. TU STACK TÉCNICO — QUÉ TE VAN A PREGUNTAR
Para cada tecnología del CV: 2-3 preguntas probables + punto clave de respuesta.

## 3. TEMAS A REPASAR URGENTE
Áreas ausentes o débiles. Máximo 5 temas con recurso gratuito (nombre + URL real).

## 4. TUS PROYECTOS — CÓMO HABLARLOS
Para cada proyecto/experiencia: guía STAR en 3-4 líneas (Situación → Tarea → Acción → Resultado).

## 5. PREGUNTAS DE COMPORTAMIENTO
Las 5 preguntas blandas más probables. Guía de respuesta de 2-3 líneas para cada una.

## 6. SALARIO — QUÉ PEDIR
Rango de mercado en Guatemala para su stack. Cómo responder la pregunta de pretensión salarial.

## 7. LO QUE NO DEBES HACER
5 errores específicos de developers junior guatemaltecos. Cuáles aplican más a su perfil.

## 8. PREGUNTAS PARA HACER AL ENTREVISTADOR
5 preguntas inteligentes adaptadas al tipo de puesto.

Usa formato markdown: ## para secciones, - para listas, **negrita** para énfasis.`;

  showLoading('Analizando tu perfil y preparando tu guía...');
  try {
    const doc = await callAI(SYSTEM_BASE, [{ role: 'user', content: userMessage }], 3000);
    appState.documentoPreparacion = doc;
    hideLoading();
    document.getElementById('doc-content').innerHTML = markdownToHTML(doc);
    mostrarPantalla('screen-m1-doc');
    await guardarDocumento(puesto, doc);
    cargarHistorial();
  } catch (e) {
    hideLoading();
    showError('Error al generar el documento: ' + e.message);
  }
}

function copiarDocumento() {
  if (!appState.documentoPreparacion) return;
  navigator.clipboard.writeText(appState.documentoPreparacion)
    .then(() => showSuccess('Copiado al portapapeles'))
    .catch(() => showError('No se pudo copiar.'));
}

function imprimirDocumento() { window.print(); }

// ============================================================
// MODULE 2 — CONFIG
// ============================================================

function irModulo2() {
  if (appState.cvTexto)        document.getElementById('cv-m2').value     = appState.cvTexto;
  if (appState.puestoObjetivo) document.getElementById('puesto-m2').value = appState.puestoObjetivo;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SR) document.getElementById('voice-support-note').style.display = 'flex';
  mostrarPantalla('screen-m2-config');
}

function buildSystemPromptEntrevista() {
  const cvCtx = appState.cvTexto
    ? `\nCONTEXTO DEL CV:\n${appState.cvTexto.substring(0, 1500)}`
    : '\nNo se proporcionó CV. Conduce la entrevista de forma genérica.';

  return `Eres "Marcos Fuentes", Lead Developer con 8 años de experiencia en TechCore Guatemala.
Llevas 3 años haciendo entrevistas técnicas.

Puesto: ${appState.puestoObjetivo || 'Developer Junior'}
Preguntas a hacer: ${appState.numPreguntas}
${cvCtx}

REGLAS:
- Primer mensaje: saluda, preséntate brevemente (Marcos Fuentes, TechCore Guatemala) y haz tu primera pregunta
- Una sola pregunta por mensaje
- Si la respuesta es vaga, pide un ejemplo concreto
- Si la respuesta es buena, reacciona naturalmente y avanza
- NO evalúes ni des feedback durante la sesión
- Si piden feedback: "Eso lo revisamos al cerrar la sesión"
- Tras ${appState.numPreguntas} preguntas: cierra naturalmente y añade [ENTREVISTA_COMPLETADA] al final
- Siempre en español`;
}

// ============================================================
// MODULE 2 — CHAT
// ============================================================

async function iniciarEntrevista() {
  const puesto = document.getElementById('puesto-m2').value.trim();
  if (!puesto) { showError('Selecciona el área técnica.'); return; }

  appState.puestoObjetivo      = puesto;
  appState.cvTexto             = document.getElementById('cv-m2').value.trim();
  appState.numPreguntas        = parseInt(document.querySelector('input[name="duracion"]:checked')?.value || '10');
  appState.mensajesEntrevista  = [];
  appState.entrevistaTerminada = false;

  mostrarPantalla('screen-m2-chat');
  document.getElementById('chat-messages').innerHTML = '';
  document.getElementById('input-area').style.display = 'block';

  initVoice();

  showLoading('Marcos está preparando la entrevista...');
  try {
    const seed = { role: 'user', content: 'Inicia la entrevista por favor.' };
    appState.mensajesEntrevista.push(seed);

    const respuesta = await callAI(buildSystemPromptEntrevista(), appState.mensajesEntrevista, 450);
    appState.mensajesEntrevista.push({ role: 'assistant', content: respuesta });

    hideLoading();
    renderMensaje('entrevistador', respuesta);
    hablarTexto(respuesta);
  } catch (e) {
    hideLoading();
    showError('Error al iniciar: ' + e.message);
  }
}

function renderMensaje(rol, texto) {
  if (rol === 'entrevistador') updateSpeechBubble(texto);

  const container = document.getElementById('chat-messages');
  const div = document.createElement('div');
  div.className = `msg msg-${rol}`;

  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = rol === 'entrevistador' ? 'MF' : 'TÚ';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = `<p>${texto.replace(/\n/g, '<br>')}</p>`;

  if (rol === 'entrevistador') {
    div.append(avatar, bubble);
  } else {
    div.append(bubble, avatar);
  }

  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function enviarRespuesta() {
  const input = document.getElementById('input-respuesta');
  const texto = input.value.trim();
  if (!texto || appState.entrevistaTerminada) return;

  window.speechSynthesis.cancel();
  input.value = '';
  renderMensaje('candidato', texto);
  appState.mensajesEntrevista.push({ role: 'user', content: texto });

  showLoading('Marcos está respondiendo...');
  try {
    const respuesta = await callAI(buildSystemPromptEntrevista(), appState.mensajesEntrevista, 500);
    appState.mensajesEntrevista.push({ role: 'assistant', content: respuesta });
    hideLoading();

    if (respuesta.includes('[ENTREVISTA_COMPLETADA]')) {
      const limpio = respuesta.replace('[ENTREVISTA_COMPLETADA]', '').trim();
      renderMensaje('entrevistador', limpio);
      hablarTexto(limpio);
      appState.entrevistaTerminada = true;
      document.getElementById('input-area').style.display = 'none';
      const btn = document.getElementById('btn-terminar');
      btn.style.display = 'inline-flex';
      btn.textContent   = 'Ver mi reporte final →';
    } else {
      renderMensaje('entrevistador', respuesta);
      hablarTexto(respuesta);
    }
  } catch (e) {
    hideLoading();
    appState.mensajesEntrevista.pop();
    showError('Error: ' + e.message);
  }
}

async function terminarEntrevista() {
  window.speechSynthesis.cancel();
  appState.entrevistaTerminada = true;
  document.getElementById('input-area').style.display = 'none';
  await generarReporte();
}

// ============================================================
// MODULE 2 — REPORT
// ============================================================

async function generarReporte() {
  mostrarPantalla('screen-m2-reporte');
  showLoading('Analizando tu desempeño...');

  const transcript = appState.mensajesEntrevista
    .filter(m => !(m.role === 'user' && m.content === 'Inicia la entrevista por favor.'))
    .map(m => `${m.role === 'assistant' ? 'Marcos (Entrevistador)' : 'Candidato'}: ${m.content}`)
    .join('\n\n');

  const cvCtx = appState.cvTexto ? `\nCV:\n${appState.cvTexto.substring(0, 800)}` : '';

  const prompt = `Acabas de entrevistar a un candidato para: ${appState.puestoObjetivo}
${cvCtx}

TRANSCRIPCIÓN:
---
${transcript}
---

Genera el reporte con estas secciones exactas:

## PUNTUACIÓN GENERAL: [X]/100

## PUNTOS FUERTES
3-5 puntos específicos. Cita frases reales.

## PUNTOS A MEJORAR
3-5 debilidades concretas con cómo mejorarlas.

## RESPUESTAS A REFORMULAR
Las 2-3 respuestas más débiles:
- **Pregunta:** [texto]
- **Su respuesta:** [resumen]
- **Cómo mejorarla:** [sugerencia]

## PLAN DE ACCIÓN — ESTA SEMANA
3 acciones concretas en 7 días. Específicas, no genéricas.

## CONCLUSIÓN
Párrafo honesto sobre su nivel. Sin frases vacías.`;

  try {
    const reporte = await callAI(SYSTEM_BASE, [{ role: 'user', content: prompt }], 2500);
    appState.reporteFinal = reporte;
    hideLoading();
    renderReporte(reporte);
    const puntuacion = extractPuntuacion(reporte);
    await guardarEntrevista(appState.puestoObjetivo, reporte, puntuacion);
    cargarHistorial();
  } catch (e) {
    hideLoading();
    showError('Error al generar el reporte: ' + e.message);
  }
}

function renderReporte(reporte) {
  document.getElementById('reporte-content').innerHTML = markdownToHTML(reporte);
  document.getElementById('links-empleo').innerHTML = LINKS_EMPLEO_GT.map(l => `
    <a href="${l.url}" target="_blank" rel="noopener noreferrer" class="link-card">
      <div class="link-tipo">${l.tipo}</div>
      <div class="link-nombre">${l.nombre}</div>
      <div class="link-desc">${l.descripcion}</div>
    </a>`).join('');
}

// ============================================================
// GLOBAL
// ============================================================

function volverHome() {
  window.speechSynthesis.cancel();
  mostrarPantalla('screen-home');
  cargarHistorial();
}

// ============================================================
// TRAINING — PROGRESS (localStorage)
// ============================================================

function guardarProgresoTraining() {
  localStorage.setItem('devprep_training_' + (appState.usuario?.id || 'guest'),
    JSON.stringify(appState.trainingProgress));
}

function cargarProgresoTraining() {
  const raw = localStorage.getItem('devprep_training_' + (appState.usuario?.id || 'guest'));
  if (raw) {
    try { appState.trainingProgress = JSON.parse(raw); } catch (e) { appState.trainingProgress = {}; }
  }
  // Update total XP badge
  const totalXP = Object.values(appState.trainingProgress).reduce((s, m) => s + (m.xp || 0), 0);
  const el = document.getElementById('training-xp-total');
  if (el) el.textContent = totalXP + ' XP';
}

// ============================================================
// TRAINING — ENTRY POINT
// ============================================================

async function irEntrenamiento() {
  // Gate: needs a preparation document
  if (!appState.documentoPreparacion) {
    showLoading('Cargando tu documento...');
    const { data } = await db.from('documentos')
      .select('documento, puesto')
      .eq('user_id', appState.usuario.id)
      .order('creado_en', { ascending: false })
      .limit(1)
      .single();
    hideLoading();
    if (!data) {
      showError('Primero genera tu documento de preparación (opción 1 del menú).');
      return;
    }
    appState.documentoPreparacion = data.documento;
    appState.puestoObjetivo       = data.puesto;
  }
  cargarProgresoTraining();
  mostrarPantalla('screen-training');
  renderModulosEntrenamiento();
}

// ============================================================
// TRAINING — MODULE GRID
// ============================================================

function renderModulosEntrenamiento() {
  const grid = document.getElementById('training-modules-grid');
  if (!grid) return;

  grid.innerHTML = TRAINING_MODULES.map(m => {
    const prog    = appState.trainingProgress[m.id];
    const done    = prog?.completado;
    const score   = prog?.score  ?? 0;
    const xp      = prog?.xp     ?? 0;
    const stars   = score >= 5 ? '⭐⭐⭐' : score >= 4 ? '⭐⭐' : score >= 3 ? '⭐' : '';
    const pct     = done ? Math.round((score / 5) * 100) : 0;
    const badge   = done ? '<span class="tmc-completed-badge">✓ Hecho</span>' : '';

    return `
      <div class="training-module-card"
           style="--mc-color:${m.color};--mc-color-dim:${m.colorDim}"
           onclick="iniciarModulo('${m.id}')">
        ${badge}
        <div class="tmc-icon-wrap">${m.icon}</div>
        <div class="tmc-title">${m.title}</div>
        <div class="tmc-desc">5 preguntas · basado en tu CV</div>
        <div class="tmc-progress"><div class="tmc-progress-fill" style="width:${pct}%"></div></div>
        <div class="tmc-footer">
          <span class="tmc-stars">${stars || '○○○'}</span>
          <span class="tmc-xp">${xp > 0 ? xp + ' XP' : 'Disponible'}</span>
        </div>
      </div>`;
  }).join('');
}

// ============================================================
// TRAINING — START MODULE
// ============================================================

async function iniciarModulo(moduloId) {
  const modulo = TRAINING_MODULES.find(m => m.id === moduloId);
  if (!modulo) return;

  appState.currentQuiz = {
    modulo,
    preguntas: [],
    idx: 0,
    corazones: 3,
    score: 0,
    respondido: false
  };

  mostrarPantalla('screen-training-quiz');

  // Reset UI
  document.getElementById('quiz-progress-fill').style.width = '0%';
  document.getElementById('quiz-progress-label').textContent = '1 / 5';
  document.getElementById('quiz-hearts').textContent = '❤️❤️❤️';
  document.getElementById('quiz-complete-overlay').classList.remove('show');
  document.getElementById('quiz-feedback-panel').classList.remove('show', 'is-correct', 'is-wrong');
  document.getElementById('quiz-module-tag').textContent = modulo.icon + '  ' + modulo.title;
  document.getElementById('quiz-module-tag').style.borderColor = modulo.color;
  document.getElementById('quiz-module-tag').style.color = modulo.color;
  const bubbleEl = document.getElementById('quiz-bubble-text');
  if (bubbleEl) bubbleEl.textContent = 'Preparando tus preguntas...';
  setQuizCharTalking(true);
  document.getElementById('quiz-options').innerHTML = '';

  showLoading('Generando preguntas para ' + modulo.title + '...');
  try {
    const preguntas = await generarPreguntasQuiz(modulo);
    appState.currentQuiz.preguntas = preguntas;
    hideLoading();
    setQuizCharTalking(false);
    renderPreguntaQuiz();
  } catch (e) {
    hideLoading();
    setQuizCharTalking(false);
    showError('Error generando preguntas: ' + e.message);
    mostrarPantalla('screen-training');
  }
}

// ============================================================
// TRAINING — GENERATE QUESTIONS via AI
// ============================================================

async function generarPreguntasQuiz(modulo) {
  const docResumen = appState.documentoPreparacion.substring(0, 2800);

  const prompt = `Eres un generador de quizzes para preparación de entrevistas técnicas.

Basado en este documento de preparación:
---
${docResumen}
---

Genera exactamente 5 preguntas de opción múltiple sobre el tema: "${modulo.area}"

Reglas:
- Las preguntas deben basarse 100% en el contenido del documento
- Cada pregunta tiene exactamente 4 opciones
- Solo UNA opción es correcta
- Las opciones incorrectas deben ser plausibles pero claramente erróneas
- La explicación debe ser concisa (1-2 oraciones)

Responde ÚNICAMENTE con JSON válido (sin texto adicional, sin markdown, sin \`\`\`):
[{"p":"texto pregunta","o":["opción A","opción B","opción C","opción D"],"c":0,"e":"explicación corta"}]

Donde "c" es el índice 0-3 de la respuesta correcta.`;

  const raw = await callAI(SYSTEM_BASE, [{ role: 'user', content: prompt }], 1800);

  // Extract JSON array from response
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Formato de respuesta inválido. Intenta de nuevo.');

  const preguntas = JSON.parse(match[0]);
  if (!Array.isArray(preguntas) || preguntas.length === 0)
    throw new Error('No se generaron preguntas válidas.');

  return preguntas.slice(0, 5);
}

// ============================================================
// TRAINING — RENDER QUESTION
// ============================================================

function setQuizCharTalking(active) {
  const char = document.getElementById('quiz-marcos-char');
  if (!char) return;
  char.classList.toggle('is-talking', active);
}

function renderPreguntaQuiz() {
  const { preguntas, idx } = appState.currentQuiz;
  const q = preguntas[idx];
  if (!q) return;

  appState.currentQuiz.respondido = false;

  // Progress
  const pct = (idx / 5) * 100;
  document.getElementById('quiz-progress-fill').style.width = pct + '%';
  document.getElementById('quiz-progress-label').textContent = (idx + 1) + ' / 5';

  // Hearts
  const h = appState.currentQuiz.corazones;
  document.getElementById('quiz-hearts').textContent = '❤️'.repeat(h) + '🖤'.repeat(3 - h);

  // Update speech bubble with question text
  const bubbleEl = document.getElementById('quiz-bubble-text');
  if (bubbleEl) bubbleEl.textContent = q.p;

  // Animate character talking for ~2.5 seconds
  setQuizCharTalking(true);
  setTimeout(() => setQuizCharTalking(false), 2500);

  // Options
  const letters = ['A', 'B', 'C', 'D'];
  const optionsEl = document.getElementById('quiz-options');
  optionsEl.innerHTML = q.o.map((op, i) => `
    <button class="quiz-option-btn" onclick="seleccionarOpcion(${i})">
      <span class="quiz-option-letter">${letters[i]}</span>
      <span>${op}</span>
    </button>`).join('');

  // Hide feedback
  document.getElementById('quiz-feedback-panel').classList.remove('show', 'is-correct', 'is-wrong');
}

// ============================================================
// TRAINING — SELECT & CHECK ANSWER
// ============================================================

function seleccionarOpcion(idx) {
  if (appState.currentQuiz.respondido) return;
  appState.currentQuiz.respondido = true;

  const q        = appState.currentQuiz.preguntas[appState.currentQuiz.idx];
  const correcto = idx === q.c;
  const letters  = ['A', 'B', 'C', 'D'];
  const btns     = document.querySelectorAll('.quiz-option-btn');

  // Mark options
  btns.forEach((btn, i) => {
    btn.disabled = true;
    if (i === q.c)  btn.classList.add('correct');
    if (i === idx && !correcto) btn.classList.add('wrong');
  });

  // Score / hearts
  if (correcto) {
    appState.currentQuiz.score++;
  } else {
    appState.currentQuiz.corazones = Math.max(0, appState.currentQuiz.corazones - 1);
  }

  // Feedback panel
  const fb = document.getElementById('quiz-feedback-panel');
  document.getElementById('qfp-icon').textContent    = correcto ? '✓' : '✗';
  document.getElementById('qfp-title').textContent   = correcto ? '¡Correcto!' : 'Incorrecto';
  document.getElementById('qfp-explain').textContent = q.e || '';

  fb.className = 'quiz-feedback-panel show ' + (correcto ? 'is-correct' : 'is-wrong');

  // Update hearts display
  const h = appState.currentQuiz.corazones;
  document.getElementById('quiz-hearts').textContent = '❤️'.repeat(h) + '🖤'.repeat(3 - h);
}

// ============================================================
// TRAINING — NEXT QUESTION / FINISH
// ============================================================

function siguientePregunta() {
  appState.currentQuiz.idx++;

  if (appState.currentQuiz.idx >= appState.currentQuiz.preguntas.length ||
      appState.currentQuiz.corazones <= 0) {
    mostrarResultadoQuiz();
    return;
  }

  renderPreguntaQuiz();
}

function mostrarResultadoQuiz() {
  const { score, corazones, modulo } = appState.currentQuiz;
  const total = appState.currentQuiz.preguntas.length;

  // Stars
  const stars = score >= 5 ? '⭐⭐⭐' : score >= 4 ? '⭐⭐' : score >= 3 ? '⭐' : '😓';

  // XP
  const xp = (score * 20) + (score === 5 ? 50 : 0) + (corazones * 10);

  // Save progress (keep best score)
  const prev = appState.trainingProgress[modulo.id];
  const prevScore = prev?.score ?? -1;
  if (score > prevScore) {
    appState.trainingProgress[modulo.id] = { score, xp, completado: true };
    guardarProgresoTraining();
  }

  // Update total XP
  cargarProgresoTraining();

  // Msgs
  const msgs = ['Sigue practicando, cada intento cuenta.', 'Buen esfuerzo, casi lo logras.', 'Bien hecho, sigue así.', 'Muy bien, estás listo.', '¡Perfecto! Dominas este tema.'];
  const msg  = msgs[Math.min(score, 4)];
  const title = score === 5 ? '¡Perfecto!' : score >= 3 ? '¡Módulo completado!' : 'Módulo terminado';

  document.getElementById('qco-stars').textContent       = stars;
  document.getElementById('qco-title').textContent       = title;
  document.getElementById('qco-score').textContent       = score + '/' + total;
  document.getElementById('qco-xp').textContent          = '+' + xp + ' XP';
  document.getElementById('qco-hearts-left').textContent = '❤️'.repeat(corazones) + '🖤'.repeat(3 - corazones);
  document.getElementById('qco-msg').textContent         = msg;

  // Fill progress bar to 100%
  document.getElementById('quiz-progress-fill').style.width = '100%';
  document.getElementById('quiz-feedback-panel').classList.remove('show');

  document.getElementById('quiz-complete-overlay').classList.add('show');
}

function volverModulos() {
  document.getElementById('quiz-complete-overlay').classList.remove('show');
  mostrarPantalla('screen-training');
  renderModulosEntrenamiento();
}

function repetirModulo() {
  document.getElementById('quiz-complete-overlay').classList.remove('show');
  iniciarModulo(appState.currentQuiz.modulo.id);
}

function salirQuiz() {
  document.getElementById('quiz-feedback-panel').classList.remove('show', 'is-correct', 'is-wrong');
  document.getElementById('quiz-complete-overlay').classList.remove('show');
  mostrarPantalla('screen-training');
  renderModulosEntrenamiento();
}

// ============================================================
// EVENT LISTENERS
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Sync theme icon with saved preference
  const savedTheme = localStorage.getItem('devprep_theme') || 'dark';
  applyTheme(savedTheme);

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => mostrarTab(btn.dataset.tab));
  });

  document.getElementById('input-respuesta')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) enviarRespuesta();
  });

  document.getElementById('input-respuesta')?.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 160) + 'px';
  });

  document.getElementById('login-password')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginUsuario();
  });

  document.getElementById('register-password')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') registrarUsuario();
  });
});
