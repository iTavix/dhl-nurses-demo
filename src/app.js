// =====================================================================================
//  Module imports — pinned npm packages (see package.json) instead of CDN <script> tags.
//  The compat build of Firebase keeps the exact same `firebase.*` API the app was
//  written against, so the application code below is unchanged.
// =====================================================================================
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import { createIcons, icons as lucideIcons } from 'lucide';
import { STEP_I18N, CHECKLIST_I18N, I18N } from './i18n-data.js';
import { guideToc, guideBody } from './guide-content.js';
// Hashed by Vite: replacing the logo file changes the URL, so no cache (SW or browser) can serve a stale copy.
// The SVG is itself a rounded indigo tile, so it renders directly without a white backing box.
import logoUrl from './logo_dhl_nurses_cuore.svg';

// Shim with the same shape as the old lucide UMD global: lucide.createIcons().
const lucide = { createIcons: (opts) => createIcons({ icons: lucideIcons, ...(opts || {}) }) };

  // =====================================================================================
  //  DHL Nurses — Gestionale Trasferimento Infermieri (Repubblica Dominicana → Italia)
  //  Single-file reactive app · Vanilla ES6+ · Tailwind + Lucide
  //  Persistence: Firebase Firestore (per-user cloud DB) + localStorage cache/fallback
  //  Auth: Firebase Authentication (email/password + Google). Local demo mode if unset.
  // =====================================================================================

  // ---------- Firebase configuration ----------
  // 1. Crea un progetto su https://console.firebase.google.com
  // 2. Abilita Authentication → metodi "Email/Password" e "Google".
  // 3. Crea un database Firestore (modalità produzione) e incolla le regole indicate nel README.
  // 4. In "Impostazioni progetto" → "Le tue app" copia il config e incollalo qui sotto.
  // Finché apiKey resta vuota, l'app gira in MODALITÀ DEMO LOCALE (solo localStorage, nessun login).
  const FIREBASE_CONFIG = {
    apiKey: "", // DEMO: vuota di proposito → modalità demo locale, nessun login
    authDomain: "dominicahealthlink.firebaseapp.com",
    projectId: "dominicahealthlink",
    storageBucket: "dominicahealthlink.firebasestorage.app",
    messagingSenderId: "88621070016",
    appId: "1:88621070016:web:218cad6b8da9c7027e5f25",
  };

  // ---------- Workspace model ----------
  // false → per-user private data (each operator has their own isolated workspace).
  // true  → shared team workspace: all operators see the SAME candidates; admins manage
  //         base records, operators work on cases. Enforced by Firestore rules + custom claims.
  // Only enable AFTER deploying firestore.rules and bootstrapping an admin (see FIREBASE-SETUP.md §4).
  const SHARED_WORKSPACE = true;
  const ORG_ID = 'default';

  // Firebase runtime handles (populated only when configured).
  let fbEnabled = false, auth = null, db = null, currentUser = null, userClaims = null;
  let remoteSaveTimer = null, tourAutoChecked = false;
  // True once onAuthStateChanged has fired at least once. Until then the boot splash stays on
  // screen, so a returning signed-in user never sees the login screen flash by.
  let authResolved = false;
  // True while the initial Firestore read is in flight. Blocks the debounced cloud sync so a
  // stale locally-cached state can never be pushed over fresher team data during startup.
  let remoteLoading = false;
  // ---------- Realtime shared-workspace sync ----------
  // Cloud save status surfaced in the header chip: 'idle' | 'saving' | 'saved' | 'error' | 'offline'.
  let syncStatus = 'idle', syncErrorMsg = '';
  // Firestore onSnapshot unsubscribe handles (attached after login, released on logout).
  let unsubCases = null, unsubSettings = null;
  // Canonical JSON of every record as last CONFIRMED by the cloud (id → stableJson). Records whose
  // local JSON differs are "dirty" (edited here, not yet pushed): a remote snapshot must not
  // overwrite them. This turns the whole-array write into a per-record last-writer-wins merge.
  let lastSynced = { nurses: {}, requests: {}, settingsJson: '' };
  let remoteRenderTimer = null, lastRemoteToastAt = 0, sizeWarnShown = false;
  // Cap on per-nurse activity-log entries: keeps the single shared Firestore document
  // (hard limit ~1 MiB) from growing unbounded as cases accumulate history.
  const MAX_LOG_ENTRIES = 80;

  function firebaseConfigured() {
    return typeof firebase !== 'undefined' && FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.apiKey.trim().length > 0;
  }

  // ---------- Internationalization (it / en / es) ----------
  let LANG = 'it';
  const SUPPORTED_LANGS = ['it', 'en', 'es'];
  function loadLang() { try { const l = localStorage.getItem('dhl.lang'); if (l && SUPPORTED_LANGS.indexOf(l) >= 0) LANG = l; } catch (e) { /* ignore */ } }
  function setLang(l) { if (SUPPORTED_LANGS.indexOf(l) < 0) return; LANG = l; try { localStorage.setItem('dhl.lang', l); } catch (e) { /* ignore */ } tourAutoChecked = true; render(); }
  function localeTag() { return LANG === 'en' ? 'en-GB' : (LANG === 'es' ? 'es-ES' : 'it-IT'); }

  // ---------- Theme (light / dark) ----------
  let THEME = 'light';
  function applyTheme() {
    try { document.documentElement.classList.toggle('dark', THEME === 'dark'); } catch (e) { /* ignore */ }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME === 'dark' ? '#0b1220' : '#4f46e5');
  }
  function loadTheme() {
    try {
      const tm = localStorage.getItem('dhl.theme');
      if (tm === 'dark' || tm === 'light') THEME = tm;
      else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) THEME = 'dark';
    } catch (e) { /* ignore */ }
    applyTheme();
  }
  function toggleTheme() {
    THEME = THEME === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('dhl.theme', THEME); } catch (e) { /* ignore */ }
    applyTheme();
    render();
  }
  function t(key, vars) {
    const d = I18N[LANG] || I18N.it;
    let s = d[key] != null ? d[key] : (I18N.it[key] != null ? I18N.it[key] : key);
    if (vars) Object.keys(vars).forEach((p) => { s = s.split('{' + p + '}').join(vars[p]); });
    return s;
  }

  // ---------- The 9 workflow phases, split between two teams (localized) ----------
  // Phases 1-4: Team Repubblica Dominicana (selezione → viaggio).
  // Phases 5-9: Team Italia (arrivo → tutor e assistenza).
  const STEP_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const LAST_STEP = 9;
  const DONE_STEP = 10;            // advancing past phase 9 marks the case as completed
  const FIRST_ITALY_STEP = 5;      // first phase handled by the Italy team (= arrived in Italy)
  function stepName(id) { const L = STEP_I18N[LANG] || STEP_I18N.it; return L.names[id] || STEP_I18N.it.names[id] || '—'; }
  function stepShort(id) { const L = STEP_I18N[LANG] || STEP_I18N.it; return L.short[id] || STEP_I18N.it.short[id] || ''; }
  function steps() { return STEP_IDS.map((id) => ({ id: id, name: stepName(id), short: stepShort(id) })); }
  function stepTeam(id) { return id < FIRST_ITALY_STEP ? 'rd' : 'it'; }

  // Realistic max days a case should sit in a given phase before it becomes a risk.
  const STEP_SLA_DAYS = { 1: 21, 2: 60, 3: 60, 4: 21, 5: 7, 6: 21, 7: 30, 8: 30, 9: 60 };

  // Per-phase mandatory checklist templates (same item count across languages).
  function checklistLabels(step) { const L = CHECKLIST_I18N[LANG] || CHECKLIST_I18N.it; return L[step] || CHECKLIST_I18N.it[step] || []; }
  function checklistLabel(step, idx) { const a = checklistLabels(step); return a[idx] != null ? a[idx] : ''; }

  // Document gating: phase 2 (Gestione Documentale) can't be left until every
  // required document is uploaded AND approved.
  const STEP_REQUIRES_ALL_DOCS_APPROVED = 2;

  // Status badge metadata (colors fixed; labels localized via i18n).
  const STATUS_CLS = {
    'Missing Docs':         'bg-rose-100 text-rose-700 ring-rose-200',
    'In Progress':          'bg-indigo-100 text-indigo-700 ring-indigo-200',
    'Visa Obtained':        'bg-amber-100 text-amber-700 ring-amber-200',
    'Onboarding Completed': 'bg-emerald-100 text-emerald-700 ring-emerald-200',
  };
  const STATUS_KEY = { 'Missing Docs': 'status_missing', 'In Progress': 'status_progress', 'Visa Obtained': 'status_visa', 'Onboarding Completed': 'status_onboarding' };
  function statusLabel(k) { return t(STATUS_KEY[k] || 'status_progress'); }
  function statusCls(k) { return STATUS_CLS[k] || STATUS_CLS['In Progress']; }

  const DOC_STATUS_CLS = { approved: 'bg-emerald-100 text-emerald-700 ring-emerald-200', pending: 'bg-amber-100 text-amber-700 ring-amber-200', missing: 'bg-rose-100 text-rose-700 ring-rose-200' };
  const DOC_STATUS_ICON = { approved: 'check-circle-2', pending: 'clock', missing: 'x-circle' };
  function docStatusLabel(s) { return t('doc_' + s); }

  // (Translation dictionary moved to src/i18n-data.js)

  // ---------- Helpers ----------
  const STORAGE_KEY = 'nurseflow.state.v1';
  const uid = () => 'id_' + Math.random().toString(36).slice(2, 10);
  const today = () => new Date();

  function isoDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  }
  function isoMinutesAgo(mins) {
    const d = new Date();
    d.setMinutes(d.getMinutes() - mins);
    return d.toISOString();
  }
  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function formatDateTime(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function daysBetween(iso) {
    if (!iso) return 0;
    const d = new Date(iso);
    return Math.max(0, Math.floor((today() - d) / 86400000));
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ---------- Initial / mock state ----------
  function makeChecklist(stepDoneMap) {
    // stepDoneMap: { stepId: [bool, bool, ...] } describing done flags for that step's items.
    // Items store a {step, idx} reference so labels can be re-translated at render time.
    const out = {};
    STEP_IDS.forEach((id) => {
      const count = (CHECKLIST_I18N.it[id] || []).length;
      const flags = (stepDoneMap && stepDoneMap[id]) || [];
      const arr = [];
      for (let i = 0; i < count; i++) {
        arr.push({ id: uid(), step: id, idx: i, done: flags[i] !== undefined ? flags[i] : (id < (stepDoneMap.__current || 1)) });
      }
      out[id] = arr;
    });
    return out;
  }

  function seedState() {
    // -------- Candidate 1: Ana Valeria Rosario — Missing Docs (stuck at phase 2, Gestione Documentale) --------
    const ana = {
      id: 'nurse_ana',
      name: 'Ana Valeria Rosario',
      passport: 'RD-DX1184220',
      birthPlace: 'Santo Domingo',
      nationality: 'Dominicana',
      cedula: '402-1938475-6', birthDate: '1996-03-14', maritalStatus: 'single',
      phone: '+1 809 555 0134', email: 'ana.rosario@example.do',
      address: 'Calle El Conde 45, Santo Domingo',
      privacyConsent: false, privacyConsentDate: null,
      partnerAgency: 'Caribe Health Recruiting SRL',
      languageLevel: 'A2 — in formazione',
      employer: 'Casa di Cura San Raffaele · Milano',
      hrReferent: 'Dott.ssa Giulia Ferraro',
      specializations: ['Chirurgia'],
      profRole: 'Infermiera', profSector: 'Chirurgia generale', profExperience: '4 anni',
      passportExpiry: isoDaysAgo(-1200), cedulaExpiry: isoDaysAgo(-45), // cédula in scadenza → semaforo ambra
      matchedRequestId: null, matchedDepartment: '',
      specializations: ['Chirurgia'],
      matchedRequestId: null, matchedDepartment: '',
      currentStep: 2,
      status: 'Missing Docs',
      lastUpdate: isoDaysAgo(74), // clearly over the 60d SLA of phase 2 → red risk
      documents: [
        { id: uid(), name: 'Diploma di Laurea in Infermieristica', language: 'ES', uploadDate: isoDaysAgo(90), validity: '2034-05-01', status: 'approved' },
        { id: uid(), name: 'Certificato Professionale (Exatec)',   language: 'ES', uploadDate: isoDaysAgo(88), validity: '2030-01-01', status: 'approved' },
        { id: uid(), name: 'Traduzione Asseverata del Titolo',     language: 'IT', uploadDate: null,           validity: null,         status: 'missing' },
        { id: uid(), name: 'Legalizzazione (Apostille de La Haya)', language: 'IT', uploadDate: null,          validity: null,         status: 'missing' },
      ],
      checklist: makeChecklist({
        __current: 2,
        1: [true, true, true, true],
        2: [true, false, false, false, false, false, false], // titles uploaded; translation/legalisation still missing
      }),
      relocation: { flight: null, housing: null, tutor: null, contractStatus: 'Non avviato' },
      logs: [
        { id: uid(), at: isoMinutesAgo(60 * 24 * 74), type: 'system', author: 'Sistema', text: 'Candidata acquisita e profilo creato.' },
        { id: uid(), at: isoMinutesAgo(60 * 24 * 80), type: 'note', author: 'Dott.ssa Ferraro', text: 'Diploma e certificato professionale verificati con esito positivo.' },
        { id: uid(), at: isoMinutesAgo(60 * 24 * 50), type: 'alert', author: 'Sistema', text: 'ALERTA / ALERT: Falta la traducción jurada legalizada del título. Manca la traduzione asseverata legalizzata del titolo.' },
        { id: uid(), at: isoMinutesAgo(60 * 24 * 30), type: 'call', author: 'Caribe Health Recruiting', text: 'Llamada con la candidata: la apostilla está en trámite en la Procuraduría. Tempo stimato 3 settimane.' },
      ],
    };

    // -------- Candidate 2: Carlos Manuel Tejeda — Italy team, Matching phase (7) --------
    const carlos = {
      id: 'nurse_carlos',
      name: 'Carlos Manuel Tejeda',
      passport: 'RD-AK7740915',
      birthPlace: 'Santiago de los Caballeros',
      nationality: 'Dominicana',
      cedula: '031-0847261-9', birthDate: '1991-08-22', maritalStatus: 'married',
      phone: '+1 829 555 0177', email: 'carlos.tejeda@example.do',
      address: 'Av. Estrella Sadhala 102, Santiago de los Caballeros',
      privacyConsent: true, privacyConsentDate: isoDaysAgo(200),
      partnerAgency: 'Antillas Nursing Partners',
      languageLevel: 'B1 — certificato CELI',
      employer: 'Azienda Ospedaliera di Padova',
      hrReferent: 'Dott. Marco Bianchi',
      specializations: ['Terapia Intensiva', 'Emergenza-Urgenza'],
      profRole: 'Infermiere', profSector: 'Terapia Intensiva', profExperience: '7 anni',
      passportExpiry: isoDaysAgo(-1800), cedulaExpiry: isoDaysAgo(-600),
      specializations: ['Terapia Intensiva', 'Emergenza-Urgenza'],
      // Pre-matched (demo): fills one of the two Padova seats, so the request shows 1/2.
      matchedRequestId: 'req_padova_ti', matchedDepartment: 'Terapia Intensiva',
      currentStep: 7,
      status: 'Visa Obtained',
      lastUpdate: isoDaysAgo(6),
      documents: [
        { id: uid(), name: 'Diploma di Laurea in Infermieristica', language: 'ES', uploadDate: isoDaysAgo(210), validity: '2033-09-01', status: 'approved' },
        { id: uid(), name: 'Certificato Professionale (Exatec)',   language: 'ES', uploadDate: isoDaysAgo(208), validity: '2031-01-01', status: 'approved' },
        { id: uid(), name: 'Traduzione Asseverata del Titolo',     language: 'IT', uploadDate: isoDaysAgo(180), validity: '2033-09-01', status: 'approved' },
        { id: uid(), name: 'Legalizzazione (Apostille de La Haya)', language: 'IT', uploadDate: isoDaysAgo(178), validity: '2033-09-01', status: 'approved' },
        { id: uid(), name: 'Decreto di Riconoscimento del Titolo', language: 'IT', uploadDate: isoDaysAgo(40),  validity: '—',          status: 'approved' },
        { id: uid(), name: 'Visto di Ingresso (Lavoro Subordinato)', language: 'IT', uploadDate: isoDaysAgo(6), validity: '2026-12-15', status: 'approved' },
        { id: uid(), name: 'Dossier «Italia in tasca»',            language: 'IT', uploadDate: isoDaysAgo(20), validity: null,         status: 'approved', optional: true },
        { id: uid(), name: 'Copia Passaporto',                       language: 'ES', uploadDate: isoDaysAgo(210), validity: '2031-03-01', status: 'approved' },
        { id: uid(), name: 'Cédula (Documento d’Identità RD)',   language: 'ES', uploadDate: isoDaysAgo(210), validity: '2029-05-01', status: 'approved' },
        { id: uid(), name: 'Consenso Privacy Firmato',               language: 'IT', uploadDate: isoDaysAgo(200), validity: null,         status: 'approved' },
        { id: uid(), name: 'Certificato di Lingua',                  language: 'IT', uploadDate: isoDaysAgo(190), validity: null,         status: 'approved' },
      ],
      checklist: makeChecklist({
        __current: 7,
        7: [true, false, false], // facility request received, matching in progress
      }),
      relocation: { flight: 'AZ 681 · SDQ → MXP · arrivato ' + formatDate(isoDaysAgo(12)), housing: 'Alloggio temporaneo, Via Altinate 45, Padova', tutor: null, contractStatus: 'Pre-contratto firmato' },
      logs: [
        { id: uid(), at: isoMinutesAgo(60 * 24 * 40), type: 'system', author: 'Sistema', text: 'Formazione «Italia in tasca» completata. Visto e iscrizione OPI ottenuti.' },
        { id: uid(), at: isoMinutesAgo(60 * 24 * 12), type: 'note', author: 'Dott. Bianchi', text: 'Arrivato in Italia: accoglienza in aeroporto e trasferimento in alloggio completati.' },
        { id: uid(), at: isoMinutesAgo(60 * 24 * 6),  type: 'alert', author: 'Sistema', text: 'Richiesta ricevuta dall’Azienda Ospedaliera di Padova: matching competenze in corso.' },
      ],
    };

    // -------- Candidate 3: Elena Maria Santos — path completed (past phase 9) --------
    const elena = {
      id: 'nurse_elena',
      name: 'Elena Maria Santos',
      passport: 'RD-MP3320877',
      birthPlace: 'La Romana',
      nationality: 'Dominicana',
      cedula: '026-5567340-1', birthDate: '1989-11-05', maritalStatus: 'married',
      phone: '+39 349 555 0122', email: 'elena.santos@example.do',
      address: 'Via Giustiniani 12, Padova',
      privacyConsent: true, privacyConsentDate: isoDaysAgo(420),
      partnerAgency: 'Caribe Health Recruiting SRL',
      languageLevel: 'B2 — certificato CELI',
      employer: 'Azienda Ospedaliera di Padova',
      hrReferent: 'Dott. Marco Bianchi',
      specializations: ['Nefrologia e Dialisi'],
      profRole: 'Infermiera', profSector: 'Nefrologia e Dialisi', profExperience: '5 anni',
      passportExpiry: isoDaysAgo(-1600), cedulaExpiry: isoDaysAgo(-500),
      matchedRequestId: null, matchedDepartment: '',
      specializations: ['Geriatria', 'Medicina Generale'],
      profRole: 'Infermiera', profSector: 'Geriatria', profExperience: '8 anni',
      passportExpiry: isoDaysAgo(-2200), cedulaExpiry: isoDaysAgo(-800),
      matchedRequestId: null, matchedDepartment: '',
      currentStep: 10,
      status: 'Onboarding Completed',
      lastUpdate: isoDaysAgo(12),
      documents: [
        { id: uid(), name: 'Diploma di Laurea in Infermieristica', language: 'ES', uploadDate: isoDaysAgo(420), validity: '2032-06-01', status: 'approved' },
        { id: uid(), name: 'Certificato Professionale (Exatec)',   language: 'ES', uploadDate: isoDaysAgo(418), validity: '2030-01-01', status: 'approved' },
        { id: uid(), name: 'Traduzione Asseverata del Titolo',     language: 'IT', uploadDate: isoDaysAgo(400), validity: '2032-06-01', status: 'approved' },
        { id: uid(), name: 'Legalizzazione (Apostille de La Haya)', language: 'IT', uploadDate: isoDaysAgo(398), validity: '2032-06-01', status: 'approved' },
        { id: uid(), name: 'Decreto di Riconoscimento del Titolo', language: 'IT', uploadDate: isoDaysAgo(150), validity: '—',          status: 'approved' },
        { id: uid(), name: 'Iscrizione Albo OPI',                  language: 'IT', uploadDate: isoDaysAgo(80),  validity: '2027-01-01', status: 'approved' },
        { id: uid(), name: 'Contratto di Lavoro Firmato',          language: 'IT', uploadDate: isoDaysAgo(30),  validity: '—',          status: 'approved' },
        { id: uid(), name: 'Copia Passaporto',                     language: 'ES', uploadDate: isoDaysAgo(420), validity: '2030-07-01', status: 'approved' },
        { id: uid(), name: 'Cédula (Documento d’Identità RD)', language: 'ES', uploadDate: isoDaysAgo(420), validity: '2028-11-01', status: 'approved' },
        { id: uid(), name: 'Consenso Privacy Firmato',             language: 'IT', uploadDate: isoDaysAgo(420), validity: null,         status: 'approved' },
        { id: uid(), name: 'Certificato di Lingua',                language: 'IT', uploadDate: isoDaysAgo(400), validity: null,         status: 'approved' },
      ],
      checklist: makeChecklist({ __current: 10 }), // every phase done
      relocation: {
        flight: 'AZ 681 · SDQ → MXP · arrivo 18 mag 2026',
        housing: 'Foresteria aziendale, Via Giustiniani 12, Padova',
        tutor: 'Coord. Inf. Laura Marchetti',
        contractStatus: 'Contratto a tempo indeterminato attivo',
      },
      logs: [
        { id: uid(), at: isoMinutesAgo(60 * 24 * 42), type: 'system', author: 'Sistema', text: 'Iscrizione OPI completata.' },
        { id: uid(), at: isoMinutesAgo(60 * 24 * 30), type: 'note', author: 'Dott. Bianchi', text: 'Arrivo in Italia e permesso di soggiorno ritirato.' },
        { id: uid(), at: isoMinutesAgo(60 * 24 * 12), type: 'system', author: 'Sistema', text: 'Percorso completato: tutor assegnato, contratto attivo, assistenza legale/fiscale convenzionata attivata.' },
      ],
    };

    // -------- Candidate 4: Marisol Pena Urena — Formazione (phase 3) --------
    const marisol = {
      id: 'nurse_marisol',
      name: 'Marisol Peña Ureña',
      passport: 'RD-CG5521904',
      birthPlace: 'San Pedro de Macorís',
      nationality: 'Dominicana',
      cedula: '023-7761204-3', birthDate: '1998-01-27', maritalStatus: 'single',
      phone: '+1 809 555 0188', email: 'marisol.pena@example.do',
      address: 'Av. Independencia 210, San Pedro de Macorís',
      privacyConsent: true, privacyConsentDate: isoDaysAgo(35),
      partnerAgency: 'Antillas Nursing Partners',
      languageLevel: 'B1 — corso intensivo',
      employer: 'Casa di Cura San Raffaele · Milano',
      hrReferent: 'Dott.ssa Giulia Ferraro',
      specializations: ['Pediatria', 'Medicina Generale'],
      profRole: 'Infermiera pediatrica', profSector: 'Pediatria', profExperience: '3 anni',
      passportExpiry: isoDaysAgo(-1500), cedulaExpiry: isoDaysAgo(-900),
      matchedRequestId: null, matchedDepartment: '',
      currentStep: 3,
      status: 'In Progress',
      lastUpdate: isoDaysAgo(4),
      documents: [
        { id: uid(), name: 'Diploma di Laurea in Infermieristica', language: 'ES', uploadDate: isoDaysAgo(30), validity: '2035-02-01', status: 'approved' },
        { id: uid(), name: 'Certificato Professionale (Exatec)',   language: 'ES', uploadDate: isoDaysAgo(28), validity: '2031-06-01', status: 'approved' },
        { id: uid(), name: 'Traduzione Asseverata del Titolo',     language: 'IT', uploadDate: isoDaysAgo(6),  validity: '2035-02-01', status: 'approved' },
        { id: uid(), name: 'Legalizzazione (Apostille de La Haya)', language: 'IT', uploadDate: isoDaysAgo(5), validity: '2035-02-01', status: 'approved' },
        { id: uid(), name: 'Copia Passaporto',                     language: 'ES', uploadDate: isoDaysAgo(35), validity: '2032-01-01', status: 'approved' },
        { id: uid(), name: 'Cédula (Documento d’Identità RD)', language: 'ES', uploadDate: isoDaysAgo(35), validity: '2030-01-01', status: 'approved' },
        { id: uid(), name: 'Consenso Privacy Firmato',             language: 'IT', uploadDate: isoDaysAgo(35), validity: null, status: 'approved' },
        { id: uid(), name: 'Certificato di Lingua',                language: 'IT', uploadDate: isoDaysAgo(10), validity: null, status: 'pending' },
      ],
      checklist: makeChecklist({
        __current: 3,
        3: [true, true, false, false], // digital content delivered, meetings attended; support + final language check pending
      }),
      relocation: { flight: null, housing: null, tutor: null, contractStatus: 'Non avviato' },
      logs: [
        { id: uid(), at: isoMinutesAgo(60 * 24 * 30), type: 'system', author: 'Sistema', text: 'Fascicolo documentale completato e approvato: riconoscimento, nulla osta e visto ottenuti.' },
        { id: uid(), at: isoMinutesAgo(60 * 24 * 4), type: 'note', author: 'Dott.ssa Ferraro', text: 'Formazione «Italia in tasca» in corso: contenuti digitali consegnati, primi incontri online completati.' },
      ],
    };

    // -------- Candidate 5: Jose Alberto Guzman — Organizzazione Viaggio (phase 4) --------
    const jose = {
      id: 'nurse_jose',
      name: 'José Alberto Guzmán',
      passport: 'RD-BT8830476',
      birthPlace: 'La Vega',
      nationality: 'Dominicana',
      cedula: '048-2210937-5', birthDate: '1993-06-09', maritalStatus: 'married',
      phone: '+1 849 555 0163', email: 'jose.guzman@example.do',
      address: 'Calle Duarte 88, La Vega',
      privacyConsent: true, privacyConsentDate: isoDaysAgo(120),
      partnerAgency: 'Caribe Health Recruiting SRL',
      languageLevel: 'B1 — certificato CELI',
      employer: 'Azienda Ospedaliera di Padova',
      hrReferent: 'Dott. Marco Bianchi',
      specializations: ['Sala Operatoria', 'Chirurgia'],
      profRole: 'Infermiere strumentista', profSector: 'Sala Operatoria', profExperience: '6 anni',
      passportExpiry: isoDaysAgo(-2000), cedulaExpiry: isoDaysAgo(-700),
      matchedRequestId: null, matchedDepartment: '',
      currentStep: 4,
      status: 'In Progress',
      lastUpdate: isoDaysAgo(9),
      documents: [
        { id: uid(), name: 'Diploma di Laurea in Infermieristica', language: 'ES', uploadDate: isoDaysAgo(115), validity: '2034-09-01', status: 'approved' },
        { id: uid(), name: 'Certificato Professionale (Exatec)',   language: 'ES', uploadDate: isoDaysAgo(113), validity: '2030-12-01', status: 'approved' },
        { id: uid(), name: 'Traduzione Asseverata del Titolo',     language: 'IT', uploadDate: isoDaysAgo(90),  validity: '2034-09-01', status: 'approved' },
        { id: uid(), name: 'Legalizzazione (Apostille de La Haya)', language: 'IT', uploadDate: isoDaysAgo(88), validity: '2034-09-01', status: 'approved' },
        { id: uid(), name: 'Certificato Esperienza Professionale', language: 'ES', uploadDate: isoDaysAgo(9),  validity: '—', status: 'approved' },
        { id: uid(), name: 'Dossier «Italia in tasca»',            language: 'IT', uploadDate: isoDaysAgo(9),  validity: null, status: 'approved', optional: true },
        { id: uid(), name: 'Copia Passaporto',                     language: 'ES', uploadDate: isoDaysAgo(120), validity: '2033-04-01', status: 'approved' },
        { id: uid(), name: 'Cédula (Documento d’Identità RD)', language: 'ES', uploadDate: isoDaysAgo(120), validity: '2029-08-01', status: 'approved' },
        { id: uid(), name: 'Consenso Privacy Firmato',             language: 'IT', uploadDate: isoDaysAgo(120), validity: null, status: 'approved' },
        { id: uid(), name: 'Certificato di Lingua',                language: 'IT', uploadDate: isoDaysAgo(100), validity: null, status: 'approved' },
      ],
      checklist: makeChecklist({
        __current: 4,
        4: [true, false], // flight purchased; airport transfer still to arrange
      }),
      relocation: { flight: 'UX 92 · SDQ → MAD → MXP · partenza 24 lug 2026', housing: null, tutor: null, contractStatus: 'Non avviato' },
      logs: [
        { id: uid(), at: isoMinutesAgo(60 * 24 * 20), type: 'system', author: 'Sistema', text: 'Formazione completata e fascicolo documentale chiuso: si passa all’organizzazione del viaggio.' },
        { id: uid(), at: isoMinutesAgo(60 * 24 * 9), type: 'note', author: 'Dott. Bianchi', text: 'Biglietto aereo acquistato (partenza 24 luglio). Da organizzare il trasferimento verso l’aeroporto di Santo Domingo.' },
      ],
    };

    // -------- Candidate 6: Rosa Altagracia Feliz — Domicilio e Servizi (phase 6) --------
    const rosa = {
      id: 'nurse_rosa',
      name: 'Rosa Altagracia Féliz',
      passport: 'RD-HN2214880',
      birthPlace: 'Barahona',
      nationality: 'Dominicana',
      cedula: '018-4452781-2', birthDate: '1994-12-02', maritalStatus: 'single',
      phone: '+1 809 555 0126', email: 'rosa.feliz@example.do',
      address: 'Calle Padre Billini 12, Barahona',
      privacyConsent: true, privacyConsentDate: isoDaysAgo(260),
      partnerAgency: 'Caribe Health Recruiting SRL',
      languageLevel: 'B2 — certificato CILS',
      employer: 'Casa di Cura San Raffaele · Milano',
      hrReferent: 'Dott.ssa Giulia Ferraro',
      specializations: ['Nefrologia e Dialisi'],
      // Pre-matched (demo): fills the San Raffaele dialysis request (fully staffed example).
      matchedRequestId: 'req_sr_dialisi', matchedDepartment: 'Nefrologia e Dialisi',
      currentStep: 6,
      status: 'In Progress',
      lastUpdate: isoDaysAgo(3),
      documents: [
        { id: uid(), name: 'Diploma di Laurea in Infermieristica', language: 'ES', uploadDate: isoDaysAgo(250), validity: '2033-01-01', status: 'approved' },
        { id: uid(), name: 'Certificato Professionale (Exatec)',   language: 'ES', uploadDate: isoDaysAgo(248), validity: '2030-06-01', status: 'approved' },
        { id: uid(), name: 'Traduzione Asseverata del Titolo',     language: 'IT', uploadDate: isoDaysAgo(230), validity: '2033-01-01', status: 'approved' },
        { id: uid(), name: 'Legalizzazione (Apostille de La Haya)', language: 'IT', uploadDate: isoDaysAgo(228), validity: '2033-01-01', status: 'approved' },
        { id: uid(), name: 'Decreto di Riconoscimento del Titolo', language: 'IT', uploadDate: isoDaysAgo(60),  validity: '—', status: 'approved' },
        { id: uid(), name: 'Visto di Ingresso (Lavoro Subordinato)', language: 'IT', uploadDate: isoDaysAgo(25), validity: '2027-01-31', status: 'approved' },
        { id: uid(), name: 'Dossier «Italia in tasca»',            language: 'IT', uploadDate: isoDaysAgo(30), validity: null, status: 'approved', optional: true },
        { id: uid(), name: 'Copia Passaporto',                     language: 'ES', uploadDate: isoDaysAgo(260), validity: '2031-10-01', status: 'approved' },
        { id: uid(), name: 'Cédula (Documento d’Identità RD)', language: 'ES', uploadDate: isoDaysAgo(260), validity: '2028-02-01', status: 'approved' },
        { id: uid(), name: 'Consenso Privacy Firmato',             language: 'IT', uploadDate: isoDaysAgo(260), validity: null, status: 'approved' },
        { id: uid(), name: 'Certificato di Lingua',                language: 'IT', uploadDate: isoDaysAgo(240), validity: null, status: 'approved' },
      ],
      checklist: makeChecklist({
        __current: 6,
        6: [false, true, false], // essential services active; housing contract + residence permit in progress
      }),
      relocation: { flight: 'IB 6501 · SDQ → MXP · arrivata 05 lug 2026', housing: 'In ricerca — zona San Raffaele', tutor: null, contractStatus: 'Proposta contrattuale inviata' },
      logs: [
        { id: uid(), at: isoMinutesAgo(60 * 24 * 6), type: 'system', author: 'Sistema', text: 'Arrivata in Italia: accoglienza in aeroporto e trasferimento all’alloggio temporaneo completati.' },
        { id: uid(), at: isoMinutesAgo(60 * 24 * 3), type: 'note', author: 'Dott.ssa Ferraro', text: 'Alloggio definitivo in ricerca (zona San Raffaele); avviata la richiesta del permesso di soggiorno.' },
      ],
    };

    // Example hospital requests (Team Italia) — a lively matching board for the demo:
    // one partially staffed (Carlos on 1 of 2 seats), one fully staffed (Rosa), two open.
    const reqPadova = {
      id: 'req_padova_ti',
      employer: 'Azienda Ospedaliera di Padova',
      department: 'Terapia Intensiva',
      shift: 'Turni H24 (mattina/pomeriggio/notte)',
      quantity: 2,
      requiredSkills: ['Terapia Intensiva'],
      preferredSkills: ['Emergenza-Urgenza'],
      notes: 'Potenziamento organico area critica: richiesta pervenuta dalla direzione sanitaria.',
      status: 'open',
      createdAt: isoDaysAgo(9),
      matched: [{ id: 'nurse_carlos', name: 'Carlos Manuel Tejeda', at: isoDaysAgo(2) }],
    };
    const reqSrDialisi = {
      id: 'req_sr_dialisi',
      employer: 'Casa di Cura San Raffaele · Milano',
      department: 'Nefrologia e Dialisi',
      shift: 'Turni diurni (mattina/pomeriggio)',
      quantity: 1,
      requiredSkills: ['Nefrologia e Dialisi'],
      preferredSkills: [],
      notes: 'Apertura nuovi posti letto in dialisi: infermiere con esperienza specifica.',
      status: 'matched',
      createdAt: isoDaysAgo(14),
      matched: [{ id: 'nurse_rosa', name: 'Rosa Altagracia Féliz', at: isoDaysAgo(4) }],
    };
    const reqBologna = {
      id: 'req_bologna_so',
      employer: 'Policlinico S.Orsola · Bologna',
      department: 'Sala Operatoria',
      shift: 'Turni mattina + reperibilità',
      quantity: 1,
      requiredSkills: ['Sala Operatoria'],
      preferredSkills: ['Chirurgia'],
      notes: 'Blocco operatorio: rinforzo équipe di sala.',
      status: 'open',
      createdAt: isoDaysAgo(3),
      matched: [],
    };
    const reqFirenze = {
      id: 'req_firenze_ped',
      employer: 'AOU Meyer · Firenze',
      department: 'Pediatria',
      shift: 'Turni H24',
      quantity: 1,
      requiredSkills: ['Pediatria'],
      preferredSkills: ['Medicina Generale'],
      notes: 'Reparto pediatrico: copertura turni notturni.',
      status: 'open',
      createdAt: isoDaysAgo(1),
      matched: [],
    };

    return {
      version: 1,
      view: 'dashboard',          // 'dashboard' | 'cases' | 'matching' | 'settings'
      selectedNurseId: 'nurse_ana',
      search: '',
      statusFilter: 'all',        // 'all' | 'risk' | a status key
      nurses: [ana, marisol, jose, carlos, rosa, elena],
      requests: [reqPadova, reqSrDialisi, reqBologna, reqFirenze],
      settings: defaultSettings(),
    };
  }

  // Base records (anagrafiche) managed from the Settings section.
  function defaultSettings() {
    return {
      agencies: [
        { id: uid(), name: 'Caribe Health Recruiting SRL', country: 'Repubblica Dominicana', contact: 'info@caribehealth.do' },
        { id: uid(), name: 'Antillas Nursing Partners', country: 'Repubblica Dominicana', contact: 'rrhh@antillasnursing.do' },
      ],
      employers: [
        { id: uid(), name: 'Casa di Cura San Raffaele', city: 'Milano' },
        { id: uid(), name: 'Azienda Ospedaliera di Padova', city: 'Padova' },
      ],
      operators: [
        { id: uid(), name: 'Dott.ssa Giulia Ferraro', role: 'HR Specialist', email: 'giulia.ferraro@dhl.it', accessRole: 'operator', team: 'rd' },
        { id: uid(), name: 'Dott. Marco Bianchi', role: 'HR Manager', email: 'marco.bianchi@dhl.it', accessRole: 'admin', team: 'it' },
      ],
      docTypes: [
        { id: uid(), name: 'Diploma di Laurea in Infermieristica', language: 'ES' },
        { id: uid(), name: 'Certificato Professionale (Exatec)', language: 'ES' },
        { id: uid(), name: 'Traduzione Asseverata del Titolo', language: 'IT' },
        { id: uid(), name: 'Legalizzazione (Apostille de La Haya)', language: 'IT' },
      ].concat(PERSONAL_DOC_TYPES.map((d) => ({ id: uid(), name: d.name, language: d.language, optional: !!d.optional }))),
      specialties: DEFAULT_SPECIALTIES.map((name) => ({ id: uid(), name: name })),
    };
  }

  // Clinical-skill catalogue used to qualify profiles (RD team) and to run the
  // technical matching (Italy team). Admins can extend it from Settings.
  const DEFAULT_SPECIALTIES = [
    'Terapia Intensiva', 'Emergenza-Urgenza', 'Pediatria', 'Nefrologia e Dialisi',
    'Chirurgia', 'Sala Operatoria', 'Geriatria', 'Oncologia', 'Ostetricia-Ginecologia', 'Medicina Generale',
  ];

  // Personal-file slots every candidate gets. Required: identity documents, signed
  // privacy consent and language certificate (needed for visa/OPI). Optional: photo,
  // CV and criminal/health certificates (only if required by law / by the role) —
  // optional docs never block the pipeline nor flag the case as "Missing Docs".
  const PERSONAL_DOC_TYPES = [
    { name: 'Copia Passaporto', language: 'ES' },
    { name: 'Cédula (Documento d’Identità RD)', language: 'ES' },
    { name: 'Fotografia (formato tessera)', language: 'ES', optional: true },
    { name: 'Curriculum Vitae', language: 'ES', optional: true },
    { name: 'Consenso Privacy Firmato', language: 'IT' },
    { name: 'Certificato di Lingua', language: 'IT' },
    { name: 'Certificato Penale', language: 'ES', optional: true },
    { name: 'Certificato Sanitario', language: 'ES', optional: true },
    // Certifies the completion of the training programme; validated by the RD team
    // and checked by the matching procedure (optional: it never blocks the pipeline).
    { name: 'Dossier «Italia in tasca»', language: 'IT', optional: true },
  ];

  // ---------- Persistence ----------
  let state;
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.nurses && parsed.nurses.length) return normalizeState(parsed);
      }
    } catch (e) { /* fall through to seed */ }
    return normalizeState(seedState());
  }
  // Backfill fields added in later versions so older saved states keep working.
  const PERSONAL_FIELDS = ['cedula', 'birthDate', 'birthPlace', 'nationality', 'maritalStatus', 'phone', 'email', 'address', 'passportExpiry', 'cedulaExpiry', 'profRole', 'profSector', 'profExperience'];
  // Migration map: legacy 11-state workflow → new 9-phase / two-team workflow.
  const OLD_TO_NEW_STEP = { 1: 1, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 2, 8: 4, 9: 4, 10: 5, 11: DONE_STEP };
  function normalizeState(s) {
    if (!s.settings) s.settings = defaultSettings();
    ['agencies', 'employers', 'operators', 'docTypes', 'specialties'].forEach((k) => { if (!Array.isArray(s.settings[k])) s.settings[k] = []; });
    // Backfill document types for states created before this feature existed.
    if (!s.settings.docTypes.length) s.settings.docTypes = defaultSettings().docTypes;
    // Backfill the clinical-skill catalogue added with the matching protocol.
    if (!s.settings.specialties.length) s.settings.specialties = DEFAULT_SPECIALTIES.map((name) => ({ id: uid(), name: name }));
    // Hospital requests (Team Italia) added with the matching protocol.
    if (!Array.isArray(s.requests)) s.requests = [];
    s.requests.forEach((r) => {
      // Number of nurses requested (added later; legacy requests asked for one).
      if (!(r.quantity >= 1)) r.quantity = 1;
      // Multi-match support: migrate the legacy single matchedNurseId fields.
      if (!Array.isArray(r.matched)) {
        r.matched = r.matchedNurseId ? [{ id: r.matchedNurseId, name: r.matchedNurseName || '', at: r.matchedAt || null }] : [];
        delete r.matchedNurseId; delete r.matchedNurseName; delete r.matchedAt;
      }
    });
    // Merge in the personal-file doc types added later (matched by name, case-insensitive).
    const typeNames = s.settings.docTypes.map((dt) => (dt.name || '').toLowerCase());
    PERSONAL_DOC_TYPES.forEach((d) => {
      if (typeNames.indexOf(d.name.toLowerCase()) < 0) s.settings.docTypes.push({ id: uid(), name: d.name, language: d.language, optional: !!d.optional });
    });
    // Keep the required/optional flag of the personal slots in sync with PERSONAL_DOC_TYPES,
    // so flag changes in later versions propagate to already-saved states.
    const flagByName = {};
    PERSONAL_DOC_TYPES.forEach((d) => { flagByName[d.name.toLowerCase()] = !!d.optional; });
    const syncFlag = (d) => { const f = flagByName[(d.name || '').toLowerCase()]; if (f !== undefined) d.optional = f; };
    s.settings.docTypes.forEach(syncFlag);
    (s.nurses || []).forEach((n) => { (n.documents || []).forEach(syncFlag); });
    // Legacy filter keys that no longer exist.
    if (s.statusFilter === 'opi') s.statusFilter = 'all';
    // Backfill the team field on operators saved before the two-team structure.
    (s.settings.operators || []).forEach((o) => { if (o.team === undefined) o.team = ''; });
    // Backfill the personal anagrafica fields and document slots on every saved nurse.
    (s.nurses || []).forEach((n) => {
      // Migrate nurses saved with the legacy 11-state workflow: their checklist still
      // has the old keys 10/11. Map the step and rebuild the checklist on the new
      // 9-phase templates (phases below the current one are marked as done).
      if (n.checklist && (n.checklist[10] || n.checklist[11])) {
        n.currentStep = OLD_TO_NEW_STEP[n.currentStep] || Math.min(n.currentStep || 1, DONE_STEP);
        n.checklist = makeChecklist({ __current: n.currentStep });
      }
      PERSONAL_FIELDS.forEach((k) => { if (n[k] === undefined) n[k] = ''; });
      // Trim histories saved before the log cap existed (see MAX_LOG_ENTRIES).
      if (Array.isArray(n.logs) && n.logs.length > MAX_LOG_ENTRIES) n.logs.length = MAX_LOG_ENTRIES;
      // Structured clinical specialisations + matching assignment (matching protocol).
      if (!Array.isArray(n.specializations)) n.specializations = [];
      if (n.matchedRequestId === undefined) n.matchedRequestId = null;
      if (n.matchedDepartment === undefined) n.matchedDepartment = '';
      // The legacy "origin" field was superseded by birth place + nationality:
      // migrate its value into the birth place (when empty) and drop it.
      if (n.origin) { if (!n.birthPlace) n.birthPlace = n.origin; delete n.origin; }
      if (n.privacyConsent === undefined) n.privacyConsent = false;
      if (n.privacyConsentDate === undefined) n.privacyConsentDate = null;
      if (!Array.isArray(n.documents)) n.documents = [];
      const docNames = n.documents.map((d) => (d.name || '').toLowerCase());
      PERSONAL_DOC_TYPES.forEach((d) => {
        if (docNames.indexOf(d.name.toLowerCase()) < 0) n.documents.push({ id: uid(), name: d.name, language: d.language, uploadDate: null, validity: null, status: 'missing', optional: !!d.optional });
      });
    });
    return s;
  }
  function serverTs() { return firebase.firestore.FieldValue.serverTimestamp(); }
  function saveState() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* quota — ignore */ }
    // Debounced cloud sync when authenticated (paused while the startup remote read runs).
    if (fbEnabled && currentUser && db && !remoteLoading) {
      clearTimeout(remoteSaveTimer);
      remoteSaveTimer = setTimeout(remoteSync, 600);
    }
  }
  function remoteSync() {
    if (!(fbEnabled && currentUser && db)) return;
    try {
      if (SHARED_WORKSPACE) {
        // Shared team workspace: cases and settings live in SEPARATE documents with
        // different permissions (operators write cases; only admins write settings).
        const data = db.collection('organizations').doc(ORG_ID).collection('data');
        const payload = { nurses: state.nurses, requests: state.requests || [], updatedAt: serverTs() };
        warnIfNearSizeLimit(payload);
        setSyncStatus('saving');
        // Snapshot what we are writing NOW: on success it becomes the new cloud baseline.
        const writtenNurses = snapshotMap(state.nurses);
        const writtenRequests = snapshotMap(state.requests || []);
        data.doc('cases').set(payload, { merge: true })
          .then(() => { lastSynced.nurses = writtenNurses; lastSynced.requests = writtenRequests; setSyncStatus('saved'); })
          .catch((err) => setSyncError(t('sync_ctx_cases'), err));
        if (isAdmin()) {
          const settingsJson = stableJson(state.settings);
          data.doc('settings').set({ settings: state.settings, updatedAt: serverTs() }, { merge: true })
            .then(() => { lastSynced.settingsJson = settingsJson; })
            .catch((err) => setSyncError(t('sync_ctx_settings'), err));
          // Access map: keeps Firestore authorization aligned with the HR operators
          // list, so accounts work without server-side custom claims.
          const emails = {};
          (state.settings.operators || []).forEach((o) => {
            const em = (o.email || '').trim().toLowerCase();
            if (em) emails[em] = o.accessRole === 'admin' ? 'admin' : 'operator';
          });
          data.doc('access').set({ emails: emails, updatedAt: serverTs() })
            .catch((err) => setSyncError(t('sync_ctx_access'), err));
        }
      } else {
        setSyncStatus('saving');
        db.collection('nurseflow').doc(currentUser.uid)
          .set({ state: state, updatedAt: serverTs() }, { merge: true })
          .then(() => setSyncStatus('saved'))
          .catch((err) => setSyncError(t('sync_ctx_cases'), err));
      }
    } catch (e) { setSyncError(t('sync_ctx_cases'), e); }
  }

  // Canonical JSON with sorted object keys: lets two copies of the same record compare equal
  // regardless of the property order Firestore returns.
  function stableJson(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v) || 'null';
    if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
    return '{' + Object.keys(v).sort().filter((k) => v[k] !== undefined)
      .map((k) => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}';
  }
  function snapshotMap(arr) {
    const m = {};
    (arr || []).forEach((x) => { if (x && x.id) m[x.id] = stableJson(x); });
    return m;
  }
  // Per-record merge of a remote array into the local one. A record is kept LOCAL only when it
  // was changed here after the last cloud confirmation (dirty); everything else follows the
  // cloud. New records survive from both sides; deletions propagate unless the other side
  // modified the record in the meantime (conservative: modified wins over deleted).
  function mergeRecords(localArr, remoteArr, syncedMap) {
    const localById = {};
    (localArr || []).forEach((x) => { if (x && x.id) localById[x.id] = x; });
    const out = [], seen = {};
    (remoteArr || []).forEach((rx) => {
      if (!rx || !rx.id) return;
      seen[rx.id] = true;
      const rJson = stableJson(rx);
      const lx = localById[rx.id];
      if (!lx) {
        // Not present locally: new from another operator — unless we deleted it here and the
        // cloud copy is unchanged (our pending delete will remove it from the cloud too).
        if (syncedMap[rx.id] !== rJson) { out.push(rx); syncedMap[rx.id] = rJson; }
      } else if (stableJson(lx) === syncedMap[rx.id]) {
        out.push(rx); syncedMap[rx.id] = rJson;      // local untouched → follow the cloud
      } else {
        out.push(lx);                                 // local dirty → keep ours (push will follow)
      }
    });
    (localArr || []).forEach((lx) => {
      if (!lx || !lx.id || seen[lx.id]) return;
      if (syncedMap[lx.id] === undefined || syncedMap[lx.id] !== stableJson(lx)) out.push(lx);
      else delete syncedMap[lx.id];                   // deleted on the cloud, untouched here → drop
    });
    return out;
  }
  function attachRealtimeSync() {
    if (!(fbEnabled && currentUser && db && SHARED_WORKSPACE)) return;
    detachRealtimeSync();
    const data = db.collection('organizations').doc(ORG_ID).collection('data');
    // hasPendingWrites skips the local echo of our own writes; remoteLoading skips snapshots
    // racing the initial full read.
    unsubCases = data.doc('cases').onSnapshot((snap) => {
      if (remoteLoading || !snap.exists || snap.metadata.hasPendingWrites) return;
      const d = snap.data() || {};
      applyRemoteCases(Array.isArray(d.nurses) ? d.nurses : [], Array.isArray(d.requests) ? d.requests : []);
    }, (err) => setSyncError(t('sync_ctx_listen'), err));
    unsubSettings = data.doc('settings').onSnapshot((snap) => {
      if (remoteLoading || !snap.exists || snap.metadata.hasPendingWrites) return;
      const d = snap.data() || {};
      if (d.settings) applyRemoteSettings(d.settings);
    }, () => { /* settings listener is best-effort */ });
  }
  function detachRealtimeSync() {
    if (unsubCases) { try { unsubCases(); } catch (e) { /* ignore */ } unsubCases = null; }
    if (unsubSettings) { try { unsubSettings(); } catch (e) { /* ignore */ } unsubSettings = null; }
  }
  function applyRemoteCases(remoteNurses, remoteRequests) {
    // Normalize the incoming records with the same pipeline as local ones, so the
    // stableJson comparisons in mergeRecords never trip on backfilled fields.
    normalizeState(Object.assign({}, state, { nurses: remoteNurses, requests: remoteRequests }));
    // Detect facility-request events from ANOTHER operator (own writes are skipped upstream by
    // hasPendingWrites), so the matching team is alerted to new and just-filled requests.
    alertRemoteRequestEvents(state.requests || [], remoteRequests);
    const beforeN = stableJson(state.nurses), beforeR = stableJson(state.requests || []);
    state.nurses = mergeRecords(state.nurses, remoteNurses, lastSynced.nurses);
    state.requests = mergeRecords(state.requests || [], remoteRequests, lastSynced.requests);
    state.nurses.forEach((n) => { n.status = deriveStatus(n); });
    if (state.selectedNurseId && !getNurse(state.selectedNurseId)) {
      state.selectedNurseId = state.nurses[0] ? state.nurses[0].id : null;
    }
    if (stableJson(state.nurses) !== beforeN || stableJson(state.requests) !== beforeR) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* quota — ignore */ }
      notifyRemoteUpdate();
      safeRemoteRender();
    }
  }
  // Compare the requests we hold against the incoming remote copy and toast the two events
  // the matching team cares about: a brand-new request, and one that just became fully staffed.
  // At most two toasts per snapshot, so a bulk change can't flood the screen.
  function alertRemoteRequestEvents(localReqs, remoteReqs) {
    const byId = {};
    localReqs.forEach((r) => { if (r && r.id) byId[r.id] = r; });
    let created = 0, filled = 0, lastCreated = null, lastFilled = null;
    remoteReqs.forEach((rr) => {
      if (!rr || !rr.id) return;
      const lr = byId[rr.id];
      if (!lr) { created++; lastCreated = rr; }
      else if (lr.status !== 'matched' && rr.status === 'matched') { filled++; lastFilled = rr; }
    });
    if (lastCreated) showToast(created > 1 ? t('toast_req_created_many', { n: created }) : t('toast_req_created', { s: requestLabel(lastCreated), n: lastCreated.quantity || 1 }), 'info', 5000);
    if (lastFilled) showToast(filled > 1 ? t('toast_req_filled_many', { n: filled }) : t('toast_req_filled', { s: requestLabel(lastFilled), n: lastFilled.quantity || 1 }), 'ok', 6000);
  }
  function applyRemoteSettings(remoteSettings) {
    normalizeState(Object.assign({}, state, { settings: remoteSettings }));
    const remoteJson = stableJson(remoteSettings);
    const localJson = stableJson(state.settings);
    if (remoteJson === localJson) { lastSynced.settingsJson = remoteJson; return; }
    // An admin with unsaved local settings edits keeps them (their push will follow).
    if (lastSynced.settingsJson && localJson !== lastSynced.settingsJson) return;
    state.settings = remoteSettings;
    lastSynced.settingsJson = remoteJson;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* quota — ignore */ }
    safeRemoteRender();
  }
  // Re-render triggered by REMOTE data: deferred while the operator is typing, has a modal
  // open or is following the tour, so their in-progress work is never wiped by a redraw.
  function safeRemoteRender() {
    const ae = document.activeElement;
    const typing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT');
    if (typing || tour.active || document.getElementById('modal-layer')) {
      clearTimeout(remoteRenderTimer);
      remoteRenderTimer = setTimeout(safeRemoteRender, 2500);
      return;
    }
    render();
  }
  function notifyRemoteUpdate() {
    const now = Date.now();
    if (now - lastRemoteToastAt < 30000) return;
    lastRemoteToastAt = now;
    showToast(t('sync_remote_update'), 'info', 3500);
  }
  function setSyncStatus(s) { syncStatus = s; updateSyncChip(); }
  function setSyncError(ctx, err) {
    const wasError = syncStatus === 'error';
    syncStatus = 'error';
    syncErrorMsg = ctx + ': ' + ((err && err.message) || err || '?');
    console.warn('[sync]', syncErrorMsg);
    updateSyncChip();
    if (!wasError) showToast(t('sync_error_toast'), 'error', 6000);
  }
  // The Firestore document hard limit is ~1 MiB: warn the team well before writes start failing.
  function warnIfNearSizeLimit(payload) {
    if (sizeWarnShown) return;
    let size = 0;
    try { size = JSON.stringify(payload).length; } catch (e) { return; }
    if (size > 850000) { sizeWarnShown = true; showToast(t('sync_size_warn'), 'warn', 9000); }
  }

  // ---------- Derived / computed selectors ----------
  function getNurse(id) { return state.nurses.find((n) => n.id === id); }

  // ---------- Roles & permissions ----------
  // Cloud users are matched to an operator record by email; unmatched users default to admin
  // (avoids lock-out on first run). In demo mode the role is a switchable local setting.
  function currentRole() {
    if (fbEnabled && currentUser) {
      // 1) Trusted source: Firebase custom claims (set server-side, enforced by Firestore rules).
      if (userClaims && (userClaims.role === 'admin' || userClaims.role === 'operator')) return userClaims.role;
      // 2) Convenience fallback (NOT a security boundary): match by email in the operators list.
      //    Used only when no role claim is set yet (e.g. single-workspace per-user data).
      const email = (currentUser.email || '').toLowerCase();
      if (email) {
        const op = (state.settings.operators || []).find((o) => (o.email || '').toLowerCase() === email);
        if (op && op.accessRole) return op.accessRole;
      }
      // In a SHARED team workspace the safe default is least-privilege (operator): admins are
      // granted explicitly via custom claims. In per-user mode each user owns their own data,
      // so defaulting to admin-of-own-workspace is harmless.
      return SHARED_WORKSPACE ? 'operator' : 'admin';
    }
    return state.demoRole || 'admin';
  }
  function isAdmin() { return currentRole() === 'admin'; }

  // ---------- Operator teams (RD / Italy) ----------
  function teamLabel(team) { return team === 'rd' ? t('team_rd') : (team === 'it' ? t('team_it') : ''); }
  function teamFlag(team) { return team === 'rd' ? '🇩🇴' : (team === 'it' ? '🇮🇹' : ''); }
  function operatorByName(name) {
    const k = (name || '').trim().toLowerCase();
    if (!k) return null;
    return (state.settings.operators || []).find((o) => (o.name || '').trim().toLowerCase() === k) || null;
  }
  // The operator record of whoever is using the app: matched by email in cloud mode,
  // by the locally saved operator name in demo mode.
  function currentOperator() {
    if (fbEnabled && currentUser) {
      const email = (currentUser.email || '').toLowerCase();
      if (email) {
        const op = (state.settings.operators || []).find((o) => (o.email || '').toLowerCase() === email);
        if (op) return op;
      }
      return operatorByName(currentUser.displayName || '');
    }
    return operatorByName(localOperatorName());
  }
  function myTeam() {
    const op = currentOperator();
    return op && (op.team === 'rd' || op.team === 'it') ? op.team : null;
  }
  // Display name of whoever is actually using the app right now — recorded as the author of
  // every log entry (audit trail: notes, approvals, phase advances, matches).
  function actorName() {
    const op = currentOperator();
    if (op && op.name) return op.name;
    if (fbEnabled && currentUser) return currentUser.displayName || currentUser.email || t('log_author_op');
    return localOperatorName() || t('log_author_op');
  }
  // Operational split between the two teams. Admins and operators WITHOUT an
  // assigned team keep full access (backward compatible); a team-assigned
  // operator works only the phases of their own team.
  function canOperatePhase(step) { return isAdmin() || !myTeam() || myTeam() === stepTeam(step); }
  // Requests & matching belong to the Italy team.
  function canManageMatching() { return isAdmin() || !myTeam() || myTeam() === 'it'; }
  function teamTag(team) { return teamFlag(team) + ' ' + teamLabel(team); }

  // ---------- Hospital requests & technical matching (protocol 2.0) ----------
  function getRequest(id) { return (state.requests || []).find((r) => r.id === id); }
  function requestLabel(r) { return r.employer + (r.department ? ' — ' + r.department : ''); }
  function nurseSpecs(n) { return Array.isArray(n.specializations) ? n.specializations : []; }
  function specsCatalog() { return (state.settings.specialties || []).map((s) => s.name); }
  function dossierDoc(n) { return (n.documents || []).find((d) => (d.name || '').toLowerCase().indexOf('italia in tasca') >= 0); }
  // Match score: eligible profiles hold ALL the required skills; preferred skills,
  // validated dossier, complete documents and pipeline progress rank the shortlist.
  function matchScore(r, n) {
    const specs = nurseSpecs(n);
    const req = r.requiredSkills || [], pref = r.preferredSkills || [];
    const reqHit = req.filter((x) => specs.indexOf(x) >= 0).length;
    const prefHit = pref.filter((x) => specs.indexOf(x) >= 0).length;
    const docsOk = !(n.documents || []).some((d) => d.status !== 'approved' && !d.optional);
    const dd = dossierDoc(n);
    const dossierOk = !!(dd && dd.status === 'approved');
    const full = req.length === 0 || reqHit === req.length;
    const score = (full ? 100 : Math.round((reqHit / Math.max(1, req.length)) * 60))
      + prefHit * 8 + (dossierOk ? 5 : 0) + (docsOk ? 4 : 0) + Math.min(n.currentStep, LAST_STEP);
    return { reqHit: reqHit, reqTot: req.length, prefHit: prefHit, prefTot: pref.length, docsOk: docsOk, dossierOk: dossierOk, full: full, score: score };
  }
  // Matching pool: not yet matched and not yet in the employment phase (8+).
  function matchCandidates(r) {
    return state.nurses
      .filter((n) => n.currentStep < 8 && !n.matchedRequestId)
      .map((n) => ({ n: n, m: matchScore(r, n) }))
      .sort((a, b) => b.m.score - a.m.score);
  }
  // A request is fully staffed once it has as many matched nurses as requested.
  function requestFull(r) { return (r.matched || []).length >= (r.quantity || 1); }
  function assignMatch(reqId, nurseId) {
    if (!canManageMatching()) return;
    const r = getRequest(reqId); const n = getNurse(nurseId);
    if (!r || !n || r.status !== 'open' || requestFull(r)) return;
    if (!confirm(t('mt_confirm_assign', { n: n.name, s: r.employer, r: r.department || '—' }))) return;
    r.matched.push({ id: n.id, name: n.name, at: new Date().toISOString().slice(0, 10) });
    // This assignment can be the one that fills the last seat: flag it for the alert below.
    const justFilled = requestFull(r);
    if (justFilled) r.status = 'matched';
    n.matchedRequestId = r.id; n.matchedDepartment = r.department || '';
    n.employer = r.employer;
    pushLog(n, 'system', actorName(), t('log_matched', { s: r.employer, r: r.department || '—' }));
    n.lastUpdate = new Date().toISOString().slice(0, 10);
    closeModal();
    commit();
    if (justFilled) showToast(t('toast_req_filled', { s: requestLabel(r), n: r.quantity || 1 }), 'ok', 6000);
  }
  function unassignMatch(reqId, nurseId) {
    if (!canManageMatching()) return;
    const r = getRequest(reqId); if (!r || r.status === 'closed') return;
    const entry = (r.matched || []).find((m) => m.id === nurseId); if (!entry) return;
    const n = getNurse(nurseId);
    if (n) {
      n.matchedRequestId = null; n.matchedDepartment = '';
      pushLog(n, 'alert', actorName(), t('log_unmatched', { s: r.employer, r: r.department || '—' }));
      n.lastUpdate = new Date().toISOString().slice(0, 10);
    }
    r.matched = r.matched.filter((m) => m.id !== nurseId);
    if (r.status === 'matched') r.status = 'open';
    commit();
  }
  function closeRequest(reqId) {
    if (!canManageMatching()) return;
    const r = getRequest(reqId); if (!r || r.status === 'closed') return;
    r.status = 'closed';
    commit();
  }
  function reopenRequest(reqId) {
    if (!canManageMatching()) return;
    const r = getRequest(reqId); if (!r || r.status !== 'closed') return;
    r.status = requestFull(r) ? 'matched' : 'open';
    commit();
  }
  function deleteRequest(reqId) {
    if (!canManageMatching()) return;
    const r = getRequest(reqId); if (!r) return;
    if (!confirm(t('mt_confirm_delete', { s: r.employer, r: r.department || '—' }))) return;
    (r.matched || []).forEach((m) => {
      const n = getNurse(m.id);
      if (n) { n.matchedRequestId = null; n.matchedDepartment = ''; }
    });
    state.requests = (state.requests || []).filter((x) => x.id !== reqId);
    commit();
  }
  function setDemoRole(role) {
    if (role !== 'admin' && role !== 'operator') return;
    state.demoRole = role;
    if (!isAdmin() && state.view === 'settings') state.view = 'dashboard';
    commit();
  }

  function deriveStatus(nurse) {
    if (nurse.currentStep >= DONE_STEP) return 'Onboarding Completed';
    // Optional documents (language/criminal/health certificates) never flag the case.
    if (nurse.documents.some((d) => d.status === 'missing' && !d.optional)) return 'Missing Docs';
    // Italy-team phases (5-9): the candidate has arrived and is being placed/assisted.
    if (nurse.currentStep >= FIRST_ITALY_STEP) return 'Visa Obtained';
    return 'In Progress';
  }

  function blockers(nurse) {
    // Returns array of human-readable reasons the case cannot advance. Empty => can advance.
    const reasons = [];
    if (nurse.currentStep >= DONE_STEP) { reasons.push(t('bl_done')); return reasons; }
    const items = nurse.checklist[nurse.currentStep] || [];
    const pending = items.filter((i) => !i.done);
    pending.forEach((i) => reasons.push(t('bl_checklist', { x: checklistLabel(i.step, i.idx) })));
    if (nurse.currentStep === STEP_REQUIRES_ALL_DOCS_APPROVED) {
      const miss = nurse.documents.filter((d) => d.status === 'missing' && !d.optional);
      miss.forEach((d) => reasons.push(t('bl_doc_missing', { x: d.name })));
      const notOk = nurse.documents.filter((d) => d.status === 'pending' && !d.optional);
      notOk.forEach((d) => reasons.push(t('bl_doc_approve', { x: d.name })));
    }
    return reasons;
  }
  function canAdvance(nurse) { return blockers(nurse).length === 0; }

  function isAtRisk(nurse) {
    if (nurse.currentStep >= DONE_STEP) return false;
    const sla = STEP_SLA_DAYS[nurse.currentStep] || 30;
    return daysBetween(nurse.lastUpdate) > sla;
  }

  // A candidate is considered "sent to Italy" once the Italy team takes over (phase 5, arrival).
  const SENT_TO_ITALY_STEP = FIRST_ITALY_STEP;

  function computeKpis() {
    const active = state.nurses.filter((n) => n.currentStep < DONE_STEP).length;
    const missing = state.nurses.filter((n) => n.documents.some((d) => d.status === 'missing' && !d.optional)).length;
    // Matching phase: cases being matched with a healthcare facility request.
    const matching = state.nurses.filter((n) => n.currentStep === 7).length;
    const completed = state.nurses.filter((n) => n.currentStep >= DONE_STEP).length;
    const expiring = computeExpiring().length;
    // Transfer summary: total under management, sent to Italy, still to send.
    const treating = state.nurses.length;
    const sent = state.nurses.filter((n) => n.currentStep >= SENT_TO_ITALY_STEP).length;
    const toSend = state.nurses.filter((n) => n.currentStep < SENT_TO_ITALY_STEP).length;
    // Facility requests: still to fulfil (open) vs fulfilled (fully staffed or closed),
    // plus the seats left to cover across the open ones.
    const reqs = state.requests || [];
    const reqOpen = reqs.filter((r) => r.status === 'open').length;
    const reqDone = reqs.filter((r) => r.status === 'matched' || r.status === 'closed').length;
    const reqSeats = reqs.filter((r) => r.status === 'open')
      .reduce((s, r) => s + Math.max(0, (r.quantity || 1) - (r.matched || []).length), 0);
    return { active, missing, matching, completed, expiring, treating, sent, toSend, reqOpen, reqDone, reqSeats };
  }

  // Documents that are expired or expiring within 60 days, across all candidates.
  function computeExpiring() {
    const list = [];
    state.nurses.forEach((n) => {
      (n.documents || []).forEach((d) => {
        const ex = docExpiry(d);
        if (ex === 'expired' || ex === 'soon') list.push({ n: n, d: d, ex: ex });
      });
      // Identity expiry dates from the personal-data sheet (passport / cédula): surfaced as
      // virtual entries so the dashboard panel and KPI alert on them, not just on file validities.
      [{ k: 'passportExpiry', label: t('f_passport_exp') }, { k: 'cedulaExpiry', label: t('f_cedula_exp') }].forEach((f) => {
        if (!n[f.k]) return;
        const ex = docExpiry({ validity: n[f.k] });
        if (ex === 'expired' || ex === 'soon') list.push({ n: n, d: { name: f.label, validity: n[f.k] }, ex: ex });
      });
    });
    list.sort((a, b) => {
      if (a.ex !== b.ex) return a.ex === 'expired' ? -1 : 1;
      return String(a.d.validity).localeCompare(String(b.d.validity));
    });
    return list;
  }

  function employerBreakdown() {
    const map = {};
    state.nurses.forEach((n) => {
      const key = n.employer || 'Non assegnato';
      if (!map[key]) map[key] = { total: 0, completed: 0, active: 0 };
      map[key].total++;
      if (n.currentStep >= DONE_STEP) map[key].completed++; else map[key].active++;
    });
    return Object.entries(map).map(([employer, v]) => ({ employer, ...v }))
      .sort((a, b) => b.total - a.total);
  }

  // ---------- Actions (mutations) ----------
  function commit() { state.nurses.forEach((n) => { n.status = deriveStatus(n); }); saveState(); render(); }

  function setView(view) { state.view = view; commit(); }
  function selectNurse(id) { state.selectedNurseId = id; state.view = 'cases'; commit(); }
  function setSearch(v) { state.search = v; saveState(); renderCasesOnly(); }
  function setFilter(v) { state.statusFilter = v; commit(); }

  function approveDoc(nurseId, docId) {
    const n = getNurse(nurseId); const d = n.documents.find((x) => x.id === docId); if (!d) return;
    if (!canOperatePhase(n.currentStep)) return; // the other team's phase
    d.status = 'approved';
    if (!d.uploadDate) d.uploadDate = new Date().toISOString().slice(0, 10);
    pushLog(n, 'system', actorName(), t('log_doc_approved', { x: d.name }));
    n.lastUpdate = new Date().toISOString().slice(0, 10);
    commit();
  }
  function rejectDoc(nurseId, docId) {
    const n = getNurse(nurseId); const d = n.documents.find((x) => x.id === docId); if (!d) return;
    if (!canOperatePhase(n.currentStep)) return; // the other team's phase
    d.status = 'missing'; d.uploadDate = null;
    d.fileName = null; d.fileUrl = null; d.fileSize = null; d.fileStoragePath = null;
    pushLog(n, 'alert', actorName(), t('log_doc_rejected', { x: d.name }));
    n.lastUpdate = new Date().toISOString().slice(0, 10);
    commit();
  }

  // ---------- Real file upload for documents ----------
  let pendingUpload = null;
  function triggerUpload(nurseId, docId) {
    const gn = getNurse(nurseId);
    if (gn && !canOperatePhase(gn.currentStep)) return; // the other team's phase
    pendingUpload = { nurseId: nurseId, docId: docId };
    let input = document.getElementById('doc-file-input');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'doc-file-input';
      input.style.display = 'none';
      input.accept = '.pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.doc,.docx';
      input.addEventListener('change', onDocFileChosen);
      document.body.appendChild(input);
    }
    input.value = '';
    input.click();
  }
  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
  }
  async function onDocFileChosen(e) {
    const file = e.target.files && e.target.files[0];
    if (!file || !pendingUpload) return;
    const ctx = pendingUpload; pendingUpload = null;
    const n = getNurse(ctx.nurseId); if (!n) return;
    const d = n.documents.find((x) => x.id === ctx.docId); if (!d) return;

    d.fileName = file.name;
    d.fileSize = file.size;
    d.uploadDate = new Date().toISOString().slice(0, 10);
    d.status = 'pending';
    d.fileUrl = null; d.fileStoragePath = null;

    try {
      if (fbEnabled && storage && currentUser) {
        // Upload the real bytes to Firebase Storage; keep only the download URL in the DB.
        const base = SHARED_WORKSPACE ? ('documents/org/' + ORG_ID) : ('documents/users/' + currentUser.uid);
        const path = base + '/' + ctx.docId + '/' + Date.now() + '_' + file.name;
        const ref = storage.ref().child(path);
        const snap = await ref.put(file);
        d.fileUrl = await snap.ref.getDownloadURL();
        d.fileStoragePath = path;
      } else if (file.size <= 900 * 1024) {
        // No cloud storage (demo/offline): embed small files as a data URL so they're viewable.
        d.fileUrl = await readAsDataURL(file);
      } else {
        // Too large to embed without Storage — keep the metadata, flag it.
        d.fileTooBig = true;
      }
    } catch (err) {
      console.warn('Upload fallito:', err && err.message);
    }
    pushLog(n, 'note', actorName(), t('log_doc_uploaded', { x: d.name }));
    // Uploading the signed privacy form marks the consent as acquired on the record.
    if ((d.name || '').toLowerCase().indexOf('consenso privacy') >= 0 && !n.privacyConsent) {
      n.privacyConsent = true;
      n.privacyConsentDate = new Date().toISOString().slice(0, 10);
      pushLog(n, 'system', actorName(), t('log_privacy_acquired'));
    }
    n.lastUpdate = new Date().toISOString().slice(0, 10);
    commit();
  }

  function toggleChecklist(nurseId, stepId, itemId) {
    const n = getNurse(nurseId);
    if (!canOperatePhase(n.currentStep)) return; // the other team's phase
    const item = (n.checklist[stepId] || []).find((i) => i.id === itemId);
    if (!item) return;
    item.done = !item.done;
    n.lastUpdate = new Date().toISOString().slice(0, 10);
    commit();
  }

  function advanceStatus(nurseId) {
    const n = getNurse(nurseId);
    if (!canOperatePhase(n.currentStep)) return; // the other team's phase
    if (!canAdvance(n)) return;
    if (n.currentStep >= DONE_STEP) return;
    const from = stepName(n.currentStep);
    n.currentStep += 1;
    n.lastUpdate = new Date().toISOString().slice(0, 10);
    const to = n.currentStep >= DONE_STEP ? t('state_done') : stepName(n.currentStep);
    pushLog(n, 'system', actorName(), t('log_advanced', { from: from, to: to }));
    commit();
  }

  function pushLog(nurse, type, author, text) {
    nurse.logs.unshift({ id: uid(), at: new Date().toISOString(), type, author, text });
    // Oldest entries fall off the end: the shared Firestore document must stay under ~1 MiB.
    if (nurse.logs.length > MAX_LOG_ENTRIES) nurse.logs.length = MAX_LOG_ENTRIES;
  }
  function addLog(nurseId, type, text) {
    const n = getNurse(nurseId);
    const clean = (text || '').trim();
    if (!clean) return;
    pushLog(n, type, actorName(), clean);
    commit();
  }

  function resetData() {
    // Cloud mode: never allow seeding demo data over the team's real shared caseload.
    if (!isAdmin() || fbEnabled) return;
    if (!confirm(t('reset_confirm'))) return;
    state = seedState();
    saveState();
    render();
  }

  // ---------- Create anagrafica & documents (modals) ----------
  function defaultRequiredDocs() {
    // Driven by the configurable document types managed in Settings.
    const types = (state && state.settings && state.settings.docTypes) || [];
    if (types.length) {
      return types.map((dt) => ({ id: uid(), name: dt.name, language: dt.language || 'ES', uploadDate: null, validity: null, status: 'missing', optional: !!dt.optional }));
    }
    return [
      { id: uid(), name: 'Diploma di Laurea in Infermieristica', language: 'ES', uploadDate: null, validity: null, status: 'missing' },
      { id: uid(), name: 'Certificato Professionale (Exatec)', language: 'ES', uploadDate: null, validity: null, status: 'missing' },
      { id: uid(), name: 'Traduzione Asseverata del Titolo', language: 'IT', uploadDate: null, validity: null, status: 'missing' },
      { id: uid(), name: 'Legalizzazione (Apostille de La Haya)', language: 'IT', uploadDate: null, validity: null, status: 'missing' },
    ].concat(PERSONAL_DOC_TYPES.map((d) => ({ id: uid(), name: d.name, language: d.language, uploadDate: null, validity: null, status: 'missing', optional: !!d.optional })));
  }

  function modalShell(inner, wide) {
    closeModal();
    const wrap = document.createElement('div');
    wrap.id = 'modal-layer';
    wrap.className = 'fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4';
    wrap.style.backdropFilter = 'blur(2px)';
    wrap.innerHTML = '<div class="max-h-[92vh] w-full ' + (wide ? 'max-w-3xl' : 'max-w-lg') + ' overflow-y-auto rounded-2xl bg-white shadow-2xl animate-fadeIn">' + inner + '</div>';
    document.body.appendChild(wrap);
    lucide.createIcons();
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) closeModal(); });
    return wrap;
  }
  function closeModal() { const m = document.getElementById('modal-layer'); if (m) m.remove(); }

  // ---------- Toast notifications (sync errors, remote updates, warnings) ----------
  function showToast(msg, tone, ms) {
    let layer = document.getElementById('toast-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.id = 'toast-layer';
      layer.className = 'pointer-events-none fixed bottom-4 left-1/2 z-[95] flex w-full max-w-md -translate-x-1/2 flex-col items-center gap-2 px-4';
      document.body.appendChild(layer);
    }
    const tones = { error: 'bg-rose-600 text-white', warn: 'bg-amber-500 text-white', info: 'bg-slate-800 text-white', ok: 'bg-emerald-600 text-white' };
    const el = document.createElement('div');
    el.className = 'pointer-events-auto w-full rounded-xl px-4 py-3 text-center text-sm font-semibold shadow-2xl animate-fadeIn ' + (tones[tone] || tones.info);
    el.textContent = msg;
    layer.appendChild(el);
    setTimeout(() => { el.remove(); const l = document.getElementById('toast-layer'); if (l && !l.children.length) l.remove(); }, ms || 4500);
  }
  function fieldVal(id) { const e = document.getElementById(id); return e ? e.value.trim() : ''; }
  function inputField(id, label, ph, required, type) {
    return '<div>' +
      '<label class="mb-1 block text-xs font-semibold text-slate-500">' + label + (required ? ' <span class="text-rose-500">*</span>' : '') + '</label>' +
      '<input id="' + id + '" type="' + (type || 'text') + '" placeholder="' + escapeHtml(ph) + '" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100" />' +
    '</div>';
  }

  let editNurseId = null;
  function openNewNurseModal(editId) {
    editNurseId = editId || null;
    const e = editNurseId ? getNurse(editNurseId) : null;
    const inner =
      '<div class="flex items-center justify-between border-b border-slate-100 p-5">' +
        '<div class="flex items-center gap-2"><i data-lucide="' + (e ? 'user-cog' : 'user-plus') + '" class="h-5 w-5 text-indigo-500"></i><h3 class="text-base font-bold text-slate-900">' + (e ? t('edit_candidate') : t('nn_title')) + '</h3></div>' +
        '<button data-action="close-modal" class="text-slate-300 transition hover:text-slate-500"><i data-lucide="x" class="h-5 w-5"></i></button>' +
      '</div>' +
      '<div id="nn-error" class="mx-5 mt-4 hidden rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 ring-1 ring-inset ring-rose-200"></div>' +
      '<div class="grid gap-3 p-5 sm:grid-cols-2">' +
        inputField('nn-name', t('nn_name'), 'Ana Valeria Rosario', true) +
        inputField('nn-passport', t('nn_passport'), 'RD-XX0000000', true) +
        inputField('nn-passport-exp', t('nn_passport_exp'), '', false, 'date') +
        inputField('nn-cedula', t('nn_cedula'), '001-0000000-0') +
        inputField('nn-cedula-exp', t('nn_cedula_exp'), '', false, 'date') +
        inputField('nn-birthdate', t('nn_birthdate'), '', false, 'date') +
        inputField('nn-birthplace', t('nn_birthplace'), 'Santo Domingo') +
        inputField('nn-nationality', t('nn_nationality'), t('nn_default_nationality')) +
        selectField('nn-marital', t('nn_marital'), [
          { value: 'single', labelKey: 'ms_single' }, { value: 'married', labelKey: 'ms_married' },
          { value: 'divorced', labelKey: 'ms_divorced' }, { value: 'widowed', labelKey: 'ms_widowed' },
          { value: 'other', labelKey: 'ms_other' },
        ], e ? (e.maritalStatus || '') : '') +
        inputField('nn-phone', t('nn_phone'), '+1 809 000 0000', false, 'tel') +
        inputField('nn-email', t('nn_email'), 'nome@example.com', false, 'email') +
        '<div class="sm:col-span-2">' + inputField('nn-address', t('nn_address'), 'Calle, numero, città, provincia') + '</div>' +
        '<p class="sm:col-span-2 -mb-1 mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">' + t('tab_competenze') + '</p>' +
        inputField('nn-role', t('f_role'), 'Infermiere/a') +
        inputField('nn-sector', t('f_sector'), 'Terapia intensiva') +
        inputField('nn-exp', t('f_experience'), '5 anni') +
        selectField('nn-agency', t('nn_agency'), agencyOptions(), e ? e.partnerAgency : '') +
        inputField('nn-lang', t('nn_lang'), 'A2') +
        selectField('nn-employer', t('nn_employer'), employerOptions(), e ? e.employer : '') +
        selectField('nn-hr', t('nn_hr'), operatorOptions(), e ? e.hrReferent : '') +
        '<div class="sm:col-span-2"><label class="mb-1 block text-xs font-semibold text-slate-500">' + t('nn_specs') + '</label>' + specChips('nn-spec', e ? (e.specializations || []) : []) + '</div>' +
        '<label class="sm:col-span-2 flex cursor-pointer items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">' +
          '<input id="nn-privacy" type="checkbox"' + (e && e.privacyConsent ? ' checked' : '') + ' class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-200" />' +
          '<span class="text-xs leading-relaxed text-slate-600"><b>' + t('nn_privacy') + '</b><br>' + t('nn_privacy_hint') + '</span>' +
        '</label>' +
      '</div>' +
      '<div class="flex items-center justify-between gap-2 border-t border-slate-100 p-5">' +
        (e && isAdmin() ? '<button data-action="delete-nurse" data-id="' + e.id + '" class="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-600 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-50"><i data-lucide="trash-2" class="h-4 w-4"></i>' + t('del_candidate') + '</button>' : '<span></span>') +
        '<div class="flex gap-2">' +
          '<button data-action="close-modal" class="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">' + t('cancel') + '</button>' +
          '<button data-action="create-nurse" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"><i data-lucide="check" class="h-4 w-4"></i>' + (e ? t('save') : t('nn_create')) + '</button>' +
        '</div>' +
      '</div>';
    modalShell(inner);
    if (e) {
      const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
      set('nn-name', e.name); set('nn-passport', e.passport); set('nn-lang', e.languageLevel);
      set('nn-cedula', e.cedula); set('nn-birthdate', e.birthDate); set('nn-birthplace', e.birthPlace);
      set('nn-passport-exp', e.passportExpiry); set('nn-cedula-exp', e.cedulaExpiry);
      set('nn-role', e.profRole); set('nn-sector', e.profSector); set('nn-exp', e.profExperience);
      set('nn-nationality', e.nationality); set('nn-phone', e.phone); set('nn-email', e.email); set('nn-address', e.address);
    }
    const el = document.getElementById('nn-name'); if (el) el.focus();
  }

  function isValidEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((s || '').trim()); }
  function formError(id, msg) { const err = document.getElementById(id); if (err) { err.textContent = msg; err.classList.remove('hidden'); } }
  function createNurseFromForm() {
    const name = fieldVal('nn-name'), passport = fieldVal('nn-passport');
    if (!name || !passport) { formError('nn-error', t('nn_error')); return; }
    // A typo'd email is worse than an empty one (it silently breaks contact data).
    const nnEmail = fieldVal('nn-email');
    if (nnEmail && !isValidEmail(nnEmail)) { formError('nn-error', t('err_email_invalid')); return; }
    // The passport number is the de-facto natural key: block silent duplicates.
    const dupe = state.nurses.find((x) => x.id !== editNurseId && (x.passport || '').trim().toLowerCase() === passport.toLowerCase());
    if (dupe) { formError('nn-error', t('err_passport_dupe', { x: dupe.name })); return; }
    const privacyEl = document.getElementById('nn-privacy');
    const privacyChecked = !!(privacyEl && privacyEl.checked);
    if (editNurseId) {
      // Edit mode: update only the anagrafica fields, keep documents/checklist/state.
      const e = getNurse(editNurseId);
      if (e) {
        e.name = name; e.passport = passport;
        e.partnerAgency = fieldVal('nn-agency') || '—';
        e.languageLevel = fieldVal('nn-lang') || e.languageLevel;
        e.specializations = chipValues('nn-spec');
        e.employer = fieldVal('nn-employer') || t('nn_default_employer');
        e.hrReferent = fieldVal('nn-hr') || '—';
        e.cedula = fieldVal('nn-cedula');
        e.passportExpiry = fieldVal('nn-passport-exp');
        e.cedulaExpiry = fieldVal('nn-cedula-exp');
        e.profRole = fieldVal('nn-role');
        e.profSector = fieldVal('nn-sector');
        e.profExperience = fieldVal('nn-exp');
        e.birthDate = fieldVal('nn-birthdate');
        e.birthPlace = fieldVal('nn-birthplace');
        e.nationality = fieldVal('nn-nationality');
        e.maritalStatus = fieldVal('nn-marital');
        e.phone = fieldVal('nn-phone');
        e.email = fieldVal('nn-email');
        e.address = fieldVal('nn-address');
        // Privacy consent: stamp the date the first time it's granted, clear it if revoked.
        // GDPR: a revocation is an auditable event — it must leave a trace in the log.
        if (privacyChecked && !e.privacyConsent) e.privacyConsentDate = new Date().toISOString().slice(0, 10);
        if (!privacyChecked && e.privacyConsent) pushLog(e, 'alert', actorName(), t('log_privacy_revoked'));
        if (!privacyChecked) e.privacyConsentDate = null;
        e.privacyConsent = privacyChecked;
        e.lastUpdate = new Date().toISOString().slice(0, 10);
      }
      editNurseId = null;
      closeModal();
      commit();
      return;
    }
    const nurse = {
      id: uid(), name: name, passport: passport,
      partnerAgency: fieldVal('nn-agency') || '—',
      languageLevel: fieldVal('nn-lang') || t('nn_default_lang'),
      specializations: chipValues('nn-spec'),
      matchedRequestId: null, matchedDepartment: '',
      employer: fieldVal('nn-employer') || t('nn_default_employer'),
      hrReferent: fieldVal('nn-hr') || '—',
      cedula: fieldVal('nn-cedula'),
      passportExpiry: fieldVal('nn-passport-exp'),
      cedulaExpiry: fieldVal('nn-cedula-exp'),
      profRole: fieldVal('nn-role'),
      profSector: fieldVal('nn-sector'),
      profExperience: fieldVal('nn-exp'),
      birthDate: fieldVal('nn-birthdate'),
      birthPlace: fieldVal('nn-birthplace'),
      nationality: fieldVal('nn-nationality') || t('nn_default_nationality'),
      maritalStatus: fieldVal('nn-marital'),
      phone: fieldVal('nn-phone'),
      email: fieldVal('nn-email'),
      address: fieldVal('nn-address'),
      privacyConsent: privacyChecked,
      privacyConsentDate: privacyChecked ? new Date().toISOString().slice(0, 10) : null,
      currentStep: 1, status: 'In Progress',
      lastUpdate: new Date().toISOString().slice(0, 10),
      documents: defaultRequiredDocs(),
      checklist: makeChecklist({ __current: 1 }),
      relocation: { flight: null, housing: null, tutor: null, contractStatus: t('contract_none') },
      logs: [{ id: uid(), at: new Date().toISOString(), type: 'system', author: actorName(), text: t('log_nurse_created') }],
    };
    state.nurses.unshift(nurse);
    state.selectedNurseId = nurse.id;
    state.view = 'cases';
    closeModal();
    commit();
  }

  // ---------- Relocation / HR onboarding editor ----------
  let relocationNurseId = null;
  function openRelocationModal(nurseId) {
    relocationNurseId = nurseId;
    const n = getNurse(nurseId); if (!n) return;
    const r = n.relocation || {};
    const inner =
      '<div class="flex items-center justify-between border-b border-slate-100 p-5">' +
        '<div class="flex items-center gap-2"><i data-lucide="plane" class="h-5 w-5 text-indigo-500"></i><h3 class="text-base font-bold text-slate-900">' + t('reloc_title') + '</h3></div>' +
        '<button data-action="close-modal" class="text-slate-300 transition hover:text-slate-500"><i data-lucide="x" class="h-5 w-5"></i></button>' +
      '</div>' +
      '<div class="grid gap-3 p-5">' +
        inputField('rl-flight', t('reloc_flight'), 'AZ 681 · SDQ → MXP') +
        inputField('rl-housing', t('reloc_housing'), '') +
        inputField('rl-tutor', t('reloc_tutor'), '') +
        inputField('rl-contract', t('reloc_contract'), '') +
      '</div>' +
      '<div class="flex justify-end gap-2 border-t border-slate-100 p-5">' +
        '<button data-action="close-modal" class="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">' + t('cancel') + '</button>' +
        '<button data-action="save-relocation" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"><i data-lucide="check" class="h-4 w-4"></i>' + t('save') + '</button>' +
      '</div>';
    modalShell(inner);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    set('rl-flight', r.flight); set('rl-housing', r.housing); set('rl-tutor', r.tutor); set('rl-contract', r.contractStatus);
    const el = document.getElementById('rl-flight'); if (el) el.focus();
  }
  function saveRelocation() {
    const n = getNurse(relocationNurseId); if (!n) { closeModal(); return; }
    n.relocation = {
      flight: fieldVal('rl-flight') || null,
      housing: fieldVal('rl-housing') || null,
      tutor: fieldVal('rl-tutor') || null,
      contractStatus: fieldVal('rl-contract') || t('contract_none'),
    };
    n.lastUpdate = new Date().toISOString().slice(0, 10);
    relocationNurseId = null;
    closeModal();
    commit();
  }

  // ---------- Delete candidate, export, document expiry ----------
  function deleteNurse(id) {
    if (!isAdmin()) return;
    const n = getNurse(id); if (!n) return;
    if (!confirm(t('confirm_delete_nurse', { x: n.name }))) return;
    // Release any facility-request slot held by this candidate: the seat becomes
    // available again and a fully-staffed request reopens.
    (state.requests || []).forEach((r) => {
      if (!(r.matched || []).some((m) => m.id === id)) return;
      r.matched = r.matched.filter((m) => m.id !== id);
      if (r.status === 'matched' && !requestFull(r)) r.status = 'open';
    });
    state.nurses = state.nurses.filter((x) => x.id !== id);
    if (state.selectedNurseId === id) state.selectedNurseId = state.nurses[0] ? state.nurses[0].id : null;
    editNurseId = null;
    closeModal();
    commit();
  }

  function docExpiry(d) {
    if (!d || !d.validity || d.validity === '—') return 'none';
    const dt = new Date(d.validity);
    if (isNaN(dt)) return 'none';
    const days = Math.floor((dt - today()) / 86400000);
    if (days < 0) return 'expired';
    if (days <= 60) return 'soon';
    return 'ok';
  }

  function csvCell(v) {
    let s = (v == null ? '' : String(v));
    // Formula-injection guard: Excel executes cells starting with = + - @ as formulas.
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function exportCandidatesCsv() {
    if (!isAdmin()) return;
    const headers = ['Nome', 'Passaporto', 'Luogo di nascita', 'Nazionalità', 'Agenzia', 'Livello linguistico', 'Specializzazioni', 'Datore di lavoro', 'Referente HR', 'Fase', 'Team', 'Stato', 'Ultimo aggiornamento', 'Documenti approvati', 'Documenti totali'];
    const lines = [headers.map(csvCell).join(',')];
    state.nurses.forEach((n) => {
      const appr = (n.documents || []).filter((d) => d.status === 'approved').length;
      const fase = Math.min(n.currentStep, LAST_STEP) + '/9';
      const team = n.currentStep >= DONE_STEP ? '—' : t(stepTeam(n.currentStep) === 'rd' ? 'team_rd' : 'team_it');
      lines.push([n.name, n.passport, n.birthPlace, n.nationality, n.partnerAgency, n.languageLevel, nurseSpecs(n).join(' | '), n.employer, n.hrReferent,
        fase, team, statusLabel(deriveStatus(n)), n.lastUpdate, appr, (n.documents || []).length].map(csvCell).join(','));
    });
    // BOM so Excel opens UTF-8 correctly.
    downloadFile('candidati.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }
  function downloadFile(filename, content, mime) {
    try {
      const blob = new Blob([content], { type: mime || 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
    } catch (e) { console.warn('Download fallito:', e && e.message); }
  }

  // ---------- Document archive & in-app preview ----------
  function allDocs() {
    const q = (state.docSearch || '').trim().toLowerCase();
    const f = state.docFilter || 'all';
    const rows = [];
    state.nurses.forEach((n) => (n.documents || []).forEach((d) => {
      if (f === 'withfile') { if (!d.fileName) return; }
      else if (f === 'expiring') { const ex = docExpiry(d); if (ex !== 'expired' && ex !== 'soon') return; }
      else if (f !== 'all' && d.status !== f) return;
      if (q && !((n.name || '').toLowerCase().includes(q) || (d.name || '').toLowerCase().includes(q) || (d.fileName || '').toLowerCase().includes(q))) return;
      rows.push({ n: n, d: d });
    }));
    return rows;
  }
  function fileKind(name, url) {
    if (/\.(png|jpe?g|webp|gif|heic|heif|bmp)$/i.test(name || '') || /^data:image\//.test(url || '')) return 'image';
    if (/\.pdf$/i.test(name || '') || /^data:application\/pdf/.test(url || '')) return 'pdf';
    return 'other';
  }
  function openDocPreview(nurseId, docId) {
    const n = getNurse(nurseId); const d = n && n.documents.find((x) => x.id === docId);
    if (!d) return;
    let inner;
    if (!d.fileUrl) {
      inner = '<div class="p-10 text-center text-sm text-slate-400"><i data-lucide="file-x" class="mx-auto mb-2 h-8 w-8 text-slate-300"></i>' + t('doc_no_file') + '</div>';
    } else {
      const kind = fileKind(d.fileName, d.fileUrl);
      if (kind === 'image') inner = '<div class="flex justify-center bg-slate-100 p-4"><img src="' + escapeHtml(d.fileUrl) + '" alt="' + escapeHtml(d.fileName || '') + '" class="max-h-[70vh] rounded-lg object-contain" /></div>';
      else if (kind === 'pdf') inner = '<iframe src="' + escapeHtml(d.fileUrl) + '" class="h-[72vh] w-full" title="' + escapeHtml(d.fileName || '') + '"></iframe>';
      else inner = '<div class="p-10 text-center"><a href="' + escapeHtml(d.fileUrl) + '" target="_blank" rel="noopener" class="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"><i data-lucide="download" class="h-4 w-4"></i>' + t('doc_view') + '</a></div>';
    }
    const head =
      '<div class="flex items-center justify-between border-b border-slate-100 p-4">' +
        '<div class="min-w-0"><p class="truncate text-sm font-bold text-slate-900">' + escapeHtml(d.name) + '</p>' +
          '<p class="truncate text-xs text-slate-500">' + escapeHtml(n.name) + (d.fileName ? ' · ' + escapeHtml(d.fileName) : '') + '</p></div>' +
        '<div class="flex items-center gap-2">' +
          (d.fileUrl ? '<a href="' + escapeHtml(d.fileUrl) + '" target="_blank" rel="noopener" class="rounded-lg px-2 py-1 text-slate-400 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50" data-tooltip="' + escapeHtml(t('doc_view')) + '"><i data-lucide="external-link" class="h-4 w-4"></i></a>' : '') +
          '<button data-action="close-modal" class="text-slate-300 transition hover:text-slate-500"><i data-lucide="x" class="h-5 w-5"></i></button>' +
        '</div>' +
      '</div>';
    modalShell(head + inner, true);
  }

  function archiveBody() {
    const list = allDocs();
    const chip = (val, label) =>
      '<button data-action="doc-filter" data-filter="' + val + '" class="rounded-full px-3 py-1 text-xs font-semibold transition ' +
      ((state.docFilter || 'all') === val ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200') + '">' + label + '</button>';
    const rows = list.length === 0
      ? '<div class="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">' + t('archive_empty') + '</div>'
      : '<div class="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm"><table class="w-full min-w-[720px] text-sm">' +
          '<thead><tr class="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">' +
            '<th class="px-4 py-2.5">' + t('col_candidate') + '</th><th class="px-2 py-2.5">' + t('th_document') + '</th><th class="px-2 py-2.5">' + t('th_lang') + '</th><th class="px-2 py-2.5">' + t('th_uploaded') + '</th><th class="px-2 py-2.5">' + t('th_status') + '</th><th class="px-4 py-2.5 text-right">' + t('th_actions') + '</th>' +
          '</tr></thead><tbody>' +
          list.map((it) => {
            const d = it.d, n = it.n, m = DOC_STATUS_CLS[d.status], icon = DOC_STATUS_ICON[d.status];
            const ex = docExpiry(d);
            const exBadge = ex === 'expired'
              ? ' <span class="inline-flex items-center gap-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200"><i data-lucide="calendar-x" class="h-2.5 w-2.5"></i>' + t('exp_expired') + '</span>'
              : ex === 'soon'
                ? ' <span class="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200"><i data-lucide="calendar-clock" class="h-2.5 w-2.5"></i>' + t('exp_soon') + '</span>'
                : '';
            const act = d.fileName
              ? '<button data-action="view-doc" data-nurse="' + n.id + '" data-doc="' + d.id + '" class="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200 transition hover:bg-indigo-100"><i data-lucide="eye" class="h-3 w-3"></i>' + t('doc_view') + '</button>'
              : '<span class="text-xs text-slate-300">' + t('doc_no_file') + '</span>';
            return '<tr class="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">' +
              '<td class="px-4 py-3"><button data-action="open-nurse" data-id="' + n.id + '" class="font-semibold text-slate-800 hover:text-indigo-600">' + escapeHtml(n.name) + '</button></td>' +
              '<td class="px-2 py-3 text-slate-700">' + escapeHtml(d.name) + (d.fileName ? '<span class="ml-1 text-slate-300">·</span> <span class="text-[11px] text-slate-400">' + escapeHtml(d.fileName) + '</span>' : '') + '</td>' +
              '<td class="px-2 py-3"><span class="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500">' + escapeHtml(d.language) + '</span></td>' +
              '<td class="px-2 py-3 text-xs text-slate-500">' + formatDate(d.uploadDate) + '</td>' +
              '<td class="px-2 py-3"><span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ' + m + '"><i data-lucide="' + icon + '" class="h-3 w-3"></i>' + docStatusLabel(d.status) + '</span>' + exBadge + '</td>' +
              '<td class="px-4 py-3 text-right">' + act + '</td>' +
            '</tr>';
          }).join('') +
          '</tbody></table></div>';
    return '<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">' +
        '<div class="relative sm:max-w-xs sm:flex-1">' +
          '<i data-lucide="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></i>' +
          '<input id="doc-search-input" data-action="doc-search" type="text" value="' + escapeHtml(state.docSearch || '') + '" placeholder="' + escapeHtml(t('archive_search_ph')) + '" class="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100" />' +
        '</div>' +
        '<div class="flex flex-wrap gap-1.5">' + chip('all', t('filter_all')) + chip('withfile', t('filter_withfile')) + chip('expiring', t('filter_expiring')) + chip('approved', docStatusLabel('approved')) + chip('pending', docStatusLabel('pending')) + chip('missing', docStatusLabel('missing')) + '</div>' +
      '</div>' + rows;
  }
  function archiveView() {
    return '<main class="animate-fadeIn mx-auto max-w-[1400px] px-4 py-6 sm:px-5">' +
      '<div class="mb-6"><h2 class="text-xl font-extrabold text-slate-900">' + t('archive_title') + '</h2>' +
      '<p class="text-sm text-slate-500">' + t('archive_sub') + '</p></div>' +
      '<div id="archive-host">' + archiveBody() + '</div>' +
    '</main>';
  }

  let pendingDocNurse = null;
  function openAddDocModal(nurseId) {
    pendingDocNurse = nurseId;
    const inner =
      '<div class="flex items-center justify-between border-b border-slate-100 p-5">' +
        '<div class="flex items-center gap-2"><i data-lucide="file-plus" class="h-5 w-5 text-indigo-500"></i><h3 class="text-base font-bold text-slate-900">' + t('ad_title') + '</h3></div>' +
        '<button data-action="close-modal" class="text-slate-300 transition hover:text-slate-500"><i data-lucide="x" class="h-5 w-5"></i></button>' +
      '</div>' +
      '<div id="ad-error" class="mx-5 mt-4 hidden rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 ring-1 ring-inset ring-rose-200"></div>' +
      '<div class="grid gap-3 p-5">' +
        inputField('ad-name', t('ad_name'), '', true) +
        '<div class="grid grid-cols-2 gap-3">' +
          '<div><label class="mb-1 block text-xs font-semibold text-slate-500">' + t('ad_lang') + '</label>' +
            '<select id="ad-lang" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-300"><option value="ES">ES</option><option value="IT">IT</option></select></div>' +
          inputField('ad-validity', t('ad_validity'), '2030-01-01') +
        '</div>' +
      '</div>' +
      '<div class="flex justify-end gap-2 border-t border-slate-100 p-5">' +
        '<button data-action="close-modal" class="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">' + t('cancel') + '</button>' +
        '<button data-action="create-doc" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"><i data-lucide="plus" class="h-4 w-4"></i>' + t('add') + '</button>' +
      '</div>';
    modalShell(inner);
    const el = document.getElementById('ad-name'); if (el) el.focus();
  }

  function createDocFromForm() {
    const n = getNurse(pendingDocNurse);
    if (!n) { closeModal(); return; }
    if (!canOperatePhase(n.currentStep)) { closeModal(); return; } // the other team's phase
    const name = fieldVal('ad-name');
    if (!name) {
      const err = document.getElementById('ad-error');
      if (err) { err.textContent = t('ad_error'); err.classList.remove('hidden'); }
      return;
    }
    const lang = (document.getElementById('ad-lang') || {}).value || 'ES';
    n.documents.push({ id: uid(), name: name, language: lang, uploadDate: null, validity: fieldVal('ad-validity') || null, status: 'missing' });
    pushLog(n, 'system', actorName(), t('log_doc_added', { x: name }));
    n.lastUpdate = new Date().toISOString().slice(0, 10);
    closeModal();
    commit();
  }

  function optValue(o) { return (o && typeof o === 'object') ? o.value : o; }
  function optLabel(o) { return (o && typeof o === 'object') ? (o.label != null ? o.label : t(o.labelKey)) : o; }
  function selectField(id, label, options, current) {
    const opts = ['<option value="">' + escapeHtml(t('select_none')) + '</option>']
      .concat(options.map((o) => '<option value="' + escapeHtml(optValue(o)) + '"' + (optValue(o) === current ? ' selected' : '') + '>' + escapeHtml(optLabel(o)) + '</option>')).join('');
    return '<div>' +
      '<label class="mb-1 block text-xs font-semibold text-slate-500">' + label + '</label>' +
      '<select id="' + id + '" class="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100">' + opts + '</select>' +
    '</div>';
  }
  // Multi-select "chips" over the clinical-skill catalogue (candidate profile & requests).
  function specChips(prefix, selected) {
    const sel = selected || [];
    const items = specsCatalog();
    if (!items.length) return '<p class="text-xs text-slate-400">—</p>';
    return '<div class="flex flex-wrap gap-1.5">' + items.map((name) =>
      '<label class="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">' +
        '<input type="checkbox" value="' + escapeHtml(name) + '"' + (sel.indexOf(name) >= 0 ? ' checked' : '') + ' class="' + prefix + '-chip h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-200" />' +
        escapeHtml(name) +
      '</label>').join('') + '</div>';
  }
  function chipValues(prefix) {
    return Array.from(document.querySelectorAll('input.' + prefix + '-chip:checked')).map((e) => e.value);
  }
  function agencyOptions() { return (state.settings.agencies || []).map((a) => a.name); }
  function employerOptions() { return (state.settings.employers || []).map((e) => e.name + (e.city ? ' · ' + e.city : '')); }
  function operatorOptions() {
    // Value stays the plain name (stored as hrReferent); the label shows the team.
    return (state.settings.operators || []).map((o) => o.team ? { value: o.name, label: o.name + ' · ' + teamFlag(o.team) + ' ' + teamLabel(o.team) } : o.name);
  }

  // ---------- Settings: manage base records (agencies, employers, operators) ----------
  const ENTITY_FIELDS = {
    agencies: [{ key: 'name', label: 'f_name', req: true }, { key: 'country', label: 'f_country' }, { key: 'contact', label: 'f_contact' }],
    employers: [{ key: 'name', label: 'f_name', req: true }, { key: 'city', label: 'f_city' }],
    operators: [{ key: 'name', label: 'f_name', req: true }, { key: 'role', label: 'f_role' }, { key: 'email', label: 'f_email' }, { key: 'team', label: 'f_team', type: 'select', options: [{ value: 'rd', labelKey: 'team_rd' }, { value: 'it', labelKey: 'team_it' }] }, { key: 'accessRole', label: 'access_role', type: 'select', options: [{ value: 'admin', labelKey: 'role_admin' }, { value: 'operator', labelKey: 'role_operator' }] }],
    docTypes: [{ key: 'name', label: 'f_name', req: true }, { key: 'language', label: 'ad_lang', type: 'select', options: ['ES', 'IT'] }],
    specialties: [{ key: 'name', label: 'f_name', req: true }],
  };
  const ENTITY_META = {
    agencies: { title: 'set_agencies', desc: 'set_agencies_desc', icon: 'handshake', add: 'new_agency' },
    employers: { title: 'set_employers', desc: 'set_employers_desc', icon: 'hospital', add: 'new_employer' },
    operators: { title: 'set_operators', desc: 'set_operators_desc', icon: 'user-cog', add: 'new_operator' },
    docTypes: { title: 'set_doctypes', desc: 'set_doctypes_desc', icon: 'file-text', add: 'new_doctype' },
    specialties: { title: 'set_specialties', desc: 'set_specialties_desc', icon: 'stethoscope', add: 'new_specialty' },
  };
  function fieldDisplay(f, value) {
    if (f.type === 'select' && Array.isArray(f.options)) {
      const o = f.options.find((x) => optValue(x) === value);
      if (o) return optLabel(o);
    }
    return value;
  }
  function entitySecondary(type, item) {
    return ENTITY_FIELDS[type].slice(1).map((f) => fieldDisplay(f, item[f.key])).filter(Boolean).join(' · ');
  }
  function settingsSection(type) {
    const meta = ENTITY_META[type];
    const items = state.settings[type] || [];
    const rows = items.length === 0
      ? '<div class="rounded-xl border border-dashed border-slate-200 p-5 text-center text-sm text-slate-400">' + t('entity_empty') + '</div>'
      : items.map((it) =>
          '<div class="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">' +
            '<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-500"><i data-lucide="' + meta.icon + '" class="h-4 w-4"></i></span>' +
            '<div class="min-w-0 flex-1"><p class="truncate text-sm font-semibold text-slate-800">' + escapeHtml(it.name || '—') + '</p>' +
              (entitySecondary(type, it) ? '<p class="truncate text-xs text-slate-400">' + escapeHtml(entitySecondary(type, it)) + '</p>' : '') + '</div>' +
            (type === 'operators' && fbEnabled && isAdmin() && (it.email || '').trim()
              ? '<button data-action="open-create-account" data-id="' + it.id + '" class="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 transition hover:bg-emerald-50" data-tooltip="' + escapeHtml(t('acct_title')) + '"><i data-lucide="key-round" class="h-3.5 w-3.5"></i></button>'
              : '') +
            '<button data-action="open-entity" data-type="' + type + '" data-id="' + it.id + '" class="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200 transition hover:bg-indigo-50">' + t('edit') + '</button>' +
            '<button data-action="delete-entity" data-type="' + type + '" data-id="' + it.id + '" class="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-50">' + t('del') + '</button>' +
          '</div>'
        ).join('');
    return '<section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">' +
      '<div class="mb-1 flex items-center gap-2"><i data-lucide="' + meta.icon + '" class="h-5 w-5 text-indigo-500"></i><h3 class="text-sm font-bold text-slate-900">' + t(meta.title) + '</h3>' +
        '<button data-action="open-entity" data-type="' + type + '" class="ml-auto inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-indigo-700"><i data-lucide="plus" class="h-3 w-3"></i>' + t('add') + '</button></div>' +
      '<p class="mb-3 text-xs text-slate-400">' + t(meta.desc) + '</p>' +
      '<div class="space-y-2">' + rows + '</div>' +
    '</section>';
  }
  function settingsView() {
    return '<main class="animate-fadeIn mx-auto max-w-[1400px] px-4 py-6 sm:px-5">' +
      '<div class="mb-6"><h2 class="text-xl font-extrabold text-slate-900">' + t('settings_title') + '</h2>' +
      '<p class="text-sm text-slate-500">' + t('settings_subtitle') + '</p></div>' +
      '<div class="grid grid-cols-1 gap-5 lg:grid-cols-3">' +
        settingsSection('agencies') + settingsSection('employers') + settingsSection('operators') +
      '</div>' +
      '<div class="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">' + settingsSection('docTypes') + settingsSection('specialties') + '</div>' +
      '<div class="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">' +
        '<div class="mb-1 flex items-center gap-2"><i data-lucide="archive" class="h-5 w-5 text-indigo-500"></i><h3 class="text-sm font-bold text-slate-900">' + t('backup_title') + '</h3></div>' +
        '<p class="mb-3 text-xs text-slate-500">' + t('backup_desc') + '</p>' +
        '<div class="flex flex-wrap gap-2">' +
          '<button data-action="backup-export" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"><i data-lucide="download" class="h-3.5 w-3.5"></i>' + t('backup_export') + '</button>' +
          '<button data-action="backup-import" class="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-rose-600 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-50"><i data-lucide="upload" class="h-3.5 w-3.5"></i>' + t('backup_import') + '</button>' +
        '</div>' +
      '</div>' +
    '</main>';
  }

  let pendingEntity = { type: null, id: null };
  function openEntityModal(type, id) {
    pendingEntity = { type: type, id: id || null };
    const meta = ENTITY_META[type];
    const item = id ? (state.settings[type] || []).find((x) => x.id === id) : null;
    const fields = ENTITY_FIELDS[type].map((f) => {
      if (f.type === 'select') return selectField('ent-' + f.key, t(f.label), f.options, item ? (item[f.key] || '') : '');
      return '<div>' + inputField('ent-' + f.key, t(f.label), '', f.req) + '</div>';
    }).join('');
    const title = id ? t('edit') : t(meta.add);
    const inner =
      '<div class="flex items-center justify-between border-b border-slate-100 p-5">' +
        '<div class="flex items-center gap-2"><i data-lucide="' + meta.icon + '" class="h-5 w-5 text-indigo-500"></i><h3 class="text-base font-bold text-slate-900">' + title + '</h3></div>' +
        '<button data-action="close-modal" class="text-slate-300 transition hover:text-slate-500"><i data-lucide="x" class="h-5 w-5"></i></button>' +
      '</div>' +
      '<div id="ent-error" class="mx-5 mt-4 hidden rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 ring-1 ring-inset ring-rose-200"></div>' +
      '<div class="grid gap-3 p-5">' + fields + '</div>' +
      '<div class="flex justify-end gap-2 border-t border-slate-100 p-5">' +
        '<button data-action="close-modal" class="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">' + t('cancel') + '</button>' +
        '<button data-action="save-entity" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"><i data-lucide="check" class="h-4 w-4"></i>' + t('save') + '</button>' +
      '</div>';
    modalShell(inner);
    ENTITY_FIELDS[type].forEach((f) => { const e = document.getElementById('ent-' + f.key); if (e && item) e.value = item[f.key] || ''; });
    const el = document.getElementById('ent-name'); if (el) el.focus();
  }
  function saveEntity() {
    if (!isAdmin()) return;
    const type = pendingEntity.type; if (!type) return;
    const obj = {};
    ENTITY_FIELDS[type].forEach((f) => { obj[f.key] = fieldVal('ent-' + f.key); });
    if (!obj.name) { formError('ent-error', t('name_required')); return; }
    // A typo'd operator email ends up in the Firestore access map: that operator
    // simply can't log in and nobody understands why. Validate it here.
    if (type === 'operators' && obj.email && !isValidEmail(obj.email)) { formError('ent-error', t('err_email_invalid')); return; }
    const list = state.settings[type];
    if (pendingEntity.id) {
      const ex = list.find((x) => x.id === pendingEntity.id);
      if (ex) {
        // Nurses and requests reference these records as plain-text labels (employers as
        // "name · city"): propagate a rename so no case is left pointing to a ghost.
        const oldLabel = entityRefLabel(type, ex), newLabel = entityRefLabel(type, obj);
        if (oldLabel && newLabel && oldLabel !== newLabel) propagateEntityRename(type, oldLabel, newLabel);
        Object.assign(ex, obj);
      }
    }
    else { list.push(Object.assign({ id: uid() }, obj)); }
    closeModal();
    commit();
  }
  // The exact string stored on nurses/requests for each entity (employers include the city,
  // matching employerOptions()).
  function entityRefLabel(type, obj) {
    if (!obj) return '';
    if (type === 'employers') return (obj.name || '') + (obj.city ? ' · ' + obj.city : '');
    return obj.name || '';
  }
  // Fields on nurses/requests that hold each entity type's label as a plain string.
  function entityNameRefs(type) {
    return type === 'operators' ? { nurse: ['hrReferent'], request: [] }
      : type === 'employers' ? { nurse: ['employer'], request: ['employer'] }
      : type === 'agencies' ? { nurse: ['partnerAgency'], request: [] }
      : null;
  }
  function propagateEntityRename(type, oldLabel, newLabel) {
    const refs = entityNameRefs(type); if (!refs) return;
    state.nurses.forEach((n) => refs.nurse.forEach((k) => { if (n[k] === oldLabel) n[k] = newLabel; }));
    (state.requests || []).forEach((r) => refs.request.forEach((k) => { if (r[k] === oldLabel) r[k] = newLabel; }));
  }
  function entityUsageCount(type, label) {
    const refs = entityNameRefs(type);
    if (refs) {
      let c = 0;
      state.nurses.forEach((n) => refs.nurse.forEach((k) => { if (n[k] === label) c++; }));
      (state.requests || []).forEach((r) => refs.request.forEach((k) => { if (r[k] === label) c++; }));
      return c;
    }
    if (type === 'specialties') return state.nurses.filter((n) => nurseSpecs(n).indexOf(label) >= 0).length;
    return 0;
  }
  function deleteEntity(type, id) {
    if (!isAdmin()) return;
    const list = state.settings[type] || [];
    const it = list.find((x) => x.id === id); if (!it) return;
    const used = entityUsageCount(type, entityRefLabel(type, it));
    const msg = used > 0 ? t('confirm_delete_used', { x: it.name || '', n: used }) : t('confirm_delete', { x: it.name || '' });
    if (!confirm(msg)) return;
    state.settings[type] = list.filter((x) => x.id !== id);
    commit();
  }

  // ---------- In-app account creation (admin only, cloud mode) ----------
  // Creates the Firebase Auth user for an HR operator without touching the
  // admin's own session: a throwaway secondary app instance does the signup.
  // Authorization then comes from the access map synced in remoteSync().
  let pendingAccountOpId = null;
  function openCreateAccountModal(operatorId) {
    if (!(fbEnabled && isAdmin())) return;
    const op = (state.settings.operators || []).find((o) => o.id === operatorId);
    if (!op) return;
    if (!(op.email || '').trim()) { alert(t('acct_no_email')); return; }
    pendingAccountOpId = operatorId;
    const inner =
      '<div class="flex items-center justify-between border-b border-slate-100 p-5">' +
        '<div class="flex items-center gap-2"><i data-lucide="key-round" class="h-5 w-5 text-indigo-500"></i><h3 class="text-base font-bold text-slate-900">' + t('acct_title') + '</h3></div>' +
        '<button data-action="close-modal" class="text-slate-300 transition hover:text-slate-500"><i data-lucide="x" class="h-5 w-5"></i></button>' +
      '</div>' +
      '<div id="ac-msg" class="mx-5 mt-4 hidden rounded-xl px-3 py-2 text-xs font-medium ring-1 ring-inset"></div>' +
      '<div class="space-y-3 p-5">' +
        '<div class="rounded-xl bg-slate-50 p-3 text-sm"><p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">' + t('login_email') + '</p>' +
          '<p class="font-semibold text-slate-800">' + escapeHtml(op.email) + '</p>' +
          '<p class="text-xs text-slate-500">' + escapeHtml(op.name || '') + '</p></div>' +
        inputField('ac-pass', t('acct_pwd'), '••••••••', true, 'password') +
        '<p class="text-xs leading-relaxed text-slate-500">' + t('acct_hint') + '</p>' +
      '</div>' +
      '<div class="flex justify-end gap-2 border-t border-slate-100 p-5">' +
        '<button data-action="close-modal" class="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">' + t('cancel') + '</button>' +
        '<button data-action="do-create-account" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"><i data-lucide="key-round" class="h-4 w-4"></i>' + t('acct_create') + '</button>' +
      '</div>';
    modalShell(inner);
    const el = document.getElementById('ac-pass'); if (el) el.focus();
  }
  async function createOperatorAccount() {
    if (!(fbEnabled && isAdmin())) return;
    const op = (state.settings.operators || []).find((o) => o.id === pendingAccountOpId);
    if (!op) { closeModal(); return; }
    const pass = fieldVal('ac-pass');
    const msg = document.getElementById('ac-msg');
    const show = (text, ok) => {
      if (!msg) return;
      msg.textContent = text;
      msg.className = 'mx-5 mt-4 rounded-xl px-3 py-2 text-xs font-medium ring-1 ring-inset ' + (ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-600 ring-rose-200');
    };
    if (!pass || pass.length < 6) { show(t('auth_weak_password'), false); return; }
    let app2 = null;
    try {
      app2 = firebase.initializeApp(FIREBASE_CONFIG, 'acct_' + uid());
      await app2.auth().createUserWithEmailAndPassword(op.email.trim(), pass);
      await app2.auth().signOut();
      show(t('acct_created', { e: op.email.trim() }), true);
      const pf = document.getElementById('ac-pass'); if (pf) pf.value = '';
    } catch (err) {
      if (err && err.code === 'auth/email-already-in-use') show(t('acct_exists'), true);
      else show(translateAuthError(err), false);
    } finally {
      if (app2) { try { await app2.delete(); } catch (e) { /* ignore */ } }
    }
  }
  async function forgotPassword() {
    if (!auth) return;
    const email = ((document.getElementById('auth-email') || {}).value || '').trim();
    if (!email) { showAuthError(t('auth_need_email')); return; }
    try { await auth.sendPasswordResetEmail(email); alert(t('prof_reset_sent', { e: email })); }
    catch (err) { showAuthError(translateAuthError(err)); }
  }

  // ------------------------------------------------------------------ MATCHING (Team Italia)
  function requestStatusMeta(st) {
    return st === 'matched' ? { cls: 'bg-emerald-100 text-emerald-700 ring-emerald-200', key: 'mt_status_matched' }
      : st === 'closed' ? { cls: 'bg-slate-100 text-slate-500 ring-slate-200', key: 'mt_status_closed' }
      : { cls: 'bg-amber-100 text-amber-700 ring-amber-200', key: 'mt_status_open' };
  }
  function skillChipsRO(list, cls) {
    if (!list || !list.length) return '<span class="text-xs text-slate-300">—</span>';
    return list.map((s) => '<span class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ' + cls + '">' + escapeHtml(s) + '</span>').join(' ');
  }
  function requestCard(r) {
    const meta = requestStatusMeta(r.status);
    const canIt = canManageMatching();
    const btn = (action, label, icon, tone) =>
      '<button data-action="' + action + '" data-id="' + r.id + '" class="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 ring-inset transition ' + tone + '"><i data-lucide="' + icon + '" class="h-3.5 w-3.5"></i>' + label + '</button>';
    let actions = '';
    if (canIt) {
      if (r.status === 'open') {
        actions = btn('find-candidates', t('mt_find'), 'search', 'bg-indigo-600 text-white ring-indigo-600 hover:bg-indigo-700') +
          btn('open-request', t('edit'), 'pencil', 'text-slate-500 ring-slate-200 hover:bg-slate-50') +
          btn('delete-request', t('del'), 'trash-2', 'text-rose-600 ring-rose-200 hover:bg-rose-50');
      } else if (r.status === 'matched') {
        actions = btn('close-request', t('mt_close'), 'check-circle-2', 'text-emerald-700 ring-emerald-200 hover:bg-emerald-50');
      } else {
        actions = btn('reopen-request', t('mt_reopen'), 'rotate-ccw', 'text-slate-500 ring-slate-200 hover:bg-slate-50') +
          btn('delete-request', t('del'), 'trash-2', 'text-rose-600 ring-rose-200 hover:bg-rose-50');
      }
    }
    // One chip per matched nurse; the ✕ removes that single assignment.
    const matched = r.matched || [];
    const matchedLine = matched.length
      ? '<div class="mt-2 flex flex-wrap items-center gap-1.5">' +
          '<span class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">' + t('mt_matched_to') + ':</span>' +
          matched.map((m) =>
            '<span class="inline-flex items-center gap-1 rounded-xl bg-emerald-50 py-1 pl-2.5 pr-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">' +
              '<button data-action="open-nurse" data-id="' + m.id + '" class="inline-flex items-center gap-1.5 hover:underline"><i data-lucide="user-check" class="h-3.5 w-3.5"></i>' + escapeHtml(m.name) + (m.at ? ' · ' + formatDate(m.at) : '') + '</button>' +
              (canIt && r.status !== 'closed' ? '<button data-action="unassign-match" data-id="' + r.id + '" data-nurse="' + m.id + '" class="rounded-full p-0.5 text-emerald-500 transition hover:bg-emerald-100 hover:text-rose-600" data-tooltip="' + escapeHtml(t('mt_unassign')) + '"><i data-lucide="x" class="h-3 w-3"></i></button>' : '') +
            '</span>').join('') +
        '</div>'
      : '';
    const qtyBadge = '<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ' + (requestFull(r) ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200') + '"><i data-lucide="users" class="h-3 w-3"></i>' + t('mt_qty_badge', { a: matched.length, b: r.quantity || 1 }) + '</span>';
    return '<div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm' + (r.status === 'closed' ? ' opacity-70' : '') + '">' +
      '<div class="flex flex-wrap items-start justify-between gap-2">' +
        '<div class="min-w-0">' +
          '<p class="text-sm font-bold text-slate-900">' + escapeHtml(r.employer) + '</p>' +
          '<p class="text-xs text-slate-500"><i data-lucide="stethoscope" class="mr-1 inline h-3.5 w-3.5 align-[-2px]"></i>' + escapeHtml(r.department || '—') + ' · <i data-lucide="users" class="mx-1 inline h-3.5 w-3.5 align-[-2px]"></i>' + t('mt_qty_line', { n: r.quantity || 1 }) + (r.shift ? ' · <i data-lucide="clock" class="mx-1 inline h-3.5 w-3.5 align-[-2px]"></i>' + escapeHtml(r.shift) : '') + '</p>' +
        '</div>' +
        '<div class="flex items-center gap-1.5">' + qtyBadge +
          '<span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ' + meta.cls + '">' + t(meta.key) + '</span>' +
        '</div>' +
      '</div>' +
      '<div class="mt-3 space-y-1.5 text-xs">' +
        '<p class="font-semibold uppercase tracking-wide text-slate-400">' + t('mt_required') + '</p>' +
        '<div class="flex flex-wrap gap-1">' + skillChipsRO(r.requiredSkills, 'bg-indigo-50 text-indigo-700 ring-indigo-200') + '</div>' +
        '<p class="pt-1 font-semibold uppercase tracking-wide text-slate-400">' + t('mt_preferred') + '</p>' +
        '<div class="flex flex-wrap gap-1">' + skillChipsRO(r.preferredSkills, 'bg-slate-100 text-slate-600 ring-slate-200') + '</div>' +
      '</div>' +
      (r.notes ? '<p class="mt-3 text-xs text-slate-500">' + escapeHtml(r.notes) + '</p>' : '') +
      matchedLine +
      '<div class="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">' + actions +
        '<span class="ml-auto text-[11px] text-slate-400">' + t('mt_created', { d: formatDate(r.createdAt) }) + '</span>' +
      '</div>' +
    '</div>';
  }
  function matchingView() {
    const reqs = state.requests || [];
    const canIt = canManageMatching();
    const cards = reqs.length === 0
      ? '<div class="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400 lg:col-span-2">' + t('mt_none') + '</div>'
      : reqs.slice().sort((a, b) => (a.status === 'open' ? 0 : a.status === 'matched' ? 1 : 2) - (b.status === 'open' ? 0 : b.status === 'matched' ? 1 : 2)).map(requestCard).join('');
    return '<main class="animate-fadeIn mx-auto max-w-[1400px] px-4 py-6 sm:px-5">' +
      '<div class="mb-6 flex flex-wrap items-end justify-between gap-3">' +
        '<div><h2 class="text-xl font-extrabold text-slate-900">' + t('mt_title') + '</h2>' +
        '<p class="max-w-2xl text-sm text-slate-500">' + t('mt_subtitle') + '</p></div>' +
        (canIt
          ? '<button data-action="open-request" class="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-700"><i data-lucide="plus" class="h-4 w-4"></i>' + t('mt_new') + '</button>'
          : '<span class="inline-flex items-center gap-1.5 rounded-xl bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200"><i data-lucide="users" class="h-4 w-4"></i>' + t('mt_ro_hint') + '</span>') +
      '</div>' +
      '<div data-tour="matching" class="grid grid-cols-1 gap-5 lg:grid-cols-2">' + cards + '</div>' +
    '</main>';
  }

  // Request editor (create / edit).
  let pendingRequestId = null;
  function openRequestModal(id) {
    if (!canManageMatching()) return;
    pendingRequestId = id || null;
    const r = id ? getRequest(id) : null;
    const inner =
      '<div class="flex items-center justify-between border-b border-slate-100 p-5">' +
        '<div class="flex items-center gap-2"><i data-lucide="target" class="h-5 w-5 text-indigo-500"></i><h3 class="text-base font-bold text-slate-900">' + (r ? t('edit') : t('mt_new')) + '</h3></div>' +
        '<button data-action="close-modal" class="text-slate-300 transition hover:text-slate-500"><i data-lucide="x" class="h-5 w-5"></i></button>' +
      '</div>' +
      '<div id="rq-error" class="mx-5 mt-4 hidden rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 ring-1 ring-inset ring-rose-200"></div>' +
      '<div class="grid gap-3 p-5">' +
        selectField('rq-employer', t('mt_facility') + ' <span class="text-rose-500">*</span>', employerOptions(), r ? r.employer : '') +
        inputField('rq-department', t('mt_department'), 'Terapia Intensiva', true) +
        inputField('rq-qty', t('mt_quantity'), '1', false, 'number') +
        inputField('rq-shift', t('mt_shift'), 'Turni H24 (mattina/pomeriggio/notte)') +
        '<div><label class="mb-1 block text-xs font-semibold text-slate-500">' + t('mt_required') + '</label>' + specChips('rq-req', r ? r.requiredSkills : []) + '</div>' +
        '<div><label class="mb-1 block text-xs font-semibold text-slate-500">' + t('mt_preferred') + '</label>' + specChips('rq-pref', r ? r.preferredSkills : []) + '</div>' +
        inputField('rq-notes', t('mt_notes'), '') +
      '</div>' +
      '<div class="flex justify-end gap-2 border-t border-slate-100 p-5">' +
        '<button data-action="close-modal" class="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">' + t('cancel') + '</button>' +
        '<button data-action="save-request" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"><i data-lucide="check" class="h-4 w-4"></i>' + t('save') + '</button>' +
      '</div>';
    modalShell(inner, true);
    {
      const qtyEl = document.getElementById('rq-qty');
      if (qtyEl) { qtyEl.min = '1'; qtyEl.value = r ? String(r.quantity || 1) : '1'; }
    }
    if (r) {
      const set = (fid, v) => { const el = document.getElementById(fid); if (el) el.value = v || ''; };
      set('rq-department', r.department); set('rq-shift', r.shift); set('rq-notes', r.notes);
    }
    const el = document.getElementById('rq-department'); if (el) el.focus();
  }
  function saveRequestFromForm() {
    if (!canManageMatching()) return;
    const employer = fieldVal('rq-employer'), department = fieldVal('rq-department');
    if (!employer || !department) {
      const err = document.getElementById('rq-error');
      if (err) { err.textContent = t('mt_error_required'); err.classList.remove('hidden'); }
      return;
    }
    const qty = Math.max(1, parseInt(fieldVal('rq-qty'), 10) || 1);
    const data = {
      employer: employer, department: department, quantity: qty,
      shift: fieldVal('rq-shift'), notes: fieldVal('rq-notes'),
      requiredSkills: chipValues('rq-req'), preferredSkills: chipValues('rq-pref'),
    };
    let toast = null;
    if (pendingRequestId) {
      const r = getRequest(pendingRequestId);
      if (r) {
        const wasFull = requestFull(r);
        Object.assign(r, data);
        // Changing the headcount can complete or reopen the request.
        if (r.status !== 'closed') r.status = requestFull(r) ? 'matched' : 'open';
        // Lowering the headcount to meet the matched count also "fills" it.
        if (!wasFull && requestFull(r) && r.status === 'matched') toast = { msg: t('toast_req_filled', { s: requestLabel(r), n: r.quantity || 1 }), tone: 'ok' };
      }
    } else {
      const nr = Object.assign({
        id: uid(), status: 'open', createdAt: new Date().toISOString().slice(0, 10),
        matched: [],
      }, data);
      state.requests.push(nr);
      toast = { msg: t('toast_req_created', { s: requestLabel(nr), n: nr.quantity || 1 }), tone: 'info' };
    }
    pendingRequestId = null;
    closeModal();
    commit();
    if (toast) showToast(toast.msg, toast.tone, 5000);
  }

  // Candidate shortlist for a request: interrogazione → identificazione → validazione.
  function openMatchCandidates(reqId) {
    const r = getRequest(reqId); if (!r) return;
    const canIt = canManageMatching();
    const list = matchCandidates(r);
    const rows = list.length === 0
      ? '<div class="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">' + t('mt_no_candidates') + '</div>'
      : list.map((it) => {
          const n = it.n, m = it.m;
          const badge = (ok, okKey, koKey, vars) =>
            '<span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ' + (ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-700 ring-amber-200') + '">' +
            '<i data-lucide="' + (ok ? 'check' : 'alert-triangle') + '" class="h-3 w-3"></i>' + t(ok ? okKey : koKey, vars) + '</span>';
          const specs = nurseSpecs(n);
          const specHtml = specs.length
            ? specs.map((s) => {
                const isReq = (r.requiredSkills || []).indexOf(s) >= 0;
                const isPref = (r.preferredSkills || []).indexOf(s) >= 0;
                return '<span class="inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ' + (isReq ? 'bg-indigo-50 text-indigo-700 ring-indigo-300' : isPref ? 'bg-sky-50 text-sky-700 ring-sky-200' : 'bg-slate-100 text-slate-500 ring-slate-200') + '">' + escapeHtml(s) + '</span>';
              }).join(' ')
            : '<span class="text-[11px] text-slate-400">' + t('mt_no_specs') + '</span>';
          return '<div class="rounded-xl border p-4 ' + (m.full ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-white') + '">' +
            '<div class="flex flex-wrap items-start justify-between gap-2">' +
              '<div class="min-w-0">' +
                '<p class="text-sm font-bold text-slate-900">' + escapeHtml(n.name) + '</p>' +
                '<p class="text-[11px] text-slate-500">' + t('step_x', { n: n.currentStep }) + ' · ' + escapeHtml(stepName(n.currentStep)) + ' · ' + escapeHtml(n.languageLevel.split(' ')[0]) + '</p>' +
              '</div>' +
              '<span class="inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ring-inset ' + (m.full ? 'bg-emerald-100 text-emerald-700 ring-emerald-200' : 'bg-amber-100 text-amber-700 ring-amber-200') + '">' + t(m.full ? 'mt_full_match' : 'mt_partial_match') + '</span>' +
            '</div>' +
            '<div class="mt-2 flex flex-wrap gap-1">' + specHtml + '</div>' +
            '<div class="mt-2 flex flex-wrap gap-1.5">' +
              badge(m.reqHit === m.reqTot, 'mt_req_ok', 'mt_req_ok', { a: m.reqHit, b: m.reqTot }) +
              (m.prefTot ? badge(m.prefHit > 0, 'mt_pref_ok', 'mt_pref_ok', { a: m.prefHit, b: m.prefTot }) : '') +
              badge(m.docsOk, 'mt_docs_ok', 'mt_docs_ko') +
              badge(m.dossierOk, 'mt_dossier_ok', 'mt_dossier_ko') +
            '</div>' +
            '<div class="mt-3 flex justify-end gap-1.5">' +
              '<button data-action="open-nurse" data-id="' + n.id + '" class="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">' + t('doc_view') + '</button>' +
              (canIt && r.status === 'open' ? '<button data-action="assign-match" data-req="' + r.id + '" data-nurse="' + n.id + '" class="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"><i data-lucide="link" class="h-3 w-3"></i>' + t('mt_assign') + '</button>' : '') +
            '</div>' +
          '</div>';
        }).join('');
    const inner =
      '<div class="flex items-center justify-between border-b border-slate-100 p-5">' +
        '<div class="flex items-center gap-2"><i data-lucide="search" class="h-5 w-5 text-indigo-500"></i><h3 class="text-base font-bold text-slate-900">' + t('mt_candidates_title', { x: escapeHtml(requestLabel(r)) }) + '</h3></div>' +
        '<button data-action="close-modal" class="text-slate-300 transition hover:text-slate-500"><i data-lucide="x" class="h-5 w-5"></i></button>' +
      '</div>' +
      '<div class="space-y-2.5 p-5">' + rows + '</div>';
    modalShell(inner, true);
  }

  // ---------- Operator profile ----------
  const LOCAL_OPERATOR_KEY = 'dhl.operator.name';
  function localOperatorName() { try { return localStorage.getItem(LOCAL_OPERATOR_KEY) || ''; } catch (e) { return ''; } }
  function providerLabel() {
    if (!currentUser || !currentUser.providerData || !currentUser.providerData.length) return '—';
    const id = currentUser.providerData[0].providerId;
    return id === 'password' ? t('provider_password') : (id === 'google.com' ? 'Google' : id);
  }
  function isPasswordUser() {
    return !!(currentUser && currentUser.providerData && currentUser.providerData.some((p) => p.providerId === 'password'));
  }
  function fmtMeta(ts) { if (!ts) return '—'; const d = new Date(ts); return isNaN(d) ? '—' : d.toLocaleString(localeTag(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function profileMsg(text, kind) {
    const el = document.getElementById('pf-msg'); if (!el) return;
    el.textContent = text;
    el.className = 'rounded-xl px-3 py-2 text-xs font-medium ' + (kind === 'ok'
      ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
      : 'bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-200');
  }
  function infoRow(label, value) {
    return '<div class="rounded-xl border border-slate-100 bg-slate-50/60 p-3">' +
      '<p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">' + label + '</p>' +
      '<p class="mt-0.5 break-words text-sm font-medium text-slate-700">' + escapeHtml(value) + '</p></div>';
  }

  function openProfileModal() {
    const cloud = fbEnabled && currentUser;
    const label = cloud ? (currentUser.displayName || currentUser.email || t('user')) : (localOperatorName() || t('operator'));
    const initial = (label[0] || '?').toUpperCase();
    const head =
      '<div class="flex items-center justify-between border-b border-slate-100 p-5">' +
        '<div class="flex items-center gap-2"><i data-lucide="user-cog" class="h-5 w-5 text-indigo-500"></i><h3 class="text-base font-bold text-slate-900">' + t('prof_title') + '</h3></div>' +
        '<button data-action="close-modal" class="text-slate-300 transition hover:text-slate-500"><i data-lucide="x" class="h-5 w-5"></i></button>' +
      '</div>';
    const avatar =
      '<div class="flex items-center gap-3">' +
        '<span class="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-lg font-bold text-white">' + escapeHtml(initial) + '</span>' +
        '<div class="min-w-0"><p class="truncate text-sm font-bold text-slate-900">' + escapeHtml(label) + '</p>' +
        '<p class="truncate text-xs text-slate-500">' + escapeHtml(cloud ? (currentUser.email || '—') : t('prof_no_account')) + '</p></div>' +
      '</div>';

    let body, footer;
    if (cloud) {
      body =
        avatar +
        '<div id="pf-msg" class="hidden"></div>' +
        '<div>' + inputField('pf-name', t('prof_name'), 'Giulia Ferraro') + '</div>' +
        '<div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">' +
          infoRow(t('prof_method'), providerLabel()) +
          infoRow(t('prof_uid'), currentUser.uid ? currentUser.uid.slice(0, 10) + '…' : '—') +
          infoRow(t('prof_created'), fmtMeta(currentUser.metadata && currentUser.metadata.creationTime)) +
          infoRow(t('prof_last'), fmtMeta(currentUser.metadata && currentUser.metadata.lastSignInTime)) +
          infoRow(t('prof_role'), t('role_' + currentRole())) +
        '</div>' +
        (isPasswordUser()
          ? '<button data-action="reset-password" class="flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200 transition hover:bg-indigo-50"><i data-lucide="key-round" class="h-4 w-4"></i>' + t('prof_reset') + '</button>'
          : '<p class="text-xs text-slate-400">' + t('prof_provider_note', { p: providerLabel() }) + '</p>');
      footer =
        '<button data-action="logout" class="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-rose-600 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-50"><i data-lucide="log-out" class="h-4 w-4"></i>' + t('logout') + '</button>' +
        '<button data-action="save-profile" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"><i data-lucide="check" class="h-4 w-4"></i>' + t('prof_save') + '</button>';
    } else {
      body =
        avatar +
        '<div class="rounded-xl border-l-4 border-amber-400 bg-amber-50 p-3 text-xs text-amber-800">' + t('prof_local_warn') + '</div>' +
        '<div id="pf-msg" class="hidden"></div>' +
        '<div><p class="mb-1 text-xs font-semibold text-slate-500">' + t('access_role') + '</p>' +
          '<div class="flex gap-2">' +
            ['admin', 'operator'].map((r) => '<button data-action="set-demo-role" data-role="' + r + '" class="flex-1 rounded-xl px-3 py-2 text-xs font-semibold ring-1 ring-inset transition ' + (currentRole() === r ? 'bg-indigo-600 text-white ring-indigo-600' : 'text-slate-600 ring-slate-200 hover:bg-slate-50') + '">' + t('role_' + r) + '</button>').join('') +
          '</div>' +
          '<p class="mt-1 text-[11px] text-slate-400">' + t('demo_role_hint') + '</p></div>' +
        '<div>' + inputField('pf-name', t('prof_name_local'), 'Mario Rossi') + '</div>';
      footer =
        '<button data-action="close-modal" class="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">' + t('close') + '</button>' +
        '<button data-action="save-profile" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"><i data-lucide="check" class="h-4 w-4"></i>' + t('prof_save') + '</button>';
    }
    modalShell(head + '<div class="space-y-4 p-5">' + body + '</div>' + '<div class="flex justify-between gap-2 border-t border-slate-100 p-5">' + footer + '</div>');
    const el = document.getElementById('pf-name');
    if (el) { el.value = cloud ? (currentUser.displayName || '') : localOperatorName(); el.focus(); }
  }

  function saveProfile() {
    const name = fieldVal('pf-name');
    if (fbEnabled && currentUser) {
      currentUser.updateProfile({ displayName: name })
        .then(() => { profileMsg(t('prof_saved_cloud'), 'ok'); render(); })
        .catch((e) => profileMsg(translateAuthError(e), 'err'));
    } else {
      try { localStorage.setItem(LOCAL_OPERATOR_KEY, name); } catch (e) { /* ignore */ }
      profileMsg(t('prof_saved_local'), 'ok');
    }
  }
  function sendPasswordReset() {
    if (!auth || !currentUser || !currentUser.email) return;
    auth.sendPasswordResetEmail(currentUser.email)
      .then(() => profileMsg(t('prof_reset_sent', { e: currentUser.email }), 'ok'))
      .catch((e) => profileMsg(translateAuthError(e), 'err'));
  }

  // ---------- Fullscreen document overlays (operator manual + regulatory guide) ----------
  // Scroll-spy shared by both overlays: highlight the current section in the TOC.
  function attachTocSpy(o) {
    const links = Array.prototype.slice.call(o.querySelectorAll('.toc-link'));
    const map = {};
    links.forEach((l) => { const id = l.getAttribute('href').slice(1); const el = o.querySelector('#' + id); if (el) map[id] = l; });
    try {
      const obs = new IntersectionObserver((entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) { links.forEach((l) => l.classList.remove('active')); if (map[en.target.id]) map[en.target.id].classList.add('active'); }
        });
      }, { root: o, rootMargin: '-72px 0px -70% 0px', threshold: 0 });
      Object.keys(map).forEach((id) => obs.observe(o.querySelector('#' + id)));
    } catch (e) { /* IntersectionObserver opzionale */ }
  }
  // Only one document overlay at a time (the print CSS relies on this).
  function openDocOverlay(id, html) {
    closeManual(); closeGuide(); closePrivacyForm();
    const o = document.createElement('div');
    o.id = id;
    o.className = 'fixed inset-0 z-[80] overflow-y-auto bg-slate-100';
    o.innerHTML = html;
    document.body.appendChild(o);
    document.documentElement.classList.add('overflow-hidden');
    lucide.createIcons();
    attachTocSpy(o);
  }
  function closeDocOverlay(id) {
    const o = document.getElementById(id);
    if (o) o.remove();
    document.documentElement.classList.remove('overflow-hidden');
  }

  // ---------- In-app operator manual (self-contained, no external file) ----------
  function openManual() { openDocOverlay('manual-overlay', manualHtml()); }
  function closeManual() { closeDocOverlay('manual-overlay'); }

  // ---------- Regulatory guide (content in src/guide-content.js) ----------
  function openGuide() { openDocOverlay('guide-overlay', guideHtml()); }
  function closeGuide() { closeDocOverlay('guide-overlay'); }

  // ---------- Printable privacy-consent form (bilingual IT/ES, prefilled) ----------
  function openPrivacyForm(nurseId) {
    const n = getNurse(nurseId); if (!n) return;
    openDocOverlay('privacy-overlay', privacyFormHtml(n));
  }
  function closePrivacyForm() { closeDocOverlay('privacy-overlay'); }

  // ---------- Printable candidate sheet (browser print → paper or "save as PDF") ----------
  function openNurseSheet(nurseId) {
    const n = getNurse(nurseId); if (!n) return;
    openDocOverlay('sheet-overlay', nurseSheetHtml(n));
  }
  function closeNurseSheet() { closeDocOverlay('sheet-overlay'); }
  function nurseSheetHtml(n) {
    const row = (label, val) => '<tr class="border-b border-slate-100 last:border-0"><td class="w-44 py-1.5 pr-3 align-top text-[11px] font-semibold uppercase tracking-wide text-slate-400">' + label + '</td><td class="py-1.5 text-[13px] text-slate-800">' + (val ? escapeHtml(val) : '—') + '</td></tr>';
    const sec = (title, inner) => '<div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm print:border-0 print:p-0 print:shadow-none"><h3 class="mb-2 text-sm font-bold text-slate-900">' + title + '</h3>' + inner + '</div>';
    const tbl = (inner) => '<table class="w-full">' + inner + '</table>';
    const fase = n.currentStep >= DONE_STEP ? t('state_done') : (Math.min(n.currentStep, LAST_STEP) + '/9 — ' + stepName(n.currentStep));
    const docRows = (n.documents || []).map((d) =>
      '<tr class="border-b border-slate-100 last:border-0"><td class="py-1.5 pr-3 text-[13px] text-slate-800">' + escapeHtml(d.name) +
        (d.optional ? ' <span class="text-[11px] text-slate-400">(' + escapeHtml(t('doc_optional')) + ')</span>' : '') + '</td>' +
      '<td class="w-28 py-1.5 pr-3 text-[12px] font-semibold text-slate-600">' + docStatusLabel(d.status) + '</td>' +
      '<td class="w-28 py-1.5 text-[12px] text-slate-500">' + (d.validity ? formatDate(d.validity) : '—') + '</td></tr>').join('');
    const logRows = (n.logs || []).slice(0, 10).map((l) =>
      '<tr class="border-b border-slate-100 last:border-0"><td class="w-36 py-1.5 pr-3 align-top text-[11px] text-slate-400">' + formatDateTime(l.at) + '</td>' +
      '<td class="w-36 py-1.5 pr-3 align-top text-[12px] font-medium text-slate-600">' + escapeHtml(l.author || '') + '</td>' +
      '<td class="py-1.5 text-[12px] text-slate-700">' + escapeHtml(l.text || '') + '</td></tr>').join('');
    return '' +
    '<div class="no-print sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">' +
      '<div class="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-5">' +
        '<div class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white shadow"><i data-lucide="id-card" class="h-4 w-4"></i></div>' +
        '<div><h1 class="text-sm font-extrabold leading-tight text-slate-900">' + t('sheet_title') + '</h1><p class="text-xs text-slate-500">' + escapeHtml(n.name) + '</p></div>' +
        '<div class="ml-auto flex items-center gap-2">' +
          '<button onclick="window.print()" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"><i data-lucide="printer" class="h-3.5 w-3.5"></i>' + t('manual_btn_print') + '</button>' +
          '<button data-action="close-sheet" class="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"><i data-lucide="x" class="h-3.5 w-3.5"></i>' + t('manual_close') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="mx-auto max-w-3xl space-y-4 px-4 py-8 sm:px-5">' +
      '<div class="text-center"><h2 class="text-lg font-extrabold text-slate-900">DHL Nurses — ' + t('sheet_title') + '</h2>' +
        '<p class="text-xs text-slate-400">' + escapeHtml(formatDate(new Date().toISOString().slice(0, 10))) + '</p></div>' +
      sec(t('tab_dati'), tbl(
        row(t('f_name'), n.name) + row(t('f_birth'), [n.birthDate ? formatDate(n.birthDate) : '', n.birthPlace || ''].filter(Boolean).join(' · ')) +
        row(t('f_nationality'), n.nationality) + row(t('f_marital'), n.maritalStatus ? t('ms_' + n.maritalStatus) : '') +
        row(t('f_address'), n.address) + row(t('f_passport'), n.passport) + row(t('f_passport_exp'), n.passportExpiry ? formatDate(n.passportExpiry) : '') +
        row(t('f_cedula'), n.cedula) + row(t('f_cedula_exp'), n.cedulaExpiry ? formatDate(n.cedulaExpiry) : ''))) +
      sec(t('tab_contatti'), tbl(
        row(t('f_phone'), n.phone) + row(t('f_email'), n.email) + row(t('f_agency'), n.partnerAgency) +
        row(t('f_employer'), n.employer) + row(t('f_hr'), n.hrReferent))) +
      sec(t('tab_competenze'), tbl(
        row(t('f_role'), n.profRole) + row(t('f_sector'), n.profSector) + row(t('f_experience'), n.profExperience) +
        row(t('f_lang'), n.languageLevel) + row(t('f_specs'), nurseSpecs(n).join(' · ')))) +
      sec(t('f_status'), tbl(
        row(t('sheet_phase'), fase) + row(t('f_privacy'), n.privacyConsent ? t('privacy_given', { d: n.privacyConsentDate ? formatDate(n.privacyConsentDate) : '—' }) : t('privacy_none')) +
        row(t('f_last'), n.lastUpdate ? formatDate(n.lastUpdate) : ''))) +
      sec(t('docs_title'), tbl('<thead><tr class="border-b border-slate-200 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400"><th class="pb-1 pr-3">' + t('th_document') + '</th><th class="pb-1 pr-3">' + t('th_status') + '</th><th class="pb-1">' + t('sheet_validity') + '</th></tr></thead><tbody>' + docRows + '</tbody>')) +
      sec(t('log_title'), tbl('<tbody>' + (logRows || '') + '</tbody>')) +
    '</div>';
  }

  // ---------- Full JSON backup / restore (admin) ----------
  function exportBackup() {
    if (!isAdmin()) return;
    const payload = { app: 'dhl-nurses-backup', version: 1, exportedAt: new Date().toISOString(), nurses: state.nurses, requests: state.requests || [], settings: state.settings };
    downloadFile('dhl-nurses-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(payload), 'application/json');
  }
  function triggerImportBackup() {
    if (!isAdmin()) return;
    let input = document.getElementById('backup-file-input');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'backup-file-input';
      input.style.display = 'none';
      input.accept = '.json,application/json';
      input.addEventListener('change', onBackupFileChosen);
      document.body.appendChild(input);
    }
    input.value = '';
    input.click();
  }
  function onBackupFileChosen(e) {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      let data = null;
      try { data = JSON.parse(r.result); } catch (err) { alert(t('backup_invalid')); return; }
      if (!data || data.app !== 'dhl-nurses-backup' || !Array.isArray(data.nurses)) { alert(t('backup_invalid')); return; }
      if (!confirm(t('backup_import_confirm', { d: (data.exportedAt || '').slice(0, 10), n: data.nurses.length }))) return;
      state.nurses = data.nurses;
      state.requests = Array.isArray(data.requests) ? data.requests : [];
      if (data.settings) state.settings = data.settings;
      normalizeState(state);
      state.selectedNurseId = state.nurses[0] ? state.nurses[0].id : null;
      showToast(t('backup_done'), 'ok');
      commit();
    };
    r.readAsText(file);
  }

  function privacyFormHtml(n) {
    const dot = '<span class="text-slate-400">____________________________</span>';
    const v = (x) => x ? escapeHtml(x) : dot;
    const birth = [n.birthDate ? formatDate(n.birthDate) : '', n.birthPlace || ''].filter(Boolean).join(' · ');
    // Each clause: Italian text + Spanish translation underneath (the form itself is not
    // driven by the UI language: it is a legal document for an Italian data controller
    // and a Spanish-speaking candidate).
    const clause = (it, es) =>
      '<div class="space-y-0.5"><p class="text-[13px] leading-relaxed text-slate-800">' + it + '</p>' +
      '<p class="text-[12px] italic leading-relaxed text-slate-500">' + es + '</p></div>';
    const box = '<span class="mr-1.5 inline-block h-3.5 w-3.5 translate-y-0.5 rounded-sm border-2 border-slate-500"></span>';
    return '' +
    '<div class="no-print sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">' +
      '<div class="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-5">' +
        '<div class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white shadow"><i data-lucide="shield-check" class="h-4 w-4"></i></div>' +
        '<div><h1 class="text-sm font-extrabold leading-tight text-slate-900">' + t('privacy_form_title') + '</h1><p class="text-xs text-slate-500">' + escapeHtml(n.name) + '</p></div>' +
        '<div class="ml-auto flex items-center gap-2">' +
          '<button onclick="window.print()" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"><i data-lucide="printer" class="h-3.5 w-3.5"></i>' + t('manual_btn_print') + '</button>' +
          '<button data-action="close-privacy" class="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"><i data-lucide="x" class="h-3.5 w-3.5"></i>' + t('manual_close') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="mx-auto max-w-3xl px-4 py-8 sm:px-5">' +
      '<div class="space-y-5 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:p-0 print:shadow-none">' +
        '<div class="text-center">' +
          '<h2 class="text-lg font-extrabold text-slate-900">Informativa e Consenso al Trattamento dei Dati Personali</h2>' +
          '<p class="text-sm italic text-slate-500">Información y Consentimiento para el Tratamiento de Datos Personales</p>' +
          '<p class="mt-1 text-xs text-slate-400">Artt. 13–14 Regolamento (UE) 2016/679 «GDPR»</p>' +
        '</div>' +
        '<div class="rounded-xl border border-slate-200 bg-slate-50 p-4 text-[13px] leading-relaxed text-slate-700 print:bg-white">' +
          '<p><b>Candidato/a · Candidato/a:</b> ' + v(n.name) + '</p>' +
          '<p><b>Nato/a il / a · Nacido/a el / en:</b> ' + (birth ? escapeHtml(birth) : dot) + '</p>' +
          '<p><b>Cédula:</b> ' + v(n.cedula) + ' &nbsp;·&nbsp; <b>Passaporto · Pasaporte:</b> ' + v(n.passport) + '</p>' +
          '<p><b>Indirizzo · Dirección:</b> ' + v(n.address) + '</p>' +
        '</div>' +
        clause('<b>1. Titolare del trattamento.</b> DHL Nurses — Gestionale Trasferimento Infermieri (integrare con ragione sociale, sede e contatti del Titolare).',
               '<b>1. Responsable del tratamiento.</b> DHL Nurses — Gestión de Traslado de Enfermeros (completar con razón social, sede y contactos del Responsable).') +
        clause('<b>2. Finalità.</b> I dati sono trattati per la gestione della candidatura e della pratica di trasferimento in Italia: riconoscimento del titolo professionale, nulla osta al lavoro, visto d’ingresso, permesso di soggiorno, iscrizione OPI e inserimento presso la struttura sanitaria di destinazione.',
               '<b>2. Finalidad.</b> Los datos se tratan para la gestión de la candidatura y del expediente de traslado a Italia: reconocimiento del título profesional, autorización de trabajo, visado de entrada, permiso de residencia, inscripción OPI e incorporación a la estructura sanitaria de destino.') +
        clause('<b>3. Categorie di dati.</b> Dati anagrafici e di contatto, documenti d’identità, titoli di studio e professionali, curriculum; ove richiesto dalla normativa: certificati penali e certificati sanitari (categorie particolari ex artt. 9–10 GDPR).',
               '<b>3. Categorías de datos.</b> Datos personales y de contacto, documentos de identidad, títulos académicos y profesionales, currículum; cuando lo exija la normativa: certificados penales y sanitarios (categorías especiales según arts. 9–10 RGPD).') +
        clause('<b>4. Base giuridica e conservazione.</b> Esecuzione di misure precontrattuali e contrattuali, obblighi di legge e consenso esplicito per le categorie particolari. I dati sono conservati per la durata della pratica e per i termini di legge successivi.',
               '<b>4. Base jurídica y conservación.</b> Ejecución de medidas precontractuales y contractuales, obligaciones legales y consentimiento explícito para las categorías especiales. Los datos se conservan mientras dure el expediente y por los plazos legales posteriores.') +
        clause('<b>5. Destinatari.</b> I dati possono essere comunicati, per le finalità indicate, a: Ministero della Salute, Sportello Unico per l’Immigrazione, rappresentanze consolari italiane, agenzia partner e struttura sanitaria di destinazione.',
               '<b>5. Destinatarios.</b> Los datos podrán comunicarse, para las finalidades indicadas, a: Ministerio de Salud italiano, Ventanilla Única de Inmigración, representaciones consulares italianas, agencia asociada y estructura sanitaria de destino.') +
        clause('<b>6. Diritti dell’interessato.</b> L’interessato può esercitare i diritti di cui agli artt. 15–22 GDPR (accesso, rettifica, cancellazione, limitazione, portabilità, opposizione) e revocare il consenso in qualsiasi momento, scrivendo al Titolare.',
               '<b>6. Derechos del interesado.</b> El interesado puede ejercer los derechos de los arts. 15–22 RGPD (acceso, rectificación, supresión, limitación, portabilidad, oposición) y revocar el consentimiento en cualquier momento, escribiendo al Responsable.') +
        '<div class="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 print:bg-white">' +
          clause('<b>Consenso al trattamento dei dati personali</b> per le finalità di cui al punto 2:<br>' + box + 'Acconsento&nbsp;&nbsp;&nbsp;' + box + 'Non acconsento',
                 '<b>Consentimiento al tratamiento de los datos personales</b> para las finalidades del punto 2:<br>' + box + 'Consiento&nbsp;&nbsp;&nbsp;' + box + 'No consiento') +
          clause('<b>Consenso esplicito al trattamento delle categorie particolari di dati</b> (certificati sanitari e penali, solo ove richiesti):<br>' + box + 'Acconsento&nbsp;&nbsp;&nbsp;' + box + 'Non acconsento',
                 '<b>Consentimiento explícito al tratamiento de las categorías especiales de datos</b> (certificados sanitarios y penales, solo cuando se requieran):<br>' + box + 'Consiento&nbsp;&nbsp;&nbsp;' + box + 'No consiento') +
        '</div>' +
        '<div class="grid grid-cols-2 gap-8 pt-6 text-[13px] text-slate-700">' +
          '<div><p class="mb-8">Luogo e data · Lugar y fecha</p><p class="border-t border-slate-400 pt-1 text-center text-xs text-slate-400">&nbsp;</p></div>' +
          '<div><p class="mb-8">Firma del candidato · Firma del candidato</p><p class="border-t border-slate-400 pt-1 text-center text-xs text-slate-400">&nbsp;</p></div>' +
        '</div>' +
        '<p class="no-print rounded-xl bg-amber-50 p-3 text-xs text-amber-700 ring-1 ring-inset ring-amber-200">' + t('privacy_form_hint') + '</p>' +
      '</div>' +
    '</div>';
  }

  function guideHtml() {
    const toc = guideToc(LANG).map((item) => '<a href="#' + item[0] + '" class="toc-link block rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-50">' + item[1] + '</a>').join('');
    return '' +
    '<div class="no-print sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">' +
      '<div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-5">' +
        '<div class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white shadow"><i data-lucide="scale" class="h-4 w-4"></i></div>' +
        '<div><h1 class="text-sm font-extrabold leading-tight text-slate-900">' + t('norm_guide_title') + '</h1><p class="text-xs text-slate-500">DHL Nurses · Normativa</p></div>' +
        '<div class="ml-auto flex items-center gap-2">' +
          '<button onclick="window.print()" class="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"><i data-lucide="printer" class="h-3.5 w-3.5"></i><span class="hidden sm:inline">' + t('manual_btn_print') + '</span></button>' +
          '<button data-action="close-guide" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"><i data-lucide="x" class="h-3.5 w-3.5"></i>' + t('manual_close') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="mx-auto flex max-w-6xl gap-8 px-4 py-8 sm:px-5">' +
      '<aside class="no-print hidden w-60 shrink-0 lg:block"><nav class="sticky top-24 space-y-0.5 text-sm"><p class="mb-2 px-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">' + t('manual_index') + '</p>' + toc + '</nav></aside>' +
      '<main class="min-w-0 flex-1 space-y-12">' + guideBody(LANG) + '</main>' +
    '</div>';
  }

  function manualHtml() {
    const TOC = {
      it: [['intro','1. Introduzione'],['accesso','2. Accesso e profilo'],['interfaccia',"3. L'interfaccia"],['dashboard','4. Dashboard Analitica'],['pratiche','5. Gestione Pratiche'],['workflow','6. Le 9 fasi e i 2 team'],['procedure','7. Usare il gestionale'],['dati','8. Salvataggio dati'],['faq','9. Domande frequenti'],['glossario','10. Glossario']],
      en: [['intro','1. Introduction'],['accesso','2. Access & profile'],['interfaccia','3. The interface'],['dashboard','4. Analytics Dashboard'],['pratiche','5. Case Management'],['workflow','6. The 9 phases & 2 teams'],['procedure','7. Using the app'],['dati','8. Data storage'],['faq','9. FAQ'],['glossario','10. Glossary']],
      es: [['intro','1. Introducción'],['accesso','2. Acceso y perfil'],['interfaccia','3. La interfaz'],['dashboard','4. Panel Analítico'],['pratiche','5. Gestión de Expedientes'],['workflow','6. Las 9 fases y los 2 equipos'],['procedure','7. Usar la app'],['dati','8. Almacenamiento'],['faq','9. Preguntas frecuentes'],['glossario','10. Glosario']],
    };
    const tocItems = TOC[LANG] || TOC.it;
    const toc = tocItems.map((item) => '<a href="#' + item[0] + '" class="toc-link block rounded-lg px-3 py-1.5 text-slate-600 transition hover:bg-slate-50">' + item[1] + '</a>').join('');
    return '' +
    '<div class="no-print sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">' +
      '<div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-5">' +
        '<div class="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-500 text-white shadow"><i data-lucide="book-open" class="h-4 w-4"></i></div>' +
        '<div><h1 class="text-sm font-extrabold leading-tight text-slate-900">' + t('manual_title') + '</h1><p class="text-xs text-slate-500">DHL Nurses · v1.1</p></div>' +
        '<div class="ml-auto flex items-center gap-2">' +
          '<button onclick="window.print()" class="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"><i data-lucide="printer" class="h-3.5 w-3.5"></i><span class="hidden sm:inline">' + t('manual_btn_print') + '</span></button>' +
          '<button data-action="close-manual" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"><i data-lucide="x" class="h-3.5 w-3.5"></i>' + t('manual_close') + '</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="mx-auto flex max-w-6xl gap-8 px-4 py-8 sm:px-5">' +
      '<aside class="no-print hidden w-60 shrink-0 lg:block"><nav class="sticky top-24 space-y-0.5 text-sm"><p class="mb-2 px-3 text-[11px] font-bold uppercase tracking-wide text-slate-400">' + t('manual_index') + '</p>' + toc + '</nav></aside>' +
      '<main class="min-w-0 flex-1 space-y-12">' + manualBody() + '</main>' +
    '</div>';
  }

  function manualBody() { return LANG === 'en' ? manualBodyEN() : (LANG === 'es' ? manualBodyES() : manualBodyIT()); }

  function manualBodyIT() {
    return `
      <div class="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-indigo-900 p-7 text-white shadow-sm">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-inset ring-white/20"><i data-lucide="book-open" class="h-3.5 w-3.5"></i>Manuale Operatore</span>
        <h2 class="mt-3 text-2xl font-extrabold">Come usare DHL Nurses</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-300">Guida pratica per il personale HR e gli operatori che seguono il trasferimento degli infermieri dalla Repubblica Dominicana alle strutture sanitarie italiane. Spiega ogni schermata, ogni pulsante e le procedure quotidiane.</p>
      </div>

      <section id="intro" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="info" class="h-5 w-5 text-indigo-500"></i>1. Introduzione</h2>
        <p class="text-sm leading-relaxed text-slate-600">DHL Nurses è il gestionale che segue ogni candidato infermiere lungo l'intero percorso: dalla selezione in Repubblica Dominicana fino all'inserimento e all'assistenza nella struttura sanitaria italiana. Ogni candidato è una <b>pratica</b> che attraversa <b>9 fasi sequenziali</b>, divise tra due team: il <b>Team Repubblica Dominicana</b> (fasi 1–4, fino alla partenza) e il <b>Team Italia</b> (fasi 5–9, dall'arrivo in poi). Il sistema impedisce di saltare passaggi e segnala le pratiche in ritardo.</p>
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-xl border border-slate-200 bg-white p-4"><i data-lucide="layout-dashboard" class="h-5 w-5 text-indigo-500"></i><p class="mt-2 text-sm font-bold text-slate-800">Dashboard Analitica</p><p class="mt-1 text-xs text-slate-500">La visione d'insieme: numeri chiave e allarmi.</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><i data-lucide="folder-kanban" class="h-5 w-5 text-indigo-500"></i><p class="mt-2 text-sm font-bold text-slate-800">Gestione Pratiche</p><p class="mt-1 text-xs text-slate-500">Il lavoro sul singolo candidato.</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><i data-lucide="graduation-cap" class="h-5 w-5 text-indigo-500"></i><p class="mt-2 text-sm font-bold text-slate-800">Guida interattiva</p><p class="mt-1 text-xs text-slate-500">Il tour a riflettore dentro l'app (pulsante "Guida").</p></div>
        </div>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-800"><b>Suggerimento.</b> Al primo accesso parte automaticamente la <b>Guida</b> interattiva. Puoi rilanciarla in qualsiasi momento dal pulsante <span class="font-semibold">🎓 Guida</span> in alto a destra (ora la sfogli anche con le <b>frecce ← → della tastiera</b>). Questo manuale la completa con le procedure dettagliate.</div>
        <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-emerald-800"><i data-lucide="sparkles" class="h-4 w-4"></i>Novità di questa versione</p>
          <ul class="prose-list mt-2 ml-5 list-disc text-sm text-emerald-900/80">
            <li><b>Salvataggio in tempo reale con indicatore di stato</b> nell'header (☁︎ Salvato / Salvataggio… / NON salvato / Offline): con più operatori sullo stesso archivio, le modifiche di ciascuno arrivano subito agli altri e un avviso segnala quando il salvataggio sul cloud non riesce (§8).</li>
            <li><b>Avvisi sulle richieste di matching:</b> un messaggio compare quando una richiesta viene creata e quando l'organico è al completo (§6.1).</li>
            <li><b>Scheda candidato stampabile in PDF:</b> pulsante <b>Scheda</b> nell'intestazione del candidato (§7).</li>
            <li><b>Backup dei dati</b> (Impostazioni, solo admin): esporta e ripristina l'intero archivio da un file (§8).</li>
            <li><b>Scadenze di passaporto e cédula</b> ora segnalate anche in Dashboard, non solo nella scheda (§4.3).</li>
            <li><b>Ricerca pratiche estesa</b> anche ad agenzia, referente HR, luogo di nascita e specializzazioni (§5.1).</li>
            <li><b>Documenti bloccati</b> sulle fasi dell'altro team, come già checklist e «Avanza Fase» (§9).</li>
          </ul>
        </div>
      </section>

      <section id="accesso" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="log-in" class="h-5 w-5 text-indigo-500"></i>2. Accesso e profilo operatore</h2>
        <p class="text-sm leading-relaxed text-slate-600">All'apertura del gestionale compare la schermata di accesso. Ogni operatore lavora con il proprio account: i dati sono <b>isolati e protetti</b>.</p>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-800"><b>Prerequisito.</b> Per entrare, la tua email deve comparire in <b>Impostazioni → Operatori HR</b>: è quell'elenco a decidere chi accede e con quale ruolo/team. L'amministratore può anche crearti direttamente l'utenza dal pulsante <b>🔑 Crea account</b> sulla tua scheda operatore, consegnandoti una password provvisoria.</div>
        <ol class="prose-list ml-5 list-decimal text-sm text-slate-600">
          <li><b>Account creato dall'amministratore:</b> accedi con l'email della tua scheda e la password provvisoria ricevuta, poi cambiala dal tuo profilo (avatar in alto a destra) o con «Password dimenticata?».</li>
          <li><b>Registrazione autonoma:</b> in alternativa premi <b>Registrati</b> usando la <b>stessa email</b> della tua scheda operatore e una password a tua scelta (minimo 6 caratteri).</li>
          <li><b>Accesso con Google:</b> premi <b>Continua con Google</b> con l'account Google che ha quella email — nessuna password da gestire.</li>
          <li><b>Accessi successivi:</b> email e password e premi <b>Accedi</b>; se non la ricordi usa <b>«Password dimenticata?»</b> sotto il campo password.</li>
          <li><b>Uscire:</b> in alto a destra, premi <b>Esci</b> al termine del lavoro.</li>
        </ol>
        <h3 id="profilo-operatore" class="pt-2 text-base font-bold text-slate-800">2.1 · Il tuo profilo operatore</h3>
        <p class="text-sm leading-relaxed text-slate-600">In alto a destra, clicca il tuo <b>avatar</b> (il cerchio con l'iniziale) per aprire la scheda <b>Profilo Operatore</b>. Da qui puoi:</p>
        <ul class="prose-list ml-5 list-disc text-sm text-slate-600">
          <li><b>Modificare il nome visualizzato</b>: scrivi il nome e premi <b>Salva nome</b>.</li>
          <li><b>Consultare i dati dell'account</b>: email, metodo di accesso, data di creazione e ultimo accesso.</li>
          <li><b>Reimpostare la password</b> (solo per accesso con email/password) tramite email.</li>
          <li><b>Uscire</b> dalla sessione direttamente dalla scheda.</li>
        </ul>
        <div class="rounded-xl border-l-4 border-slate-400 bg-slate-50 p-4 text-sm text-slate-700"><b>In modalità demo locale</b> non esiste un account cloud: la scheda profilo permette solo di impostare il <b>nome operatore</b> salvato su questo computer.</div>
      </section>

      <section id="interfaccia" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="panels-top-left" class="h-5 w-5 text-indigo-500"></i>3. Conoscere l'interfaccia</h2>
        <p class="text-sm leading-relaxed text-slate-600">La barra in alto è sempre presente. Da sinistra a destra trovi:</p>
        <div class="overflow-hidden rounded-xl border border-slate-200"><table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400"><tr><th class="px-4 py-2">Elemento</th><th class="px-4 py-2">A cosa serve</th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Dashboard / Gestione Pratiche / Matching / Documenti / Impostazioni</td><td class="px-4 py-2.5 text-slate-600">Le viste: visione d'insieme, lavoro sul candidato, richieste delle strutture e incrocio domanda–offerta, archivio documenti e (solo admin) anagrafiche di base.</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Badge "a rischio"</td><td class="px-4 py-2.5 text-slate-600">Conta le pratiche ferme oltre i tempi previsti. Verde = nessun rischio.</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Manuale</td><td class="px-4 py-2.5 text-slate-600">Apre questo documento.</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Guida</td><td class="px-4 py-2.5 text-slate-600">Avvia il tour interattivo a riflettore (navigabile con le frecce ← →).</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Stato salvataggio</td><td class="px-4 py-2.5 text-slate-600">Solo in modalità cloud: ☁︎ verde = salvato, ambra = salvataggio in corso, <b>rosso = non salvato</b> (clic per il dettaglio e nuovo tentativo), grigio = offline.</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Ripristina</td><td class="px-4 py-2.5 text-slate-600">Riporta ai profili demo. <b>Solo in modalità demo locale</b> (in cloud è nascosto per non cancellare i dati del team).</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Avatar / Esci</td><td class="px-4 py-2.5 text-slate-600">Profilo operatore e chiusura sessione.</td></tr>
          </tbody>
        </table></div>
      </section>

      <section id="dashboard" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="layout-dashboard" class="h-5 w-5 text-indigo-500"></i>4. Dashboard Analitica</h2>
        <p class="text-sm leading-relaxed text-slate-600">La prima schermata: per capire <b>in pochi secondi</b> lo stato generale del lavoro.</p>
        <h3 id="riepilogo" class="pt-2 text-base font-bold text-slate-800">4.1 · Riepilogo Trasferimenti</h3>
        <p class="text-sm leading-relaxed text-slate-600">In cima alla dashboard trovi il colpo d'occhio richiesto più spesso: <b>quanti infermieri stiamo trattando</b>, quanti sono stati <b>trasferiti in Italia</b> e quanti <b>devono ancora essere trasferiti</b>. Vale sempre la relazione: <b>In Gestione = Trasferiti + Da Trasferire</b>.</p>
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-sm font-bold text-slate-800">In Gestione</p><p class="mt-1 text-xs text-slate-500">Totale infermieri che stiamo seguendo (tutte le pratiche presenti).</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-sm font-bold text-slate-800">Trasferiti</p><p class="mt-1 text-xs text-slate-500">Chi è già in Italia: fasi del <b>Team Italia</b> (5–9) o percorso completato.</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-sm font-bold text-slate-800">Da Trasferire</p><p class="mt-1 text-xs text-slate-500">Ancora seguiti dal <b>Team Rep. Dominicana</b> (fasi 1–4).</p></div>
        </div>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-800"><b>Suggerimento.</b> Ogni riquadro è <b>cliccabile</b>: ti porta direttamente in <b>Gestione Pratiche</b> già filtrato (es. "Trasferiti" mostra solo chi è partito).</div>
        <h3 id="kpi" class="pt-2 text-base font-bold text-slate-800">4.2 · Indicatori chiave (KPI)</h3>
        <p class="text-sm leading-relaxed text-slate-600"><b>Tutti i KPI sono cliccabili</b> e aprono la sezione corrispondente già filtrata.</p>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-xs font-semibold uppercase text-slate-400">Pratiche Attive</p><p class="mt-1 text-xs text-slate-500">Candidati in lavorazione (fasi 1–9). → apre le pratiche attive.</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-xs font-semibold uppercase text-slate-400">Documenti Mancanti</p><p class="mt-1 text-xs text-slate-500">Con almeno un documento da caricare. → apre le pratiche con doc. mancanti.</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-xs font-semibold uppercase text-slate-400">In Matching</p><p class="mt-1 text-xs text-slate-500">In abbinamento con le richieste delle strutture (fase 7). → apre le pratiche in matching.</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-xs font-semibold uppercase text-slate-400">Doc. in Scadenza</p><p class="mt-1 text-xs text-slate-500">Scaduti o entro 60 giorni. → apre l'Archivio Documenti filtrato.</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-xs font-semibold uppercase text-slate-400">Richieste da Evadere</p><p class="mt-1 text-xs text-slate-500">Richieste aperte delle strutture, coi posti ancora da coprire. → apre il Matching.</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-xs font-semibold uppercase text-slate-400">Richieste Evase</p><p class="mt-1 text-xs text-slate-500">Richieste con organico al completo o chiuse. → apre il Matching.</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-xs font-semibold uppercase text-slate-400">Percorsi Completati</p><p class="mt-1 text-xs text-slate-500">Percorso concluso. → apre le pratiche completate.</p></div>
        </div>
        <h3 id="rischio" class="pt-2 text-base font-bold text-slate-800">4.3 · Semafori di Rischio e Scadenze</h3>
        <p class="text-sm leading-relaxed text-slate-600">Elenca le pratiche ferme <b>troppo a lungo</b> nello stato attuale, e un pannello con i <b>documenti in scadenza/scaduti</b>. <b>Azione:</b> clicca la riga per aprire la pratica; il KPI "Doc. in Scadenza" apre l'archivio filtrato.</p>
        <h3 id="strutture" class="pt-2 text-base font-bold text-slate-800">4.4 · Candidati per Struttura</h3>
        <p class="text-sm leading-relaxed text-slate-600">Mostra quanti candidati sono assegnati a ciascun datore di lavoro e quanti hanno concluso il percorso. In fondo, la distribuzione nelle 9 fasi, raggruppate per team.</p>
      </section>

      <section id="pratiche" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="folder-kanban" class="h-5 w-5 text-indigo-500"></i>5. Gestione Pratiche</h2>
        <p class="text-sm leading-relaxed text-slate-600">Il lavoro quotidiano. A sinistra l'<b>elenco candidati</b>, a destra la <b>scheda completa</b>.</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">5.1 · Elenco e ricerca</h3>
        <ul class="prose-list ml-5 list-disc text-sm text-slate-600">
          <li><b>Ricerca:</b> per nome, passaporto, struttura di destinazione, <b>agenzia partner, referente HR, luogo di nascita e specializzazioni</b>.</li>
          <li><b>Filtri di stato:</b> Tutti, <b>Trasferiti</b>, <b>Da Trasferire</b>, A rischio, Doc. Mancanti, In corso, Fase Italia, Completati. Arrivando da un KPI (es. "In Matching") compare un filtro temporaneo evidenziato, con la ✕ per rimuoverlo.</li>
          <li><b>Filtro "Il mio team":</b> se in <b>Impostazioni → Operatori HR</b> il tuo profilo ha un Team assegnato (Rep. Dominicana o Italia), compare un filtro dedicato che mostra solo i candidati nelle fasi del tuo team. L'abbinamento avviene tramite l'email di accesso (o il nome operatore in modalità demo).</li>
          <li><b>Scheda:</b> mostra badge di stato, livello linguistico e fase. L'icona ⏰ segnala un rischio ritardo.</li>
        </ul>
        <h3 class="pt-2 text-base font-bold text-slate-800">5.2 · Lo stepper (timeline 9 fasi · 2 team)</h3>
        <p class="text-sm leading-relaxed text-slate-600">Sopra la timeline, due bande indicano il team responsabile: <b>🇩🇴 Team Rep. Dominicana</b> (fasi 1–4) e <b>🇮🇹 Team Italia</b> (fasi 5–9). I colori dei cerchi: <span class="font-semibold text-emerald-600">verde</span> = completata, <span class="font-semibold text-indigo-600">indaco</span> = in corso, <span class="font-semibold text-amber-600">ambra</span> = bloccata, grigio = da fare.</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">5.3 · Il pulsante "Avanza Fase"</h3>
        <p class="text-sm leading-relaxed text-slate-600">Porta la pratica alla fase successiva. <b>Si sblocca solo</b> quando checklist e documenti della fase corrente sono soddisfatti; in caso contrario, sopra il pulsante compare l'elenco dei requisiti mancanti.</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">5.4 · Documenti, checklist, logistica, log</h3>
        <ul class="prose-list ml-5 list-disc text-sm text-slate-600">
          <li><b>Documenti:</b> stati Approvato / In Verifica / Mancante; azioni Carica, Approva, Respingi, Aggiungi.</li>
          <li><b>Checklist:</b> attività obbligatorie della fase corrente, cambia a ogni avanzamento.</li>
          <li><b>Logistica &amp; Onboarding HR:</b> volo, alloggio, tutor, contratto.</li>
          <li><b>Log &amp; audit trail:</b> note, chiamate e avvisi con data e autore.</li>
        </ul>
      </section>

      <section id="workflow" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="route" class="h-5 w-5 text-indigo-500"></i>6. Le 9 fasi e i 2 team</h2>
        <p class="text-sm leading-relaxed text-slate-600">Il progetto è organizzato su una chiara suddivisione geografica e operativa. Il <b>Team Repubblica Dominicana</b> segue il candidato fino alla partenza (fasi 1–4); il <b>Team Italia</b> subentra all'arrivo e cura logistica, matching lavorativo e stabilità (fasi 5–9). Il coordinamento avviene tramite l'aggiornamento costante di documenti e checklist nel gestionale.</p>
        <div class="overflow-hidden rounded-xl border border-slate-200"><table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400"><tr><th class="px-3 py-2 w-10">#</th><th class="px-3 py-2">Fase</th><th class="px-3 py-2">Cosa fare</th></tr></thead>
          <tbody class="divide-y divide-slate-100 align-top">
            <tr class="bg-sky-50"><td colspan="3" class="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-sky-700">🇩🇴 Team Repubblica Dominicana — dalla selezione alla partenza</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-sky-600">1</td><td class="px-3 py-2.5 font-medium text-slate-700">Selezione e Reclutamento</td><td class="px-3 py-2.5 text-slate-600">Solo strutture riconosciute dal governo dominicano; verifica di competenze e specializzazioni infermieristiche, dati anagrafici, valutazione linguistica.</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-sky-600">2</td><td class="px-3 py-2.5 font-medium text-slate-700">Gestione Documentale</td><td class="px-3 py-2.5 text-slate-600">La fase cruciale, gestita tramite l'app: titoli tradotti e asseverati, apostille, riconoscimento del Ministero, nulla osta, visto e iscrizione OPI. Non si avanza finché ogni documento richiesto non è caricato e approvato.</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-sky-600">3</td><td class="px-3 py-2.5 font-medium text-slate-700">Formazione</td><td class="px-3 py-2.5 text-slate-600">Contenuti digitali e incontri (online o in presenza) sul modello «Italia in tasca», con assistenza diretta durante il percorso.</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-sky-600">4</td><td class="px-3 py-2.5 font-medium text-slate-700">Organizzazione Viaggio</td><td class="px-3 py-2.5 text-slate-600">Acquisto del biglietto aereo e trasferimento all'aeroporto in territorio dominicano.</td></tr>
            <tr class="bg-emerald-50"><td colspan="3" class="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-emerald-700">🇮🇹 Team Italia — dall'arrivo alla piena integrazione</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-emerald-600">5</td><td class="px-3 py-2.5 font-medium text-slate-700">Arrivo in Italia</td><td class="px-3 py-2.5 text-slate-600">Accoglienza in aeroporto e trasferimento verso l'alloggio prestabilito.</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-emerald-600">6</td><td class="px-3 py-2.5 font-medium text-slate-700">Domicilio e Servizi</td><td class="px-3 py-2.5 text-slate-600">Contratto individuale di alloggio (sui contratti quadro già stipulati), attivazione servizi, permesso di soggiorno.</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-emerald-600">7</td><td class="px-3 py-2.5 font-medium text-slate-700">Matching</td><td class="px-3 py-2.5 text-slate-600">Ricezione delle richieste dalle strutture sanitarie e incrocio mirato con le competenze e specializzazioni caricate dal Team Dominicana: l'inserimento non è generico ma su misura del reparto.</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-emerald-600">8</td><td class="px-3 py-2.5 font-medium text-slate-700">Rapporto di Lavoro</td><td class="px-3 py-2.5 text-slate-600">Identificazione del datore, firma del contratto, gestione continua della relazione (controversie, welfare aziendale).</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-emerald-600">9</td><td class="px-3 py-2.5 font-medium text-slate-700">Tutor e Assistenza</td><td class="px-3 py-2.5 text-slate-600">Tutor, servizi socio-culturali e assistenza legale/fiscale a condizioni agevolate per le questioni extra-lavorative.</td></tr>
          </tbody>
        </table></div>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-800"><b>Una tantum vs operativo.</b> Alcune attività dei team sono accordi quadro <b>una tantum</b> (convenzioni con agenzie riconosciute, contratti quadro per gli alloggi, contrattualizzazione preventiva delle aziende, convenzioni con professionisti legali/fiscali) e non compaiono nella checklist del singolo candidato: la checklist contiene solo le attività <b>operative</b> da ripetere per ogni pratica.</div>
        <h3 class="pt-2 text-base font-bold text-slate-800">6.1 · Il protocollo di matching tecnico</h3>
        <p class="text-sm leading-relaxed text-slate-600">Il gestionale è la <b>fonte unica di verità</b> del progetto: il <b>Team Dominicana inserisce e qualifica</b> i dati (specializzazioni cliniche verificate del candidato, documentazione asseverata, dossier «Italia in tasca»), il <b>Team Italia interroga ed estrae</b> (riceve i fabbisogni dalle strutture, filtra il database per competenze, abbina il profilo idoneo e ne monitora la conformità).</p>
        <ul class="prose-list ml-5 list-disc text-sm text-slate-600">
          <li><b>Specializzazioni del candidato:</b> si spuntano dal catalogo in <b>Modifica anagrafica</b> (sezione Competenze); il catalogo si gestisce in <b>Impostazioni → Specializzazioni</b>.</li>
          <li><b>Richieste delle strutture:</b> nella vista <b>Matching</b>, con «Nuova Richiesta» si registrano reparto di destinazione, numero di infermieri richiesti, competenze minime, specializzazioni preferenziali e turno; la richiesta risulta «Abbinata» quando tutti i posti sono coperti. Un <b>avviso</b> segnala automaticamente quando una richiesta viene creata e quando l'organico è al completo — anche se l'azione arriva da un altro operatore.</li>
          <li><b>Incrocio:</b> «Trova candidati» ordina i profili per compatibilità (interrogazione → identificazione → validazione documentale) e con «Abbina» si finalizza la proposta: il datore di lavoro del candidato viene aggiornato e tutto resta tracciato nel log.</li>
        </ul>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="text-sm font-bold text-slate-800">Come viene costruita la rosa dei candidati</p>
          <ul class="prose-list mt-2 ml-5 list-disc text-sm text-slate-600">
            <li><b>Chi entra:</b> tutti i candidati non ancora abbinati a un'altra richiesta e non oltre la fase 7 (chi è già in Rapporto di Lavoro o ha concluso il percorso è escluso). La fase non conta come requisito: puoi "prenotare" anche chi è ancora in formazione.</li>
            <li><b>Idoneo o parziale:</b> un profilo è <span class="font-semibold text-emerald-600">Idoneo</span> solo se possiede <b>tutte</b> le competenze minime della richiesta; altrimenti è <span class="font-semibold text-amber-600">Parziale</span>. Il sistema informa ma non impone: la scelta finale resta dell'operatore.</li>
            <li><b>Ordinamento:</b> profilo idoneo = 100 punti base (un parziale arriva al massimo a 60, in proporzione alle minime possedute); <b>+8</b> per ogni specializzazione preferenziale; <b>+5</b> se il dossier «Italia in tasca» è validato; <b>+4</b> se tutti i documenti obbligatori sono approvati; a parità, viene prima chi è più avanti nelle fasi (operativo prima).</li>
            <li><b>Badge di validazione:</b> sotto ogni nome vedi competenze x/y, preferenziali x/y, documenti completi/incompleti e dossier validato/mancante — la «validazione» del protocollo, a colpo d'occhio.</li>
            <li><b>Stati della richiesta:</b> nasce <b>Aperta</b>; con gli abbinamenti il contatore sale (es. «1/3 abbinati») e a organico coperto diventa <b>Abbinata</b>; a contratti firmati la si <b>Chiude</b>. La ✕ su un singolo abbinato lo rimuove (tracciato nel log) e riapre la richiesta.</li>
            <li><b>Cosa NON fa:</b> l'abbinamento non fa avanzare le fasi del candidato e non lo toglie dalla pipeline: il percorso prosegue normalmente con checklist e «Avanza Fase».</li>
          </ul>
        </div>
      </section>

      <section id="procedure" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="list-checks" class="h-5 w-5 text-indigo-500"></i>7. Usare il gestionale passo-passo</h2>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4">
          <p class="text-sm font-bold text-indigo-800">Il flusso completo in 6 passi</p>
          <ol class="prose-list mt-1 ml-5 list-decimal text-sm text-indigo-900/80">
            <li><b>Accedi</b> con il tuo account.</li><li><b>Crea l'anagrafica</b> del candidato (procedura 1).</li>
            <li><b>Inserisci e approva i documenti</b> (procedure 2 e 3).</li><li><b>Spunta la checklist</b> della fase corrente.</li>
            <li><b>Avanza la fase</b> quando il pulsante si sblocca (procedura 4).</li><li><b>Registra le comunicazioni</b> e controlla i semafori (5 e 6).</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">1</span>Creare una nuova anagrafica</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Vai sulla vista <b>Gestione Pratiche</b>.</li>
            <li>In cima all'elenco, premi <b>Nuovo Candidato</b>.</li>
            <li>Compila i campi. <b>Nome e Passaporto</b> sono obbligatori (*); gli altri facoltativi. Il sistema controlla che l'<b>email</b> sia scritta bene e che il <b>passaporto</b> non sia già registrato per un altro candidato.</li>
            <li>Premi <b>Crea candidato</b>: la pratica si apre alla fase <b>1 · Selezione e Reclutamento</b> con i documenti standard già predisposti.</li>
          </ol>
          <p class="mt-2 text-xs text-slate-400">Per chiudere senza salvare: <b>Annulla</b>, tasto <b>Esc</b> o click fuori dal riquadro.</p>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">2</span>Inserire i documenti</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Apri la sezione <b>Ciclo di Vita dei Documenti</b>.</li>
            <li>Premi <b>Aggiungi</b> in alto a destra della tabella.</li>
            <li>Inserisci nome (obbligatorio), lingua (ES/IT) e validità se nota.</li>
            <li>Premi <b>Aggiungi</b>: il documento compare come <span class="font-semibold text-rose-600">Mancante</span>.</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">3</span>Caricare e approvare un documento</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Individua le righe <span class="font-semibold text-rose-600">Mancante</span>.</li>
            <li>Premi <b>Carica</b> → <span class="font-semibold text-amber-600">In Verifica</span>.</li>
            <li>Premi <b>Approva</b> → <span class="font-semibold text-emerald-600">Approvato</span> (o <b>Respingi</b>).</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">4</span>Far avanzare una pratica</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Spunta la <b>Checklist</b> della fase corrente.</li><li>Verifica che i documenti siano <b>Approvati</b>.</li>
            <li>Completa gli eventuali <b>requisiti mancanti</b> indicati.</li><li>Premi <b>Avanza Fase</b>.</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">5</span>Registrare una telefonata o nota</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Vai a "Log comunicazioni".</li><li>Scrivi il testo, scegli <b>Chiamata</b>/Nota/Avviso e premi <b>Registra</b>.</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">6</span>Gestire un semaforo rosso</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Dalla Dashboard, clicca la pratica nei "Semafori di Rischio".</li><li>Individua il blocco e contatta agenzia/candidato.</li>
            <li><b>Registra la chiamata</b> e aggiorna documenti/checklist: il contatore si azzera.</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">7</span>Gestire una richiesta e abbinare i candidati (Team Italia)</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Vai nella vista <b>Matching</b> e premi <b>Nuova Richiesta</b>.</li>
            <li>Compila struttura e reparto (obbligatori), <b>numero di infermieri richiesti</b>, competenze minime, preferenziali e turno, poi <b>Salva</b>.</li>
            <li>Premi <b>Trova candidati</b> e leggi la rosa: «Profilo idoneo» in testa, badge di validazione sotto ogni nome.</li>
            <li>Premi <b>Abbina</b> sul candidato scelto e conferma: datore di lavoro aggiornato e log scritto. Ripeti finché il contatore non arriva a organico pieno (es. «3/3 abbinati» → richiesta <b>Abbinata</b>).</li>
            <li>A contratti firmati premi <b>Chiudi richiesta</b>. Per correggere un errore usa la ✕ sul singolo abbinato.</li>
          </ol>
        </div>

        <div class="rounded-xl border-l-4 border-emerald-400 bg-emerald-50 p-4">
          <p class="text-sm font-bold text-emerald-800">Altre funzioni utili</p>
          <ul class="prose-list mt-1 ml-5 list-disc text-sm text-emerald-900/80">
            <li><b>Caricare un file:</b> nella scheda documenti premi <b>Carica</b> → si apre il selettore file del computer (PDF, foto, scansione). Il file resta allegato e diventa <b>Sostituisci</b> per cambiarlo.</li>
            <li><b>Archivio Documenti</b> (scheda <b>Documenti</b> in alto): ritrova <b>tutti</b> i documenti di tutti i candidati, con ricerca e filtri. Clicca <b>Visualizza</b> per l'<b>anteprima</b> di immagini e PDF dentro l'app.</li>
            <li><b>Scadenze:</b> i documenti con data di validità vengono segnalati con <span class="font-semibold text-amber-600">In scadenza</span> (entro 60 giorni) o <span class="font-semibold text-rose-600">Scaduto</span>. Usa il filtro <b>In scadenza</b> nell'archivio.</li>
            <li><b>Modifica anagrafica:</b> pulsante <b>Modifica anagrafica</b> nell'intestazione del candidato per correggere i dati.</li>
            <li><b>Logistica &amp; Onboarding:</b> pulsante <b>Modifica</b> per inserire volo, alloggio, tutor e stato del contratto.</li>
            <li><b>Scheda candidato in PDF:</b> pulsante <b>Scheda</b> nell'intestazione del candidato → si apre la scheda completa (anagrafica, contatti, competenze, documenti e ultime voci di log). Premi <b>Stampa / PDF</b> per stamparla o salvarla come PDF (utile per consolati e strutture).</li>
            <li><b>Elimina candidato</b> (solo admin): dentro <b>Modifica anagrafica</b>, in basso a sinistra. Operazione non reversibile; libera anche eventuali abbinamenti di matching.</li>
            <li><b>Esporta CSV</b> (solo admin): pulsante in alto a destra nella Dashboard, scarica l'elenco candidati.</li>
            <li><b>Backup completo</b> (solo admin, in <b>Impostazioni</b>): <b>Scarica backup</b> salva candidati, richieste e impostazioni in un file; <b>Ripristina da backup</b> li ricarica (sostituisce i dati attuali). I file già caricati restano nel cloud.</li>
          </ul>
        </div>
      </section>

      <section id="dati" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="database" class="h-5 w-5 text-indigo-500"></i>8. Come vengono salvati i dati</h2>
        <p class="text-sm leading-relaxed text-slate-600">Ogni modifica viene salvata <b>automaticamente</b>: non esiste un pulsante "Salva".</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="flex items-center gap-2 text-sm font-bold text-slate-800"><i data-lucide="cloud" class="h-4 w-4 text-indigo-500"></i>Modalità cloud (consigliata)</p><p class="mt-1 text-xs text-slate-600">Con il login attivo, i dati sono salvati su Firebase Firestore in un <b>archivio condiviso dal team</b> e accessibili da qualsiasi dispositivo.</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="flex items-center gap-2 text-sm font-bold text-slate-800"><i data-lucide="hard-drive" class="h-4 w-4 text-amber-500"></i>Modalità demo locale</p><p class="mt-1 text-xs text-slate-600">Senza configurazione cloud, i dati restano solo nel browser di quel computer. Utile per formazione e prove.</p></div>
        </div>
        <h3 class="pt-2 text-base font-bold text-slate-800">8.1 · Lavoro in team e stato del salvataggio</h3>
        <p class="text-sm leading-relaxed text-slate-600">In modalità cloud l'archivio è condiviso: le modifiche di un operatore <b>arrivano in tempo reale</b> agli altri (un breve avviso segnala «dati aggiornati da un altro operatore»). Se due persone modificano <b>candidati diversi</b>, entrambe le modifiche sopravvivono; sullo <b>stesso</b> candidato vale l'ultimo salvataggio. L'<b>indicatore di stato</b> nell'header dice sempre com'è andata: <span class="font-semibold text-emerald-600">Salvato</span>, <span class="font-semibold text-amber-600">Salvataggio…</span>, <span class="font-semibold text-rose-600">NON salvato</span> (clicca per il dettaglio dell'errore e riprovare) o <b>Offline</b> (le modifiche partono da sole al ritorno della connessione).</p>
        <div class="rounded-xl border-l-4 border-slate-400 bg-slate-50 p-4 text-sm text-slate-700"><b>Backup consigliato.</b> Periodicamente, da <b>Impostazioni → Scarica backup</b>, salva una copia dell'archivio: è la tua rete di sicurezza. <b>Per l'amministratore</b>, la configurazione di database e autenticazione è nel file <code class="rounded bg-slate-200 px-1 py-0.5 font-mono text-xs">FIREBASE-SETUP.md</code>.</div>
      </section>

      <section id="faq" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="help-circle" class="h-5 w-5 text-indigo-500"></i>9. Domande frequenti</h2>
        <div class="space-y-2">
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">Perché "Avanza Fase" è grigio?</summary><p class="mt-2 text-slate-600">Mancano requisiti nella fase corrente: spunta la checklist e approva i documenti elencati sopra il pulsante.</p></details>
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">Ho approvato un documento per errore.</summary><p class="mt-2 text-slate-600">Premi <b>Respingi</b> sullo stesso documento: torna "Mancante" e l'azione resta nel log.</p></details>
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">Posso tornare a una fase precedente?</summary><p class="mt-2 text-slate-600">Il flusso è pensato per avanzare. Agisci su documenti/checklist e annota la motivazione nel log; per casi particolari contatta l'amministratore.</p></details>
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">Perché un candidato non compare nella rosa del matching?</summary><p class="mt-2 text-slate-600">O è già abbinato a un'altra richiesta (rimuovi prima quell'abbinamento con la ✕), oppure è in fase 8–9 / percorso concluso, quindi non è più disponibile per nuovi abbinamenti.</p></details>
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">Perché non posso spuntare la checklist, caricare/approvare documenti o avanzare la fase?</summary><p class="mt-2 text-slate-600">La fase appartiene all'altro team (l'avviso azzurro indica quale): le fasi 1–4 le lavora il Team Rep. Dominicana, le 5–9 il Team Italia. Su quelle fasi restano in sola lettura anche i <b>documenti</b> (niente Carica/Approva/Respingi). Gli amministratori e gli operatori senza team non hanno limitazioni.</p></details>
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">L'indicatore in alto è rosso «NON salvato»: cosa faccio?</summary><p class="mt-2 text-slate-600">Il salvataggio sul cloud non è riuscito (spesso è la connessione). Le modifiche restano su questo dispositivo: <b>clicca l'indicatore</b> per vedere l'errore e far ripartire subito il salvataggio. Quando torna verde è tutto sincronizzato.</p></details>
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">Cosa fa "Ripristina"?</summary><p class="mt-2 text-slate-600">Riporta ai profili demo e cancella le modifiche locali: esiste <b>solo in modalità demo</b>. In modalità cloud è nascosto, per non cancellare i dati reali del team; per una copia di sicurezza usa <b>Impostazioni → Scarica backup</b>.</p></details>
        </div>
      </section>

      <section id="glossario" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="book-marked" class="h-5 w-5 text-indigo-500"></i>10. Glossario</h2>
        <div class="overflow-hidden rounded-xl border border-slate-200"><table class="w-full text-sm"><tbody class="divide-y divide-slate-100 align-top">
          <tr><td class="px-4 py-2.5 w-48 font-semibold text-slate-700">OPI</td><td class="px-4 py-2.5 text-slate-600">Ordine delle Professioni Infermieristiche: l'albo per esercitare in Italia.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Traduzione asseverata</td><td class="px-4 py-2.5 text-slate-600">Traduzione giurata con valore legale in Italia.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Legalizzazione / Apostille</td><td class="px-4 py-2.5 text-slate-600">Certificazione che rende valido in Italia un documento straniero.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Nulla osta</td><td class="px-4 py-2.5 text-slate-600">Autorizzazione al lavoro dello Sportello Unico Immigrazione (SUI).</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Decreto di riconoscimento</td><td class="px-4 py-2.5 text-slate-600">Provvedimento che riconosce il titolo estero di infermiere.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">SLA</td><td class="px-4 py-2.5 text-slate-600">Tempo massimo previsto per una fase; superarlo accende il semaforo.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Matching</td><td class="px-4 py-2.5 text-slate-600">Incrocio tra le richieste delle strutture sanitarie e le competenze/specializzazioni dei candidati registrate nel gestionale.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Una tantum / Operativo</td><td class="px-4 py-2.5 text-slate-600">Accordi quadro stipulati una sola volta (agenzie, alloggi, aziende, professionisti) vs attività ripetute per ogni candidato.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Audit trail</td><td class="px-4 py-2.5 text-slate-600">Registro tracciabile di tutte le azioni e comunicazioni.</td></tr>
        </tbody></table></div>
      </section>

      <footer class="border-t border-slate-200 pt-6 text-center text-xs text-slate-400">DHL Nurses · Manuale Operatore v1.1 — Documento ad uso interno del personale HR.</footer>
    `;
  }

  function manualBodyEN() {
    return `
      <div class="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-indigo-900 p-7 text-white shadow-sm">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-inset ring-white/20"><i data-lucide="book-open" class="h-3.5 w-3.5"></i>Operator Manual</span>
        <h2 class="mt-3 text-2xl font-extrabold">How to use DHL Nurses</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-300">A practical guide for HR staff and operators following the transfer of nurses from the Dominican Republic to Italian healthcare facilities. It explains every screen, button and daily procedure.</p>
      </div>

      <section id="intro" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="info" class="h-5 w-5 text-indigo-500"></i>1. Introduction</h2>
        <p class="text-sm leading-relaxed text-slate-600">DHL Nurses tracks each nurse candidate along the entire path: from selection in the Dominican Republic to placement and support in an Italian facility. Each candidate is a <b>case</b> that goes through <b>9 sequential phases</b>, split between two teams: the <b>Dominican Republic Team</b> (phases 1–4, up to departure) and the <b>Italy Team</b> (phases 5–9, from arrival onwards). The system prevents skipping steps and flags overdue cases.</p>
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-xl border border-slate-200 bg-white p-4"><i data-lucide="layout-dashboard" class="h-5 w-5 text-indigo-500"></i><p class="mt-2 text-sm font-bold text-slate-800">Analytics Dashboard</p><p class="mt-1 text-xs text-slate-500">The overview: key numbers and alerts.</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><i data-lucide="folder-kanban" class="h-5 w-5 text-indigo-500"></i><p class="mt-2 text-sm font-bold text-slate-800">Case Management</p><p class="mt-1 text-xs text-slate-500">Work on a single candidate.</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><i data-lucide="graduation-cap" class="h-5 w-5 text-indigo-500"></i><p class="mt-2 text-sm font-bold text-slate-800">Interactive guide</p><p class="mt-1 text-xs text-slate-500">The spotlight tour inside the app ("Guide" button).</p></div>
        </div>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-800"><b>Tip.</b> On first access the interactive <b>Guide</b> starts automatically. You can relaunch it any time from the <span class="font-semibold">🎓 Guide</span> button (you can now step through it with the <b>← → arrow keys</b>). This manual complements it with detailed procedures.</div>
        <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-emerald-800"><i data-lucide="sparkles" class="h-4 w-4"></i>What's new in this version</p>
          <ul class="prose-list mt-2 ml-5 list-disc text-sm text-emerald-900/80">
            <li><b>Real-time saving with a status indicator</b> in the header (☁︎ Saved / Saving… / NOT saved / Offline): with several operators on the same archive, everyone's changes arrive at once and an alert flags when a cloud save fails (§8).</li>
            <li><b>Matching request alerts:</b> a message appears when a request is created and when it becomes fully staffed (§6.1).</li>
            <li><b>Printable candidate sheet (PDF):</b> the <b>Sheet</b> button in the candidate header (§7).</li>
            <li><b>Data backup</b> (Settings, admin only): export and restore the whole archive from a file (§8).</li>
            <li><b>Passport and cédula expiry</b> now also flagged on the Dashboard, not just in the record (§4.3).</li>
            <li><b>Extended case search</b> — also by agency, HR referent, birthplace and specialisations (§5.1).</li>
            <li><b>Documents locked</b> on the other team's phases, like the checklist and "Advance Phase" (§9).</li>
          </ul>
        </div>
      </section>

      <section id="accesso" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="log-in" class="h-5 w-5 text-indigo-500"></i>2. Access & operator profile</h2>
        <p class="text-sm leading-relaxed text-slate-600">When the app opens, the sign-in screen appears. Each operator works with their own account: data is <b>isolated and protected</b>.</p>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-800"><b>Prerequisite.</b> To get in, your email must appear in <b>Settings → HR Operators</b>: that list decides who accesses and with which role/team. The administrator can also create your account directly from the <b>🔑 Create account</b> button on your operator record, handing you a temporary password.</div>
        <ol class="prose-list ml-5 list-decimal text-sm text-slate-600">
          <li><b>Account created by the administrator:</b> sign in with your record's email and the temporary password you received, then change it from your profile (top-right avatar) or with "Forgot password?".</li>
          <li><b>Self sign-up:</b> alternatively press <b>Sign up</b> using the <b>same email</b> as your operator record and a password of your choice (min 6 characters).</li>
          <li><b>Google sign-in:</b> press <b>Continue with Google</b> with the Google account holding that email — no password to manage.</li>
          <li><b>Later access:</b> email and password, then <b>Sign in</b>; if you forgot it use <b>"Forgot password?"</b> under the password field.</li>
          <li><b>Sign out:</b> top right, press <b>Sign out</b> when you finish.</li>
        </ol>
        <h3 id="profilo-operatore" class="pt-2 text-base font-bold text-slate-800">2.1 · Your operator profile</h3>
        <p class="text-sm leading-relaxed text-slate-600">Top right, click your <b>avatar</b> (the circle with your initial) to open the <b>Operator Profile</b>. From here you can:</p>
        <ul class="prose-list ml-5 list-disc text-sm text-slate-600">
          <li><b>Edit the display name</b>: type the name and press <b>Save name</b>.</li>
          <li><b>View account data</b>: email, sign-in method, creation date and last access.</li>
          <li><b>Reset the password</b> (email/password accounts only) via email.</li>
          <li><b>Sign out</b> directly from the card.</li>
        </ul>
        <div class="rounded-xl border-l-4 border-slate-400 bg-slate-50 p-4 text-sm text-slate-700"><b>In local demo mode</b> there is no cloud account: the profile card only lets you set the <b>operator name</b> saved on this computer.</div>
      </section>

      <section id="interfaccia" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="panels-top-left" class="h-5 w-5 text-indigo-500"></i>3. The interface</h2>
        <p class="text-sm leading-relaxed text-slate-600">The top bar is always present. From left to right:</p>
        <div class="overflow-hidden rounded-xl border border-slate-200"><table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400"><tr><th class="px-4 py-2">Element</th><th class="px-4 py-2">Purpose</th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Dashboard / Cases / Matching / Documents / Settings</td><td class="px-4 py-2.5 text-slate-600">The views: overview, single-candidate work, facility requests and demand–supply matching, document archive, and (admin only) base records.</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">"At risk" badge</td><td class="px-4 py-2.5 text-slate-600">Counts cases stuck beyond expected times. Click it to open the at-risk list. Green = no risk.</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Theme toggle</td><td class="px-4 py-2.5 text-slate-600">Switch between light and dark mode.</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">IT · EN · ES</td><td class="px-4 py-2.5 text-slate-600">Change the interface language.</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Manual / Guide</td><td class="px-4 py-2.5 text-slate-600">This document / the interactive spotlight tour (navigable with the ← → arrow keys).</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Save status</td><td class="px-4 py-2.5 text-slate-600">Cloud mode only: ☁︎ green = saved, amber = saving, <b>red = not saved</b> (click for details and retry), grey = offline.</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Reset</td><td class="px-4 py-2.5 text-slate-600">Restores the demo profiles. <b>Local demo mode only</b> (hidden in cloud mode so it can't wipe the team's data).</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Avatar / Sign out</td><td class="px-4 py-2.5 text-slate-600">Operator profile and session sign-out.</td></tr>
          </tbody>
        </table></div>
      </section>

      <section id="dashboard" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="layout-dashboard" class="h-5 w-5 text-indigo-500"></i>4. Analytics Dashboard</h2>
        <p class="text-sm leading-relaxed text-slate-600">The first screen: to understand the overall workload <b>in seconds</b>.</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">4.1 · Transfer Summary</h3>
        <p class="text-sm leading-relaxed text-slate-600">At the top you get the most-asked figures at a glance: <b>how many nurses we are handling</b>, how many have been <b>transferred to Italy</b>, and how many <b>still have to be transferred</b>. The relationship always holds: <b>Under Management = Transferred + To Transfer</b>.</p>
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-sm font-bold text-slate-800">Under Management</p><p class="mt-1 text-xs text-slate-500">Total nurses we are handling (all existing cases).</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-sm font-bold text-slate-800">Transferred</p><p class="mt-1 text-xs text-slate-500">Already in Italy: <b>Italy Team</b> phases (5–9) or path completed.</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-sm font-bold text-slate-800">To Transfer</p><p class="mt-1 text-xs text-slate-500">Still with the <b>Dominican Republic Team</b> (phases 1–4).</p></div>
        </div>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-800"><b>Tip.</b> Each tile is <b>clickable</b>: it opens <b>Case Management</b> already filtered (e.g. "Transferred" shows only those who departed).</div>
        <h3 class="pt-2 text-base font-bold text-slate-800">4.2 · Key indicators (KPI)</h3>
        <p class="text-sm leading-relaxed text-slate-600"><b>All KPIs are clickable</b> and open the corresponding section already filtered: Active Cases, Missing Documents, In Matching, Expiring Docs, <b>Requests to Fulfil</b> (open facility requests, with the seats left to cover) and <b>Requests Fulfilled</b> (both open the Matching view), Paths Completed.</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">4.3 · Risk alerts &amp; expiries</h3>
        <p class="text-sm leading-relaxed text-slate-600">Lists cases stuck <b>too long</b> in their current state, plus a panel of <b>expiring/expired documents</b>. <b>Action:</b> click a row to open the case; the "Expiring Docs" KPI opens the filtered archive.</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">4.4 · Candidates per facility</h3>
        <p class="text-sm leading-relaxed text-slate-600">Shows how many candidates are assigned to each employer and how many have completed the path, plus the distribution across the 9 phases, grouped by team.</p>
      </section>

      <section id="pratiche" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="folder-kanban" class="h-5 w-5 text-indigo-500"></i>5. Case Management</h2>
        <p class="text-sm leading-relaxed text-slate-600">The daily work. On the left the <b>candidate list</b>, on the right the <b>full file</b>.</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">5.1 · List and search</h3>
        <ul class="prose-list ml-5 list-disc text-sm text-slate-600">
          <li><b>Search:</b> by name, passport, destination facility, <b>partner agency, HR referent, birthplace and specialisations</b>.</li>
          <li><b>Status filters:</b> All, <b>Transferred</b>, <b>To transfer</b>, At risk, Missing Docs, In progress, Italy Phase, Completed. Coming from a KPI (e.g. "In Matching") a temporary highlighted filter appears, with an ✕ to clear it.</li>
          <li><b>"My team" filter:</b> if your profile in <b>Settings → HR Operators</b> has a Team assigned (Dominican Republic or Italy), a dedicated filter appears showing only candidates in your team's phases. Matching is done via the sign-in email (or the operator name in demo mode).</li>
          <li><b>Card:</b> shows the status badge, language level and phase. The ⏰ icon flags a delay risk.</li>
        </ul>
        <h3 class="pt-2 text-base font-bold text-slate-800">5.2 · The stepper (9 phases · 2 teams)</h3>
        <p class="text-sm leading-relaxed text-slate-600">Above the timeline, two bands show the team in charge: <b>🇩🇴 Dominican Republic Team</b> (phases 1–4) and <b>🇮🇹 Italy Team</b> (phases 5–9). Circle colours: <span class="font-semibold text-emerald-600">green</span> = completed, <span class="font-semibold text-indigo-600">indigo</span> = current, <span class="font-semibold text-amber-600">amber</span> = blocked, grey = to do.</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">5.3 · The "Advance Phase" button</h3>
        <p class="text-sm leading-relaxed text-slate-600">Moves the case to the next phase. It <b>unlocks only</b> when the current phase's checklist and documents are satisfied; otherwise the missing requirements are listed above the button.</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">5.4 · Documents, checklist, logistics, log</h3>
        <ul class="prose-list ml-5 list-disc text-sm text-slate-600">
          <li><b>Documents:</b> statuses Approved / Under Review / Missing; actions Upload, Approve, Reject, Add.</li>
          <li><b>Checklist:</b> mandatory tasks for the current phase, changing on each advance.</li>
          <li><b>Logistics &amp; HR Onboarding:</b> flight, housing, tutor, contract.</li>
          <li><b>Log &amp; audit trail:</b> notes, calls and alerts with date and author.</li>
        </ul>
      </section>

      <section id="workflow" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="route" class="h-5 w-5 text-indigo-500"></i>6. The 9 phases &amp; the 2 teams</h2>
        <p class="text-sm leading-relaxed text-slate-600">The project is organised around a clear geographical and operational split. The <b>Dominican Republic Team</b> follows the candidate up to departure (phases 1–4); the <b>Italy Team</b> takes over on arrival, handling logistics, job matching and stability (phases 5–9). Coordination happens through the constant update of documents and checklists in the app.</p>
        <div class="overflow-hidden rounded-xl border border-slate-200"><table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400"><tr><th class="px-3 py-2 w-10">#</th><th class="px-3 py-2">Phase</th><th class="px-3 py-2">What to do</th></tr></thead>
          <tbody class="divide-y divide-slate-100 align-top">
            <tr class="bg-sky-50"><td colspan="3" class="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-sky-700">🇩🇴 Dominican Republic Team — from selection to departure</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-sky-600">1</td><td class="px-3 py-2.5 font-medium text-slate-700">Selection &amp; Recruitment</td><td class="px-3 py-2.5 text-slate-600">Only government-recognised structures; verify nursing skills and specialisations, personal data, language assessment.</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-sky-600">2</td><td class="px-3 py-2.5 font-medium text-slate-700">Document Management</td><td class="px-3 py-2.5 text-slate-600">The crucial phase, run through the app: sworn-translated qualifications, apostille, Ministry recognition, clearance, visa and OPI registration. You cannot advance until every required document is uploaded and approved.</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-sky-600">3</td><td class="px-3 py-2.5 font-medium text-slate-700">Training</td><td class="px-3 py-2.5 text-slate-600">Digital content and meetings (online or in person) based on the «Italia in tasca» model, with direct support along the way.</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-sky-600">4</td><td class="px-3 py-2.5 font-medium text-slate-700">Travel Arrangements</td><td class="px-3 py-2.5 text-slate-600">Flight ticket purchase and transfer to the airport in the Dominican Republic.</td></tr>
            <tr class="bg-emerald-50"><td colspan="3" class="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-emerald-700">🇮🇹 Italy Team — from arrival to full integration</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-emerald-600">5</td><td class="px-3 py-2.5 font-medium text-slate-700">Arrival in Italy</td><td class="px-3 py-2.5 text-slate-600">Airport welcome and transfer to the assigned housing.</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-emerald-600">6</td><td class="px-3 py-2.5 font-medium text-slate-700">Housing &amp; Services</td><td class="px-3 py-2.5 text-slate-600">Individual housing contract (under the framework agreements already in place), services activation, residence permit.</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-emerald-600">7</td><td class="px-3 py-2.5 font-medium text-slate-700">Matching</td><td class="px-3 py-2.5 text-slate-600">Receive facility requests and match them precisely with the skills and specialisations loaded by the Dominican team: the placement is tailored to the ward, not generic.</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-emerald-600">8</td><td class="px-3 py-2.5 font-medium text-slate-700">Employment</td><td class="px-3 py-2.5 text-slate-600">Identify the employer, sign the contract, manage the ongoing relationship (disputes, company welfare).</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-emerald-600">9</td><td class="px-3 py-2.5 font-medium text-slate-700">Tutoring &amp; Support</td><td class="px-3 py-2.5 text-slate-600">Tutor, socio-cultural services and legal/tax assistance at agreed conditions for non-work matters.</td></tr>
          </tbody>
        </table></div>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-800"><b>One-off vs operational.</b> Some team activities are <b>one-off</b> framework agreements (recognised agencies, housing contracts, pre-contracted employers, legal/tax professionals) and don't appear in a candidate's checklist: the checklist only contains the <b>operational</b> tasks repeated for each case.</div>
        <h3 class="pt-2 text-base font-bold text-slate-800">6.1 · The technical matching protocol</h3>
        <p class="text-sm leading-relaxed text-slate-600">The app is the project's <b>single source of truth</b>: the <b>Dominican team enters and qualifies</b> the data (the candidate's verified clinical specialisations, sworn documentation, «Italia in tasca» dossier), while the <b>Italy team queries and extracts</b> (receives facility needs, filters the database by skills, matches the eligible profile and monitors its compliance).</p>
        <ul class="prose-list ml-5 list-disc text-sm text-slate-600">
          <li><b>Candidate specialisations:</b> ticked from the catalogue in <b>Edit details</b> (Skills section); the catalogue is managed in <b>Settings → Specialisations</b>.</li>
          <li><b>Facility requests:</b> in the <b>Matching</b> view, "New Request" records the destination ward, the number of nurses requested, minimum skills, preferred specialisations and shift; the request becomes "Matched" once every position is covered. An <b>alert</b> automatically flags when a request is created and when it becomes fully staffed — even if the action comes from another operator.</li>
          <li><b>Matching:</b> "Find candidates" ranks the profiles by compatibility (query → shortlist → document validation) and "Match" finalises the proposal: the candidate's employer is updated and everything is tracked in the log.</li>
        </ul>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="text-sm font-bold text-slate-800">How the shortlist is built</p>
          <ul class="prose-list mt-2 ml-5 list-disc text-sm text-slate-600">
            <li><b>Who enters:</b> every candidate not yet matched to another request and not beyond phase 7 (anyone already in Employment or completed is excluded). The phase is not a requirement: you can "reserve" someone still in training.</li>
            <li><b>Eligible or partial:</b> a profile is <span class="font-semibold text-emerald-600">Eligible</span> only if it holds <b>all</b> the request's minimum skills; otherwise it is <span class="font-semibold text-amber-600">Partial</span>. The system informs but does not decide: the final choice stays with the operator.</li>
            <li><b>Ranking:</b> eligible profile = 100 base points (a partial one reaches at most 60, proportional to the minimum skills held); <b>+8</b> per preferred specialisation; <b>+5</b> if the «Italia in tasca» dossier is validated; <b>+4</b> if every required document is approved; ties favour whoever is further along the phases (operational sooner).</li>
            <li><b>Validation badges:</b> under each name you see skills x/y, preferred x/y, documents complete/incomplete and dossier validated/missing — the protocol's "validation" at a glance.</li>
            <li><b>Request states:</b> it is born <b>Open</b>; assignments raise the counter (e.g. "1/3 matched") and at full headcount it becomes <b>Matched</b>; once contracts are signed you <b>Close</b> it. The ✕ on a single assignee removes them (logged) and reopens the request.</li>
            <li><b>What it does NOT do:</b> matching neither advances the candidate's phases nor removes them from the pipeline: the path continues normally with checklists and "Advance Phase".</li>
          </ul>
        </div>
      </section>

      <section id="procedure" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="list-checks" class="h-5 w-5 text-indigo-500"></i>7. Using the app step by step</h2>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4">
          <p class="text-sm font-bold text-indigo-800">The full flow in 6 steps</p>
          <ol class="prose-list mt-1 ml-5 list-decimal text-sm text-indigo-900/80">
            <li><b>Sign in</b> with your account.</li><li><b>Create the candidate</b> record (procedure 1).</li>
            <li><b>Add and approve documents</b> (procedures 2 and 3).</li><li><b>Tick the checklist</b> for the current phase.</li>
            <li><b>Advance the phase</b> when the button unlocks (procedure 4).</li><li><b>Log communications</b> and watch the risk alerts (5 and 6).</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">1</span>Create a new candidate</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Go to the <b>Case Management</b> view.</li>
            <li>At the top of the list, press <b>New Candidate</b>.</li>
            <li>Fill in the fields. <b>Name and Passport</b> are required (*); the agency, employer and HR contact are chosen from the lists managed in <b>Settings</b>. The system checks the <b>email</b> is well-formed and that the <b>passport</b> isn't already registered to another candidate.</li>
            <li>Press <b>Create candidate</b>: the case opens at phase <b>1 · Selection &amp; Recruitment</b> with the standard documents prepared.</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">2</span>Add documents</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Open the <b>Document Lifecycle</b> section.</li>
            <li>Press <b>Add</b> at the top right of the table.</li>
            <li>Enter the name (required), language (ES/IT) and validity if known.</li>
            <li>Press <b>Add</b>: the document appears as <span class="font-semibold text-rose-600">Missing</span>.</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">3</span>Upload and approve a document</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Find the <span class="font-semibold text-rose-600">Missing</span> rows.</li>
            <li>Press <b>Upload</b> → <span class="font-semibold text-amber-600">Under Review</span>.</li>
            <li>Press <b>Approve</b> → <span class="font-semibold text-emerald-600">Approved</span> (or <b>Reject</b>).</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">4</span>Advance a case</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Tick the <b>Checklist</b> for the current phase.</li><li>Check the required documents are <b>Approved</b>.</li>
            <li>Complete any <b>missing requirements</b> listed.</li><li>Press <b>Advance Phase</b>.</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">5</span>Log a call or note</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Go to "Communication Log".</li><li>Type the text, choose <b>Call</b>/Note/Alert and press <b>Log</b>.</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">6</span>Handle a red alert</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>From the Dashboard (or the "At risk" badge), open the flagged case.</li><li>Identify the block and contact the agency/candidate.</li>
            <li><b>Log the call</b> and update documents/checklist: the day counter resets.</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">7</span>Manage a request and match candidates (Italy Team)</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Go to the <b>Matching</b> view and press <b>New Request</b>.</li>
            <li>Fill in facility and ward (required), the <b>number of nurses requested</b>, minimum skills, preferred ones and shift, then <b>Save</b>.</li>
            <li>Press <b>Find candidates</b> and read the shortlist: "Eligible profile" on top, validation badges under each name.</li>
            <li>Press <b>Match</b> on the chosen candidate and confirm: employer updated and log written. Repeat until the counter reaches full headcount (e.g. "3/3 matched" → request <b>Matched</b>).</li>
            <li>Once contracts are signed press <b>Close request</b>. To fix a mistake use the ✕ on the single assignee.</li>
          </ol>
        </div>

        <div class="rounded-xl border-l-4 border-emerald-400 bg-emerald-50 p-4">
          <p class="text-sm font-bold text-emerald-800">Other useful features</p>
          <ul class="prose-list mt-1 ml-5 list-disc text-sm text-emerald-900/80">
            <li><b>Upload a file:</b> in the documents table press <b>Upload</b> → your computer's file picker opens (PDF, photo, scan). The file stays attached and the button becomes <b>Replace</b>.</li>
            <li><b>Document Archive</b> (<b>Documents</b> tab): find <b>all</b> documents of all candidates, with search and filters. Click <b>View</b> for an in-app <b>preview</b> of images and PDFs.</li>
            <li><b>Expiry:</b> documents with a validity date are flagged <span class="font-semibold text-amber-600">Expiring</span> (within 60 days) or <span class="font-semibold text-rose-600">Expired</span>. Use the <b>Expiring</b> filter in the archive.</li>
            <li><b>Edit details:</b> the <b>Edit details</b> button on the candidate header to correct the data.</li>
            <li><b>Logistics &amp; Onboarding:</b> the <b>Edit</b> button to enter flight, housing, tutor and contract status.</li>
            <li><b>Candidate sheet (PDF):</b> the <b>Sheet</b> button in the candidate header opens the full sheet (profile, contacts, skills, documents and latest log entries). Press <b>Print / PDF</b> to print or save it as PDF (handy for consulates and facilities).</li>
            <li><b>Delete candidate</b> (admin only): inside <b>Edit details</b>, bottom-left. This cannot be undone; it also frees any matching assignments.</li>
            <li><b>Export CSV</b> (admin only): button at the top-right of the Dashboard, downloads the candidate list.</li>
            <li><b>Full backup</b> (admin only, in <b>Settings</b>): <b>Download backup</b> saves candidates, requests and settings to a file; <b>Restore from backup</b> loads them back (replacing current data). Uploaded files stay in the cloud.</li>
          </ul>
        </div>
      </section>

      <section id="dati" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="database" class="h-5 w-5 text-indigo-500"></i>8. How data is stored</h2>
        <p class="text-sm leading-relaxed text-slate-600">Every change is saved <b>automatically</b>: there is no "Save" button.</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="flex items-center gap-2 text-sm font-bold text-slate-800"><i data-lucide="cloud" class="h-4 w-4 text-indigo-500"></i>Cloud mode (recommended)</p><p class="mt-1 text-xs text-slate-600">With login active, data is stored on Firebase Firestore in a <b>team-shared archive</b> and accessible from any device.</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="flex items-center gap-2 text-sm font-bold text-slate-800"><i data-lucide="hard-drive" class="h-4 w-4 text-amber-500"></i>Local demo mode</p><p class="mt-1 text-xs text-slate-600">Without cloud setup, data stays only in that computer's browser. Useful for training and trials.</p></div>
        </div>
        <h3 class="pt-2 text-base font-bold text-slate-800">8.1 · Teamwork and save status</h3>
        <p class="text-sm leading-relaxed text-slate-600">In cloud mode the archive is shared: one operator's changes arrive at the others <b>in real time</b> (a brief notice flags "data updated by another operator"). If two people edit <b>different candidates</b>, both changes survive; on the <b>same</b> candidate the last save wins. The <b>status indicator</b> in the header always tells you how it went: <span class="font-semibold text-emerald-600">Saved</span>, <span class="font-semibold text-amber-600">Saving…</span>, <span class="font-semibold text-rose-600">NOT saved</span> (click for the error detail and to retry) or <b>Offline</b> (changes go out on their own when the connection returns).</p>
        <div class="rounded-xl border-l-4 border-slate-400 bg-slate-50 p-4 text-sm text-slate-700"><b>Backup recommended.</b> Periodically, from <b>Settings → Download backup</b>, save a copy of the archive: it's your safety net. <b>For the administrator</b>, database and authentication setup is in the <code class="rounded bg-slate-200 px-1 py-0.5 font-mono text-xs">FIREBASE-SETUP.md</code> file.</div>
      </section>

      <section id="faq" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="help-circle" class="h-5 w-5 text-indigo-500"></i>9. FAQ</h2>
        <div class="space-y-2">
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">Why is "Advance Phase" greyed out?</summary><p class="mt-2 text-slate-600">Requirements are missing in the current phase: tick the checklist and approve the documents listed above the button.</p></details>
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">I approved a document by mistake.</summary><p class="mt-2 text-slate-600">Press <b>Reject</b> on the same document: it returns to "Missing" and the action stays in the log.</p></details>
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">Can I go back to a previous phase?</summary><p class="mt-2 text-slate-600">The flow is designed to advance. Act on documents/checklist and note the reason in the log; for special cases contact the administrator.</p></details>
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">Why doesn't a candidate appear in the matching shortlist?</summary><p class="mt-2 text-slate-600">Either they are already matched to another request (remove that assignment first with the ✕), or they are in phase 8–9 / completed, so no longer available for new assignments.</p></details>
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">Why can't I tick the checklist, upload/approve documents or advance the phase?</summary><p class="mt-2 text-slate-600">The phase belongs to the other team (the blue notice says which): phases 1–4 are worked by the Dominican Republic Team, 5–9 by the Italy Team. On those phases the <b>documents</b> are read-only too (no Upload/Approve/Reject). Administrators and operators without a team have no restrictions.</p></details>
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">The header indicator is red "NOT saved": what do I do?</summary><p class="mt-2 text-slate-600">The cloud save failed (often the connection). Your changes stay on this device: <b>click the indicator</b> to see the error and restart the save right away. When it turns green everything is synced.</p></details>
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">What does "Reset" do?</summary><p class="mt-2 text-slate-600">Restores the demo profiles and discards local changes: it exists <b>only in demo mode</b>. In cloud mode it is hidden so it can't wipe the team's real data; for a safety copy use <b>Settings → Download backup</b>.</p></details>
        </div>
      </section>

      <section id="glossario" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="book-marked" class="h-5 w-5 text-indigo-500"></i>10. Glossary</h2>
        <div class="overflow-hidden rounded-xl border border-slate-200"><table class="w-full text-sm"><tbody class="divide-y divide-slate-100 align-top">
          <tr><td class="px-4 py-2.5 w-48 font-semibold text-slate-700">OPI</td><td class="px-4 py-2.5 text-slate-600">Order of Nursing Professions: the register a nurse must join to practise in Italy.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Sworn translation</td><td class="px-4 py-2.5 text-slate-600">An official certified translation with legal value in Italy.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Legalisation / Apostille</td><td class="px-4 py-2.5 text-slate-600">Certification that makes a foreign document valid in Italy.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Clearance (nulla osta)</td><td class="px-4 py-2.5 text-slate-600">Work authorisation issued by the Immigration One-Stop Desk.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Recognition decree</td><td class="px-4 py-2.5 text-slate-600">The act recognising the foreign nursing qualification.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">SLA</td><td class="px-4 py-2.5 text-slate-600">Maximum expected time for a phase; exceeding it triggers the risk alert.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Matching</td><td class="px-4 py-2.5 text-slate-600">Crossing facility requests with the candidates' skills and specialisations recorded in the app.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">One-off / Operational</td><td class="px-4 py-2.5 text-slate-600">Framework agreements signed once (agencies, housing, employers, professionals) vs tasks repeated for each candidate.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Audit trail</td><td class="px-4 py-2.5 text-slate-600">Traceable chronological record of all actions and communications.</td></tr>
        </tbody></table></div>
      </section>

      <footer class="border-t border-slate-200 pt-6 text-center text-xs text-slate-400">DHL Nurses · Operator Manual v1.1 — Internal document for HR staff.</footer>
    `;
  }

  function manualBodyES() {
    return `
      <div class="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-indigo-900 p-7 text-white shadow-sm">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-inset ring-white/20"><i data-lucide="book-open" class="h-3.5 w-3.5"></i>Manual del Operador</span>
        <h2 class="mt-3 text-2xl font-extrabold">Cómo usar DHL Nurses</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-300">Guía práctica para el personal de RR.HH. y los operadores que siguen el traslado de enfermeros desde la República Dominicana a las estructuras sanitarias italianas. Explica cada pantalla, botón y procedimiento diario.</p>
      </div>

      <section id="intro" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="info" class="h-5 w-5 text-indigo-500"></i>1. Introducción</h2>
        <p class="text-sm leading-relaxed text-slate-600">DHL Nurses sigue a cada candidato enfermero a lo largo de todo el recorrido: desde la selección en la República Dominicana hasta la inserción y la asistencia en una estructura italiana. Cada candidato es un <b>expediente</b> que atraviesa <b>9 fases secuenciales</b>, divididas entre dos equipos: el <b>Equipo República Dominicana</b> (fases 1–4, hasta la partida) y el <b>Equipo Italia</b> (fases 5–9, desde la llegada). El sistema impide saltar pasos y señala los expedientes con retraso.</p>
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-xl border border-slate-200 bg-white p-4"><i data-lucide="layout-dashboard" class="h-5 w-5 text-indigo-500"></i><p class="mt-2 text-sm font-bold text-slate-800">Panel Analítico</p><p class="mt-1 text-xs text-slate-500">La visión global: cifras clave y alertas.</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><i data-lucide="folder-kanban" class="h-5 w-5 text-indigo-500"></i><p class="mt-2 text-sm font-bold text-slate-800">Gestión de Expedientes</p><p class="mt-1 text-xs text-slate-500">Trabajo sobre un candidato.</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><i data-lucide="graduation-cap" class="h-5 w-5 text-indigo-500"></i><p class="mt-2 text-sm font-bold text-slate-800">Guía interactiva</p><p class="mt-1 text-xs text-slate-500">El tour con foco dentro de la app (botón "Guía").</p></div>
        </div>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-800"><b>Sugerencia.</b> En el primer acceso la <b>Guía</b> interactiva se inicia automáticamente. Puedes relanzarla en cualquier momento desde el botón <span class="font-semibold">🎓 Guía</span> (ahora también se recorre con las <b>flechas ← → del teclado</b>). Este manual la completa con procedimientos detallados.</div>
        <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-emerald-800"><i data-lucide="sparkles" class="h-4 w-4"></i>Novedades de esta versión</p>
          <ul class="prose-list mt-2 ml-5 list-disc text-sm text-emerald-900/80">
            <li><b>Guardado en tiempo real con indicador de estado</b> en la cabecera (☁︎ Guardado / Guardando… / NO guardado / Sin conexión): con varios operadores en el mismo archivo, los cambios de cada uno llegan enseguida a los demás y un aviso señala cuando el guardado en la nube falla (§8).</li>
            <li><b>Avisos de solicitudes de matching:</b> aparece un mensaje cuando se crea una solicitud y cuando la plantilla se completa (§6.1).</li>
            <li><b>Ficha del candidato imprimible (PDF):</b> botón <b>Ficha</b> en la cabecera del candidato (§7).</li>
            <li><b>Copia de seguridad</b> (Ajustes, solo admin): exporta y restaura todo el archivo desde un fichero (§8).</li>
            <li><b>Vencimientos de pasaporte y cédula</b> ahora también señalados en el Panel, no solo en la ficha (§4.3).</li>
            <li><b>Búsqueda de expedientes ampliada</b> también por agencia, referente de RR.HH., lugar de nacimiento y especializaciones (§5.1).</li>
            <li><b>Documentos bloqueados</b> en las fases del otro equipo, como la checklist y «Avanzar Fase» (§9).</li>
          </ul>
        </div>
      </section>

      <section id="accesso" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="log-in" class="h-5 w-5 text-indigo-500"></i>2. Acceso y perfil del operador</h2>
        <p class="text-sm leading-relaxed text-slate-600">Al abrir la app aparece la pantalla de acceso. Cada operador trabaja con su propia cuenta: los datos están <b>aislados y protegidos</b>.</p>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-800"><b>Requisito previo.</b> Para entrar, tu correo debe aparecer en <b>Ajustes → Operadores RR.HH.</b>: esa lista decide quién accede y con qué rol/equipo. El administrador también puede crearte la cuenta directamente con el botón <b>🔑 Crear cuenta</b> de tu ficha de operador, entregándote una contraseña provisional.</div>
        <ol class="prose-list ml-5 list-decimal text-sm text-slate-600">
          <li><b>Cuenta creada por el administrador:</b> accede con el correo de tu ficha y la contraseña provisional recibida; luego cámbiala desde tu perfil (avatar arriba a la derecha) o con «¿Contraseña olvidada?».</li>
          <li><b>Registro autónomo:</b> como alternativa pulsa <b>Registrarse</b> usando el <b>mismo correo</b> de tu ficha de operador y una contraseña a tu elección (mín. 6 caracteres).</li>
          <li><b>Acceso con Google:</b> pulsa <b>Continuar con Google</b> con la cuenta de Google de ese correo — sin contraseñas que gestionar.</li>
          <li><b>Accesos posteriores:</b> correo y contraseña y pulsa <b>Acceder</b>; si no la recuerdas usa <b>«¿Contraseña olvidada?»</b> bajo el campo de contraseña.</li>
          <li><b>Salir:</b> arriba a la derecha, pulsa <b>Salir</b> al terminar.</li>
        </ol>
        <h3 id="profilo-operatore" class="pt-2 text-base font-bold text-slate-800">2.1 · Tu perfil de operador</h3>
        <p class="text-sm leading-relaxed text-slate-600">Arriba a la derecha, haz clic en tu <b>avatar</b> (el círculo con la inicial) para abrir el <b>Perfil del Operador</b>. Desde aquí puedes:</p>
        <ul class="prose-list ml-5 list-disc text-sm text-slate-600">
          <li><b>Modificar el nombre visible</b>: escribe el nombre y pulsa <b>Guardar nombre</b>.</li>
          <li><b>Consultar los datos de la cuenta</b>: correo, método de acceso, fecha de creación y último acceso.</li>
          <li><b>Restablecer la contraseña</b> (solo cuentas de correo/contraseña) por correo.</li>
          <li><b>Salir</b> de la sesión directamente desde la ficha.</li>
        </ul>
        <div class="rounded-xl border-l-4 border-slate-400 bg-slate-50 p-4 text-sm text-slate-700"><b>En modo demo local</b> no existe una cuenta en la nube: la ficha de perfil solo permite establecer el <b>nombre del operador</b> guardado en este ordenador.</div>
      </section>

      <section id="interfaccia" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="panels-top-left" class="h-5 w-5 text-indigo-500"></i>3. La interfaz</h2>
        <p class="text-sm leading-relaxed text-slate-600">La barra superior siempre está presente. De izquierda a derecha:</p>
        <div class="overflow-hidden rounded-xl border border-slate-200"><table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400"><tr><th class="px-4 py-2">Elemento</th><th class="px-4 py-2">Función</th></tr></thead>
          <tbody class="divide-y divide-slate-100">
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Panel / Expedientes / Matching / Documentos / Ajustes</td><td class="px-4 py-2.5 text-slate-600">Las vistas: visión global, trabajo por candidato, solicitudes de las estructuras y cruce demanda–oferta, archivo de documentos y (solo admin) registros base.</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Distintivo "en riesgo"</td><td class="px-4 py-2.5 text-slate-600">Cuenta los expedientes detenidos más de lo previsto. Haz clic para abrir la lista en riesgo. Verde = sin riesgo.</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Cambio de tema</td><td class="px-4 py-2.5 text-slate-600">Alterna entre modo claro y oscuro.</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">IT · EN · ES</td><td class="px-4 py-2.5 text-slate-600">Cambia el idioma de la interfaz.</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Manual / Guía</td><td class="px-4 py-2.5 text-slate-600">Este documento / el tour interactivo con foco (se recorre con las flechas ← →).</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Estado de guardado</td><td class="px-4 py-2.5 text-slate-600">Solo en modo nube: ☁︎ verde = guardado, ámbar = guardando, <b>rojo = no guardado</b> (clic para el detalle y reintentar), gris = sin conexión.</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Restablecer</td><td class="px-4 py-2.5 text-slate-600">Restaura los perfiles demo. <b>Solo en modo demo local</b> (en la nube está oculto para no borrar los datos del equipo).</td></tr>
            <tr><td class="px-4 py-2.5 font-medium text-slate-700">Avatar / Salir</td><td class="px-4 py-2.5 text-slate-600">Perfil del operador y cierre de sesión.</td></tr>
          </tbody>
        </table></div>
      </section>

      <section id="dashboard" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="layout-dashboard" class="h-5 w-5 text-indigo-500"></i>4. Panel Analítico</h2>
        <p class="text-sm leading-relaxed text-slate-600">La primera pantalla: para entender la carga de trabajo general <b>en segundos</b>.</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">4.1 · Resumen de Traslados</h3>
        <p class="text-sm leading-relaxed text-slate-600">Arriba tienes de un vistazo las cifras más consultadas: <b>cuántos enfermeros estamos gestionando</b>, cuántos han sido <b>trasladados a Italia</b> y cuántos <b>aún deben trasladarse</b>. Siempre se cumple: <b>En Gestión = Trasladados + Por Trasladar</b>.</p>
        <div class="grid gap-3 sm:grid-cols-3">
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-sm font-bold text-slate-800">En Gestión</p><p class="mt-1 text-xs text-slate-500">Total de enfermeros que seguimos (todos los expedientes).</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-sm font-bold text-slate-800">Trasladados</p><p class="mt-1 text-xs text-slate-500">Ya en Italia: fases del <b>Equipo Italia</b> (5–9) o proceso completado.</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="text-sm font-bold text-slate-800">Por Trasladar</p><p class="mt-1 text-xs text-slate-500">Todavía con el <b>Equipo Rep. Dominicana</b> (fases 1–4).</p></div>
        </div>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-800"><b>Consejo.</b> Cada recuadro es <b>clicable</b>: abre <b>Gestión de Expedientes</b> ya filtrado (p. ej. "Trasladados" muestra solo quienes partieron).</div>
        <h3 class="pt-2 text-base font-bold text-slate-800">4.2 · Indicadores clave (KPI)</h3>
        <p class="text-sm leading-relaxed text-slate-600"><b>Todos los KPI son clicables</b> y abren la sección correspondiente ya filtrada: Expedientes Activos, Documentos Faltantes, En Matching, Docs por Vencer, <b>Solicitudes por Atender</b> (solicitudes abiertas de las estructuras, con los puestos por cubrir) y <b>Solicitudes Atendidas</b> (ambas abren el Matching), Procesos Completados.</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">4.3 · Semáforos de riesgo y vencimientos</h3>
        <p class="text-sm leading-relaxed text-slate-600">Lista los expedientes detenidos <b>demasiado tiempo</b> en su estado actual, y un panel de <b>documentos por vencer/vencidos</b>. <b>Acción:</b> haz clic en una fila para abrir el expediente; el KPI "Docs por Vencer" abre el archivo filtrado.</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">4.4 · Candidatos por estructura</h3>
        <p class="text-sm leading-relaxed text-slate-600">Muestra cuántos candidatos están asignados a cada empleador y cuántos han concluido el proceso, además de la distribución en las 9 fases, agrupadas por equipo.</p>
      </section>

      <section id="pratiche" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="folder-kanban" class="h-5 w-5 text-indigo-500"></i>5. Gestión de Expedientes</h2>
        <p class="text-sm leading-relaxed text-slate-600">El trabajo diario. A la izquierda la <b>lista de candidatos</b>, a la derecha la <b>ficha completa</b>.</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">5.1 · Lista y búsqueda</h3>
        <ul class="prose-list ml-5 list-disc text-sm text-slate-600">
          <li><b>Búsqueda:</b> por nombre, pasaporte, estructura de destino, <b>agencia asociada, referente de RR.HH., lugar de nacimiento y especializaciones</b>.</li>
          <li><b>Filtros de estado:</b> Todos, <b>Trasladados</b>, <b>Por Trasladar</b>, En riesgo, Docs Faltantes, En curso, Fase Italia, Completados. Al venir de un KPI (p. ej. "En Matching") aparece un filtro temporal resaltado, con la ✕ para quitarlo.</li>
          <li><b>Filtro "Mi equipo":</b> si tu perfil en <b>Ajustes → Operadores RR.HH.</b> tiene un Equipo asignado (Rep. Dominicana o Italia), aparece un filtro dedicado que muestra solo los candidatos en las fases de tu equipo. La correspondencia se hace por el correo de acceso (o el nombre del operador en modo demo).</li>
          <li><b>Ficha:</b> muestra el estado, el nivel lingüístico y la fase. El icono ⏰ señala riesgo de retraso.</li>
        </ul>
        <h3 class="pt-2 text-base font-bold text-slate-800">5.2 · El stepper (9 fases · 2 equipos)</h3>
        <p class="text-sm leading-relaxed text-slate-600">Sobre la línea de tiempo, dos bandas indican el equipo responsable: <b>🇩🇴 Equipo Rep. Dominicana</b> (fases 1–4) y <b>🇮🇹 Equipo Italia</b> (fases 5–9). Colores de los círculos: <span class="font-semibold text-emerald-600">verde</span> = completada, <span class="font-semibold text-indigo-600">índigo</span> = actual, <span class="font-semibold text-amber-600">ámbar</span> = bloqueada, gris = por hacer.</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">5.3 · El botón "Avanzar Fase"</h3>
        <p class="text-sm leading-relaxed text-slate-600">Lleva el expediente a la fase siguiente. Se <b>desbloquea solo</b> cuando la checklist y los documentos de la fase actual están cumplidos; de lo contrario, los requisitos faltantes se muestran sobre el botón.</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">5.4 · Documentos, checklist, logística, registro</h3>
        <ul class="prose-list ml-5 list-disc text-sm text-slate-600">
          <li><b>Documentos:</b> estados Aprobado / En Verificación / Faltante; acciones Subir, Aprobar, Rechazar, Añadir.</li>
          <li><b>Checklist:</b> tareas obligatorias de la fase actual, cambian en cada avance.</li>
          <li><b>Logística &amp; Onboarding RR.HH.:</b> vuelo, alojamiento, tutor, contrato.</li>
          <li><b>Registro y auditoría:</b> notas, llamadas y avisos con fecha y autor.</li>
        </ul>
      </section>

      <section id="workflow" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="route" class="h-5 w-5 text-indigo-500"></i>6. Las 9 fases y los 2 equipos</h2>
        <p class="text-sm leading-relaxed text-slate-600">El proyecto se organiza sobre una clara división geográfica y operativa. El <b>Equipo República Dominicana</b> sigue al candidato hasta la partida (fases 1–4); el <b>Equipo Italia</b> toma el relevo a la llegada y se ocupa de la logística, el matching laboral y la estabilidad (fases 5–9). La coordinación se realiza mediante la actualización constante de documentos y checklists en la app.</p>
        <div class="overflow-hidden rounded-xl border border-slate-200"><table class="w-full text-sm">
          <thead class="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400"><tr><th class="px-3 py-2 w-10">#</th><th class="px-3 py-2">Fase</th><th class="px-3 py-2">Qué hacer</th></tr></thead>
          <tbody class="divide-y divide-slate-100 align-top">
            <tr class="bg-sky-50"><td colspan="3" class="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-sky-700">🇩🇴 Equipo República Dominicana — de la selección a la partida</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-sky-600">1</td><td class="px-3 py-2.5 font-medium text-slate-700">Selección y Reclutamiento</td><td class="px-3 py-2.5 text-slate-600">Solo estructuras reconocidas por el gobierno dominicano; verificación de competencias y especializaciones de enfermería, datos personales, evaluación lingüística.</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-sky-600">2</td><td class="px-3 py-2.5 font-medium text-slate-700">Gestión Documental</td><td class="px-3 py-2.5 text-slate-600">La fase crucial, gestionada mediante la app: títulos traducidos y jurados, apostilla, reconocimiento del Ministerio, autorización, visado e inscripción OPI. No se avanza hasta que cada documento requerido esté cargado y aprobado.</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-sky-600">3</td><td class="px-3 py-2.5 font-medium text-slate-700">Formación</td><td class="px-3 py-2.5 text-slate-600">Contenidos digitales y encuentros (online o presenciales) según el modelo «Italia in tasca», con asistencia directa durante el itinerario.</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-sky-600">4</td><td class="px-3 py-2.5 font-medium text-slate-700">Organización del Viaje</td><td class="px-3 py-2.5 text-slate-600">Compra del billete de avión y traslado al aeropuerto en territorio dominicano.</td></tr>
            <tr class="bg-emerald-50"><td colspan="3" class="px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-emerald-700">🇮🇹 Equipo Italia — de la llegada a la plena integración</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-emerald-600">5</td><td class="px-3 py-2.5 font-medium text-slate-700">Llegada a Italia</td><td class="px-3 py-2.5 text-slate-600">Recibimiento en el aeropuerto y traslado al alojamiento previsto.</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-emerald-600">6</td><td class="px-3 py-2.5 font-medium text-slate-700">Alojamiento y Servicios</td><td class="px-3 py-2.5 text-slate-600">Contrato individual de alojamiento (sobre los contratos marco ya firmados), activación de servicios, permiso de residencia.</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-emerald-600">7</td><td class="px-3 py-2.5 font-medium text-slate-700">Matching</td><td class="px-3 py-2.5 text-slate-600">Recepción de las solicitudes de las estructuras sanitarias y cruce preciso con las competencias y especializaciones cargadas por el equipo dominicano: la inserción se ajusta a la unidad, no es genérica.</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-emerald-600">8</td><td class="px-3 py-2.5 font-medium text-slate-700">Relación Laboral</td><td class="px-3 py-2.5 text-slate-600">Identificación del empleador, firma del contrato, gestión continua de la relación (controversias, welfare de empresa).</td></tr>
            <tr><td class="px-3 py-2.5 font-bold text-emerald-600">9</td><td class="px-3 py-2.5 font-medium text-slate-700">Tutoría y Asistencia</td><td class="px-3 py-2.5 text-slate-600">Tutor, servicios socioculturales y asistencia legal/fiscal en condiciones concertadas para las cuestiones extralaborales.</td></tr>
          </tbody>
        </table></div>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-800"><b>Una tantum vs operativo.</b> Algunas actividades de los equipos son acuerdos marco <b>una tantum</b> (agencias reconocidas, contratos marco de alojamiento, empresas precontratadas, profesionales legales/fiscales) y no aparecen en la checklist del candidato: la checklist contiene solo las tareas <b>operativas</b> repetidas para cada expediente.</div>
        <h3 class="pt-2 text-base font-bold text-slate-800">6.1 · El protocolo de matching técnico</h3>
        <p class="text-sm leading-relaxed text-slate-600">La app es la <b>única fuente de verdad</b> del proyecto: el <b>Equipo Dominicana introduce y cualifica</b> los datos (especializaciones clínicas verificadas del candidato, documentación jurada, dossier «Italia in tasca»), mientras el <b>Equipo Italia consulta y extrae</b> (recibe las necesidades de las estructuras, filtra la base de datos por competencias, empareja el perfil idóneo y supervisa su conformidad).</p>
        <ul class="prose-list ml-5 list-disc text-sm text-slate-600">
          <li><b>Especializaciones del candidato:</b> se marcan desde el catálogo en <b>Editar datos</b> (sección Competencias); el catálogo se gestiona en <b>Ajustes → Especializaciones</b>.</li>
          <li><b>Solicitudes de las estructuras:</b> en la vista <b>Matching</b>, «Nueva Solicitud» registra la unidad de destino, el número de enfermeros solicitados, las competencias mínimas, las especializaciones preferentes y el turno; la solicitud pasa a «Emparejada» cuando todos los puestos están cubiertos. Un <b>aviso</b> señala automáticamente cuando se crea una solicitud y cuando la plantilla está completa — aunque la acción provenga de otro operador.</li>
          <li><b>Cruce:</b> «Buscar candidatos» ordena los perfiles por compatibilidad (consulta → selección → validación documental) y con «Emparejar» se finaliza la propuesta: el empleador del candidato se actualiza y todo queda registrado en el log.</li>
        </ul>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="text-sm font-bold text-slate-800">Cómo se construye la lista de candidatos</p>
          <ul class="prose-list mt-2 ml-5 list-disc text-sm text-slate-600">
            <li><b>Quién entra:</b> todos los candidatos aún no emparejados con otra solicitud y que no hayan superado la fase 7 (quien ya está en Relación Laboral o ha concluido queda excluido). La fase no es un requisito: puedes "reservar" a quien todavía está en formación.</li>
            <li><b>Idóneo o parcial:</b> un perfil es <span class="font-semibold text-emerald-600">Idóneo</span> solo si posee <b>todas</b> las competencias mínimas de la solicitud; si no, es <span class="font-semibold text-amber-600">Parcial</span>. El sistema informa pero no decide: la elección final es del operador.</li>
            <li><b>Orden:</b> perfil idóneo = 100 puntos base (uno parcial llega como máximo a 60, en proporción a las mínimas que posee); <b>+8</b> por cada especialización preferente; <b>+5</b> si el dossier «Italia in tasca» está validado; <b>+4</b> si todos los documentos obligatorios están aprobados; en caso de empate va antes quien está más avanzado en las fases (operativo antes).</li>
            <li><b>Insignias de validación:</b> bajo cada nombre ves competencias x/y, preferentes x/y, documentos completos/incompletos y dossier validado/faltante — la «validación» del protocolo, de un vistazo.</li>
            <li><b>Estados de la solicitud:</b> nace <b>Abierta</b>; con los emparejamientos sube el contador (p. ej. «1/3 emparejados») y con la plantilla cubierta pasa a <b>Emparejada</b>; con los contratos firmados se <b>Cierra</b>. La ✕ sobre un emparejado lo elimina (queda en el log) y reabre la solicitud.</li>
            <li><b>Lo que NO hace:</b> el emparejamiento no avanza las fases del candidato ni lo saca de la pipeline: el recorrido continúa normalmente con checklists y «Avanzar Fase».</li>
          </ul>
        </div>
      </section>

      <section id="procedure" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="list-checks" class="h-5 w-5 text-indigo-500"></i>7. Usar la app paso a paso</h2>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4">
          <p class="text-sm font-bold text-indigo-800">El flujo completo en 6 pasos</p>
          <ol class="prose-list mt-1 ml-5 list-decimal text-sm text-indigo-900/80">
            <li><b>Accede</b> con tu cuenta.</li><li><b>Crea el registro</b> del candidato (procedimiento 1).</li>
            <li><b>Añade y aprueba documentos</b> (procedimientos 2 y 3).</li><li><b>Marca la checklist</b> de la fase actual.</li>
            <li><b>Avanza la fase</b> cuando el botón se desbloquee (procedimiento 4).</li><li><b>Registra comunicaciones</b> y vigila los semáforos (5 y 6).</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">1</span>Crear un nuevo candidato</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Ve a la vista <b>Gestión de Expedientes</b>.</li>
            <li>En la parte superior de la lista, pulsa <b>Nuevo Candidato</b>.</li>
            <li>Rellena los campos. <b>Nombre y Pasaporte</b> son obligatorios (*); la agencia, el empleador y el referente de RR.HH. se eligen de las listas gestionadas en <b>Ajustes</b>. El sistema comprueba que el <b>correo</b> esté bien escrito y que el <b>pasaporte</b> no esté ya registrado para otro candidato.</li>
            <li>Pulsa <b>Crear candidato</b>: el expediente se abre en la fase <b>1 · Selección y Reclutamiento</b> con los documentos estándar preparados.</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">2</span>Añadir documentos</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Abre la sección <b>Ciclo de Vida de los Documentos</b>.</li>
            <li>Pulsa <b>Añadir</b> arriba a la derecha de la tabla.</li>
            <li>Introduce el nombre (obligatorio), el idioma (ES/IT) y la validez si se conoce.</li>
            <li>Pulsa <b>Añadir</b>: el documento aparece como <span class="font-semibold text-rose-600">Faltante</span>.</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">3</span>Subir y aprobar un documento</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Localiza las filas <span class="font-semibold text-rose-600">Faltante</span>.</li>
            <li>Pulsa <b>Subir</b> → <span class="font-semibold text-amber-600">En Verificación</span>.</li>
            <li>Pulsa <b>Aprobar</b> → <span class="font-semibold text-emerald-600">Aprobado</span> (o <b>Rechazar</b>).</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">4</span>Avanzar un expediente</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Marca la <b>Checklist</b> de la fase actual.</li><li>Comprueba que los documentos requeridos estén <b>Aprobados</b>.</li>
            <li>Completa los <b>requisitos faltantes</b> indicados.</li><li>Pulsa <b>Avanzar Fase</b>.</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">5</span>Registrar una llamada o nota</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Ve a "Registro de Comunicaciones".</li><li>Escribe el texto, elige <b>Llamada</b>/Nota/Aviso y pulsa <b>Registrar</b>.</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">6</span>Gestionar un semáforo rojo</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Desde el Panel (o el distintivo "En riesgo"), abre el expediente señalado.</li><li>Identifica el bloqueo y contacta con la agencia/candidato.</li>
            <li><b>Registra la llamada</b> y actualiza documentos/checklist: el contador de días se reinicia.</li>
          </ol>
        </div>
        <div class="rounded-xl border border-slate-200 bg-white p-5">
          <p class="flex items-center gap-2 text-sm font-bold text-slate-800"><span class="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">7</span>Gestionar una solicitud y emparejar candidatos (Equipo Italia)</p>
          <ol class="prose-list mt-2 ml-5 list-decimal text-sm text-slate-600">
            <li>Ve a la vista <b>Matching</b> y pulsa <b>Nueva Solicitud</b>.</li>
            <li>Rellena estructura y unidad (obligatorias), el <b>número de enfermeros solicitados</b>, las competencias mínimas, las preferentes y el turno; luego <b>Guardar</b>.</li>
            <li>Pulsa <b>Buscar candidatos</b> y lee la lista: «Perfil idóneo» arriba, insignias de validación bajo cada nombre.</li>
            <li>Pulsa <b>Emparejar</b> en el candidato elegido y confirma: empleador actualizado y registro escrito. Repite hasta que el contador cubra la plantilla (p. ej. «3/3 emparejados» → solicitud <b>Emparejada</b>).</li>
            <li>Con los contratos firmados pulsa <b>Cerrar solicitud</b>. Para corregir un error usa la ✕ sobre el emparejado.</li>
          </ol>
        </div>

        <div class="rounded-xl border-l-4 border-emerald-400 bg-emerald-50 p-4">
          <p class="text-sm font-bold text-emerald-800">Otras funciones útiles</p>
          <ul class="prose-list mt-1 ml-5 list-disc text-sm text-emerald-900/80">
            <li><b>Subir un archivo:</b> en la tabla de documentos pulsa <b>Subir</b> → se abre el selector de archivos del ordenador (PDF, foto, escaneo). El archivo queda adjunto y el botón pasa a <b>Reemplazar</b>.</li>
            <li><b>Archivo de Documentos</b> (pestaña <b>Documentos</b>): encuentra <b>todos</b> los documentos de todos los candidatos, con búsqueda y filtros. Pulsa <b>Ver</b> para la <b>vista previa</b> de imágenes y PDF dentro de la app.</li>
            <li><b>Vencimientos:</b> los documentos con fecha de validez se marcan como <span class="font-semibold text-amber-600">Por vencer</span> (dentro de 60 días) o <span class="font-semibold text-rose-600">Vencido</span>. Usa el filtro <b>Por vencer</b> en el archivo.</li>
            <li><b>Editar datos:</b> el botón <b>Editar datos</b> en la cabecera del candidato para corregir la información.</li>
            <li><b>Logística &amp; Onboarding:</b> el botón <b>Editar</b> para introducir vuelo, alojamiento, tutor y estado del contrato.</li>
            <li><b>Ficha del candidato (PDF):</b> el botón <b>Ficha</b> en la cabecera del candidato abre la ficha completa (datos, contactos, competencias, documentos y últimas entradas del registro). Pulsa <b>Imprimir / PDF</b> para imprimirla o guardarla como PDF (útil para consulados y estructuras).</li>
            <li><b>Eliminar candidato</b> (solo admin): dentro de <b>Editar datos</b>, abajo a la izquierda. No se puede deshacer; también libera las asignaciones de matching.</li>
            <li><b>Exportar CSV</b> (solo admin): botón arriba a la derecha en el Panel, descarga la lista de candidatos.</li>
            <li><b>Copia de seguridad completa</b> (solo admin, en <b>Ajustes</b>): <b>Descargar copia</b> guarda candidatos, solicitudes y ajustes en un fichero; <b>Restaurar desde copia</b> los recarga (sustituye los datos actuales). Los ficheros subidos permanecen en la nube.</li>
          </ul>
        </div>
      </section>

      <section id="dati" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="database" class="h-5 w-5 text-indigo-500"></i>8. Cómo se guardan los datos</h2>
        <p class="text-sm leading-relaxed text-slate-600">Cada cambio se guarda <b>automáticamente</b>: no hay botón "Guardar".</p>
        <div class="grid gap-3 sm:grid-cols-2">
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="flex items-center gap-2 text-sm font-bold text-slate-800"><i data-lucide="cloud" class="h-4 w-4 text-indigo-500"></i>Modo nube (recomendado)</p><p class="mt-1 text-xs text-slate-600">Con el acceso activo, los datos se guardan en Firebase Firestore en un <b>archivo compartido por el equipo</b> y accesibles desde cualquier dispositivo.</p></div>
          <div class="rounded-xl border border-slate-200 bg-white p-4"><p class="flex items-center gap-2 text-sm font-bold text-slate-800"><i data-lucide="hard-drive" class="h-4 w-4 text-amber-500"></i>Modo demo local</p><p class="mt-1 text-xs text-slate-600">Sin configuración en la nube, los datos quedan solo en el navegador de ese ordenador. Útil para formación y pruebas.</p></div>
        </div>
        <h3 class="pt-2 text-base font-bold text-slate-800">8.1 · Trabajo en equipo y estado de guardado</h3>
        <p class="text-sm leading-relaxed text-slate-600">En modo nube el archivo es compartido: los cambios de un operador llegan a los demás <b>en tiempo real</b> (un breve aviso señala «datos actualizados por otro operador»). Si dos personas editan <b>candidatos distintos</b>, ambos cambios se conservan; en el <b>mismo</b> candidato prevalece el último guardado. El <b>indicador de estado</b> en la cabecera siempre dice cómo fue: <span class="font-semibold text-emerald-600">Guardado</span>, <span class="font-semibold text-amber-600">Guardando…</span>, <span class="font-semibold text-rose-600">NO guardado</span> (haz clic para el detalle del error y reintentar) o <b>Sin conexión</b> (los cambios se envían solos al volver la conexión).</p>
        <div class="rounded-xl border-l-4 border-slate-400 bg-slate-50 p-4 text-sm text-slate-700"><b>Copia recomendada.</b> Periódicamente, desde <b>Ajustes → Descargar copia</b>, guarda una copia del archivo: es tu red de seguridad. <b>Para el administrador</b>, la configuración de base de datos y autenticación está en el archivo <code class="rounded bg-slate-200 px-1 py-0.5 font-mono text-xs">FIREBASE-SETUP.md</code>.</div>
      </section>

      <section id="faq" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="help-circle" class="h-5 w-5 text-indigo-500"></i>9. Preguntas frecuentes</h2>
        <div class="space-y-2">
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">¿Por qué "Avanzar Fase" está en gris?</summary><p class="mt-2 text-slate-600">Faltan requisitos en la fase actual: marca la checklist y aprueba los documentos indicados sobre el botón.</p></details>
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">Aprobé un documento por error.</summary><p class="mt-2 text-slate-600">Pulsa <b>Rechazar</b> en el mismo documento: vuelve a "Faltante" y la acción queda en el registro.</p></details>
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">¿Puedo volver a una fase anterior?</summary><p class="mt-2 text-slate-600">El flujo está pensado para avanzar. Actúa sobre documentos/checklist y anota el motivo en el registro; para casos especiales contacta con el administrador.</p></details>
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">¿Por qué un candidato no aparece en la lista del matching?</summary><p class="mt-2 text-slate-600">O ya está emparejado con otra solicitud (quita antes ese emparejamiento con la ✕), o está en fase 8–9 / recorrido concluido, por lo que ya no está disponible para nuevos emparejamientos.</p></details>
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">¿Por qué no puedo marcar la checklist, subir/aprobar documentos ni avanzar la fase?</summary><p class="mt-2 text-slate-600">La fase pertenece al otro equipo (el aviso azul indica cuál): las fases 1–4 las trabaja el Equipo Rep. Dominicana, las 5–9 el Equipo Italia. En esas fases los <b>documentos</b> también quedan en solo lectura (sin Subir/Aprobar/Rechazar). Los administradores y los operadores sin equipo no tienen limitaciones.</p></details>
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">El indicador de arriba está en rojo «NO guardado»: ¿qué hago?</summary><p class="mt-2 text-slate-600">El guardado en la nube falló (a menudo es la conexión). Tus cambios quedan en este dispositivo: <b>haz clic en el indicador</b> para ver el error y reiniciar el guardado enseguida. Cuando vuelve a verde todo está sincronizado.</p></details>
          <details class="rounded-xl border border-slate-200 bg-white p-4 text-sm"><summary class="cursor-pointer font-semibold text-slate-800">¿Qué hace "Restablecer"?</summary><p class="mt-2 text-slate-600">Restaura los perfiles demo y descarta los cambios locales: existe <b>solo en modo demo</b>. En modo nube está oculto para no borrar los datos reales del equipo; para una copia de seguridad usa <b>Ajustes → Descargar copia</b>.</p></details>
        </div>
      </section>

      <section id="glossario" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="book-marked" class="h-5 w-5 text-indigo-500"></i>10. Glosario</h2>
        <div class="overflow-hidden rounded-xl border border-slate-200"><table class="w-full text-sm"><tbody class="divide-y divide-slate-100 align-top">
          <tr><td class="px-4 py-2.5 w-48 font-semibold text-slate-700">OPI</td><td class="px-4 py-2.5 text-slate-600">Colegio de Profesiones de Enfermería: el registro al que el enfermero debe inscribirse para ejercer en Italia.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Traducción jurada</td><td class="px-4 py-2.5 text-slate-600">Traducción oficial certificada con valor legal en Italia.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Legalización / Apostilla</td><td class="px-4 py-2.5 text-slate-600">Certificación que hace válido en Italia un documento extranjero.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Autorización (nulla osta)</td><td class="px-4 py-2.5 text-slate-600">Autorización de trabajo emitida por la Ventanilla Única de Inmigración.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Decreto de reconocimiento</td><td class="px-4 py-2.5 text-slate-600">El acto que reconoce el título extranjero de enfermería.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">SLA</td><td class="px-4 py-2.5 text-slate-600">Tiempo máximo previsto para una fase; superarlo enciende el semáforo de riesgo.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Matching</td><td class="px-4 py-2.5 text-slate-600">Cruce entre las solicitudes de las estructuras sanitarias y las competencias/especializaciones de los candidatos registradas en la app.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Una tantum / Operativo</td><td class="px-4 py-2.5 text-slate-600">Acuerdos marco firmados una sola vez (agencias, alojamientos, empresas, profesionales) vs tareas repetidas para cada candidato.</td></tr>
          <tr><td class="px-4 py-2.5 font-semibold text-slate-700">Auditoría (audit trail)</td><td class="px-4 py-2.5 text-slate-600">Registro cronológico y trazable de todas las acciones y comunicaciones.</td></tr>
        </tbody></table></div>
      </section>

      <footer class="border-t border-slate-200 pt-6 text-center text-xs text-slate-400">DHL Nurses · Manual del Operador v1.1 — Documento de uso interno del personal de RR.HH.</footer>
    `;
  }

  // =====================================================================================
  //  RENDER LAYER
  // =====================================================================================
  function statusBadge(statusKey, extra) {
    return '<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ' + statusCls(statusKey) + ' ' + (extra || '') + '">' + escapeHtml(statusLabel(statusKey)) + '</span>';
  }

  function render() {
    const root = document.getElementById('app');
    // Auth still resolving: keep the static boot splash (already in the DOM) — rendering the
    // login screen here would make it flash for users who are in fact already signed in.
    if (fbEnabled && !authResolved) return;
    // Auth gate: when Firebase is configured but no user is signed in, show the login screen.
    if (fbEnabled && !currentUser) {
      root.innerHTML = loginScreen();
      lucide.createIcons();
      return;
    }
    // Settings is admin-only; non-admins are redirected to the dashboard.
    if (state.view === 'settings' && !isAdmin()) state.view = 'dashboard';
    const body = state.view === 'dashboard' ? dashboardView()
      : state.view === 'settings' ? settingsView()
      : state.view === 'documents' ? archiveView()
      : state.view === 'matching' ? matchingView()
      : casesView();
    // #app is a min-height:100vh flex column (see styles.css): the main area grows so the
    // footer is pushed to the bottom of the viewport even on short pages (e.g. Matching).
    root.innerHTML = demoBanner() + header() + '<div class="dhl-main">' + body + '</div>' + appFooter();
    lucide.createIcons();
    syncHistory();
    maybeAutoStartTour();
  }

  // ---------- Browser history: back/forward navigates between the main sections ----------
  const APP_VIEWS = ['dashboard', 'cases', 'matching', 'documents', 'settings'];
  let _lastHistoryView = null;
  function syncHistory() {
    const v = state.view;
    if (v === _lastHistoryView) return;
    const entry = { dhlView: v };
    if (_lastHistoryView === null) history.replaceState(entry, '', '#' + v);
    else history.pushState(entry, '', '#' + v);
    _lastHistoryView = v;
  }
  // Surface connectivity changes in the sync chip; flush pending changes on reconnect.
  window.addEventListener('offline', () => { if (fbEnabled && currentUser) setSyncStatus('offline'); });
  window.addEventListener('online', () => { if (fbEnabled && currentUser) remoteSync(); });

  window.addEventListener('popstate', (e) => {
    let v = (e.state && e.state.dhlView) || (location.hash || '').replace('#', '') || 'dashboard';
    if (APP_VIEWS.indexOf(v) < 0) v = 'dashboard';
    if (v === state.view) return;
    state.view = v;
    _lastHistoryView = v; // the URL already reflects this entry — don't push a new one
    saveState();
    render();
  });

  // Lightweight re-render of just the cases body (used for search typing to keep focus elsewhere)
  function renderCasesOnly() {
    if (state.view !== 'cases') return;
    const host = document.getElementById('cases-host');
    if (!host) { render(); return; }
    host.innerHTML = casesBody();
    lucide.createIcons();
  }

  function header() {
    const tab = (id, label, icon) =>
      '<button data-action="set-view" data-view="' + id + '" class="group inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ' +
      (state.view === id ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800') + '">' +
      '<i data-lucide="' + icon + '" class="h-4 w-4"></i>' + label + '</button>';

    const riskCount = state.nurses.filter(isAtRisk).length;

    return '' +
    '<header class="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur">' +
      '<div class="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-3 gap-y-2.5 px-4 py-3 sm:px-5">' +
        '<div class="flex min-w-0 items-center gap-3">' +
          '<img src="' + logoUrl + '" alt="DHL Nurses" class="h-10 w-10 shrink-0 rounded-xl shadow-lg shadow-indigo-200" />' +
          '<div class="min-w-0">' +
            '<h1 class="truncate text-base font-extrabold leading-tight text-slate-900">DHL Nurses</h1>' +
            '<p class="hidden truncate text-xs text-slate-500 sm:block">Trasferimento Infermieri · Rep. Dominicana → Italia</p>' +
          '</div>' +
        '</div>' +
        '<div class="order-last w-full">' +
          '<nav data-tour="views" class="flex w-full items-center gap-1 overflow-x-auto rounded-2xl bg-slate-100 p-1 sm:w-max sm:max-w-full">' +
            tab('dashboard', t('nav_dashboard'), 'layout-dashboard') +
            tab('cases', t('nav_cases'), 'folder-kanban') +
            tab('matching', t('nav_matching'), 'target') +
            tab('documents', t('nav_docs'), 'folder-archive') +
            (isAdmin() ? tab('settings', t('settings'), 'settings') : '') +
          '</nav>' +
        '</div>' +
        '<div class="relative ml-auto flex flex-wrap items-center justify-end gap-2 sm:gap-2.5">' +
          syncChipHtml() +
          (riskCount > 0
            ? '<button data-action="show-risk" class="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-100"><i data-lucide="alarm-clock" class="h-3.5 w-3.5"></i>' + t('at_risk', { n: riskCount }) + '</button>'
            : '<span class="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600 ring-1 ring-inset ring-emerald-200"><i data-lucide="shield-check" class="h-3.5 w-3.5"></i>' + t('no_risk') + '</span>') +
          '<button data-action="toggle-tools" id="hdr-tools-btn" class="inline-flex items-center justify-center rounded-xl px-2.5 py-2 text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50 lg:hidden" data-tip-pos="bottom-left" data-tooltip="' + escapeHtml(t('tools')) + '"><i data-lucide="settings-2" class="h-4 w-4"></i></button>' +
          '<div id="hdr-tools">' +
            '<button data-action="toggle-theme" class="inline-flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50" data-tip-pos="bottom" data-tooltip="' + escapeHtml(t('theme_toggle')) + '"><i data-lucide="' + (THEME === 'dark' ? 'sun' : 'moon') + '" class="h-3.5 w-3.5"></i><span class="lg:hidden">' + t('theme_toggle') + '</span></button>' +
            langSwitcher(false) +
            '<button data-action="open-manual" class="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"><i data-lucide="book-open" class="h-3.5 w-3.5"></i><span>' + t('manual') + '</span></button>' +
            '<button data-action="open-guide" class="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"><i data-lucide="scale" class="h-3.5 w-3.5"></i><span>' + t('norm_guide') + '</span></button>' +
            '<button data-action="start-tour" class="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200 transition hover:bg-indigo-100"><i data-lucide="graduation-cap" class="h-3.5 w-3.5"></i><span>' + t('guide') + '</span></button>' +
            // "Reset demo data" is a DEMO feature: in cloud mode it would wipe the whole
            // team's real caseload, so the button only exists in the local demo.
            (isAdmin() && !fbEnabled ? '<button data-action="reset" class="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50" data-tip-pos="bottom" data-tooltip="' + escapeHtml(t('reset_tooltip')) + '"><i data-lucide="rotate-ccw" class="h-3.5 w-3.5"></i><span class="lg:hidden">' + t('reset_tooltip') + '</span></button>' : '') +
          '</div>' +
          userCluster() +
        '</div>' +
      '</div>' +
    '</header>';
  }

  // Cloud save status chip (cloud mode only): green = saved, amber = saving,
  // red = NOT saved (click explains and retries), grey = offline.
  function syncChipHtml() {
    if (!(fbEnabled && currentUser)) return '';
    let cls, icon, label, spin = '';
    if (syncStatus === 'error') { cls = 'bg-rose-50 text-rose-600 ring-rose-200 hover:bg-rose-100'; icon = 'cloud-off'; label = t('sync_error'); }
    else if (syncStatus === 'offline') { cls = 'bg-slate-100 text-slate-500 ring-slate-200'; icon = 'wifi-off'; label = t('sync_offline'); }
    else if (syncStatus === 'saving') { cls = 'bg-amber-50 text-amber-600 ring-amber-200'; icon = 'refresh-cw'; label = t('sync_saving'); spin = ' animate-spin'; }
    else { cls = 'bg-emerald-50 text-emerald-600 ring-emerald-200'; icon = 'cloud'; label = t('sync_saved'); }
    return '<button id="sync-chip" data-action="sync-info" class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition ' + cls + '" data-tip-pos="bottom" data-tooltip="' + escapeHtml(t('sync_tooltip')) + '">' +
      '<i data-lucide="' + icon + '" class="h-3.5 w-3.5' + spin + '"></i><span class="hidden md:inline">' + label + '</span></button>';
  }
  // Patches just the chip in place: sync completions must not trigger a full re-render.
  function updateSyncChip() {
    const el = document.getElementById('sync-chip');
    if (!el) return;
    const html = syncChipHtml();
    if (!html) { el.remove(); return; }
    el.outerHTML = html;
    lucide.createIcons();
  }
  function syncInfo() {
    if (syncStatus === 'error') {
      alert(t('sync_error_detail', { x: syncErrorMsg || '—' }));
      remoteSync(); // immediate retry
    } else if (syncStatus === 'offline') alert(t('sync_offline_detail'));
    else alert(t('sync_ok_detail'));
  }

  function userCluster() {
    if (fbEnabled && currentUser) {
      const label = currentUser.displayName || currentUser.email || t('user');
      const initial = (label[0] || '?').toUpperCase();
      return '<div class="flex items-center gap-2 border-l border-slate-200 pl-2.5">' +
        '<button data-action="open-profile" class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white transition hover:ring-2 hover:ring-indigo-200" data-tip-pos="bottom-left" data-tooltip="' + escapeHtml(label) + ' — ' + escapeHtml(t('profile_tooltip')) + '">' + escapeHtml(initial) + '</button>' +
        '<button data-action="logout" class="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"><i data-lucide="log-out" class="h-3.5 w-3.5"></i><span class="hidden sm:inline">' + t('logout') + '</span></button>' +
      '</div>';
    }
    return '<button data-action="open-profile" class="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-200" data-tip-pos="bottom-left" data-tooltip="' + escapeHtml(t('demo_local_tip')) + '"><i data-lucide="hard-drive" class="h-3.5 w-3.5"></i>' + t('demo_local') + '</button>';
  }

  function demoBanner() {
    if (fbEnabled) return '';
    return '<div class="border-b border-amber-200 bg-amber-50">' +
      '<div class="mx-auto flex max-w-[1400px] items-center gap-2 px-4 py-2 text-xs text-amber-700 sm:px-5">' +
        '<i data-lucide="info" class="h-4 w-4 shrink-0"></i>' +
        '<span>' + t('demo_banner') + '</span>' +
      '</div>' +
    '</div>';
  }

  function appFooter() {
    return '<footer class="mx-auto mt-4 max-w-[1400px] px-4 pb-8 pt-2 sm:px-5">' +
      '<div class="flex items-center justify-center gap-1.5 border-t border-slate-200 pt-5 text-xs text-slate-400">' +
        '<span>Realizzato con cura da</span>' +
        '<i data-lucide="heart" class="h-3.5 w-3.5 text-rose-400"></i>' +
        '<span class="font-semibold text-slate-500">iTavix &amp; Claude</span>' +
      '</div>' +
    '</footer>';
  }

  // ------------------------------------------------------------------ DASHBOARD
  function kpiCard(icon, label, value, tone, sub, action, filter) {
    const tones = {
      indigo: 'from-indigo-500 to-indigo-600 shadow-indigo-200',
      rose: 'from-rose-500 to-rose-600 shadow-rose-200',
      amber: 'from-amber-500 to-amber-600 shadow-amber-200',
      emerald: 'from-emerald-500 to-emerald-600 shadow-emerald-200',
    };
    const tag = action ? 'button' : 'div';
    const attrs = action ? ' data-action="' + action + '"' + (filter ? ' data-filter="' + escapeHtml(filter) + '"' : '') + ' class="w-full text-left ' : ' class="';
    return '<' + tag + attrs + 'rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md' + (action ? ' hover:border-indigo-200' : '') + '">' +
      '<div class="flex items-start justify-between">' +
        '<div>' +
          '<p class="text-xs font-semibold uppercase tracking-wide text-slate-400">' + label + '</p>' +
          '<p class="mt-2 text-3xl font-extrabold text-slate-900">' + value + '</p>' +
          '<p class="mt-1 text-xs text-slate-400">' + sub + '</p>' +
        '</div>' +
        '<div class="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ' + tones[tone] + ' text-white shadow-lg"><i data-lucide="' + icon + '" class="h-5 w-5"></i></div>' +
      '</div>' +
    '</' + tag + '>';
  }

  // Big, at-a-glance transfer tiles (clickable → filtered Case Management).
  function summaryTile(icon, tone, label, value, sub, filter) {
    const tones = { indigo: 'bg-indigo-100 text-indigo-600', emerald: 'bg-emerald-100 text-emerald-600', amber: 'bg-amber-100 text-amber-600' };
    return '<button data-action="goto-cases" data-filter="' + filter + '" class="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-indigo-300 hover:shadow-md active:scale-[.99]">' +
      '<span class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ' + tones[tone] + '"><i data-lucide="' + icon + '" class="h-6 w-6"></i></span>' +
      '<div class="min-w-0">' +
        '<p class="text-3xl font-extrabold leading-none text-slate-900">' + value + '</p>' +
        '<p class="mt-1 text-sm font-semibold text-slate-700">' + label + '</p>' +
        '<p class="text-[11px] text-slate-400">' + sub + '</p>' +
      '</div>' +
    '</button>';
  }

  function dashboardView() {
    const k = computeKpis();
    const risks = state.nurses.filter(isAtRisk);
    const breakdown = employerBreakdown();
    const maxTotal = Math.max(1, ...breakdown.map((b) => b.total));
    const expiring = computeExpiring();

    const expiringPanel = expiring.length === 0
      ? '<div class="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200 sm:col-span-2"><i data-lucide="shield-check" class="h-5 w-5"></i>' + t('exp_panel_none') + '</div>'
      : expiring.slice(0, 8).map((it) => {
          const badge = it.ex === 'expired'
            ? '<span class="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200">' + t('exp_expired') + '</span>'
            : '<span class="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">' + t('exp_soon') + '</span>';
          return '<button data-action="open-nurse" data-id="' + it.n.id + '" class="flex w-full items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-left transition hover:bg-slate-50">' +
            '<span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ' + (it.ex === 'expired' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600') + '"><i data-lucide="calendar-clock" class="h-4 w-4"></i></span>' +
            '<div class="min-w-0 flex-1"><p class="truncate text-sm font-semibold text-slate-800">' + escapeHtml(it.d.name) + '</p>' +
              '<p class="truncate text-xs text-slate-500">' + escapeHtml(it.n.name) + ' • ' + t('valid_until', { d: formatDate(it.d.validity) }) + '</p></div>' +
            badge +
          '</button>';
        }).join('') + (expiring.length > 8 ? '<button data-action="show-expiring" class="mt-1 w-full rounded-xl py-2 text-center text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50">' + t('exp_see_all') + ' (' + expiring.length + ')</button>' : '');

    const riskPanel = risks.length === 0
      ? '<div class="flex items-center gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200"><i data-lucide="party-popper" class="h-5 w-5"></i>' + t('risk_none') + '</div>'
      : risks.map((n) => {
          const days = daysBetween(n.lastUpdate);
          const sla = STEP_SLA_DAYS[n.currentStep] || 30;
          return '<button data-action="open-nurse" data-id="' + n.id + '" class="flex w-full items-center gap-4 rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 text-left transition hover:bg-rose-50">' +
            '<span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 animate-pulseSoft"><i data-lucide="alarm-clock" class="h-4 w-4"></i></span>' +
            '<div class="min-w-0 flex-1">' +
              '<p class="truncate text-sm font-semibold text-slate-900">' + escapeHtml(n.name) + '</p>' +
              '<p class="truncate text-xs text-slate-500">' + t('risk_stuck_in', { state: escapeHtml(stepName(n.currentStep)) }) + ' • ' + escapeHtml(n.employer) + '</p>' +
            '</div>' +
            '<div class="text-right">' +
              '<p class="text-sm font-bold text-rose-600">' + days + ' ' + t('days_short') + '</p>' +
              '<p class="text-[11px] text-slate-400">' + t('sla_short', { n: sla }) + '</p>' +
            '</div>' +
            '<i data-lucide="chevron-right" class="h-4 w-4 text-rose-300"></i>' +
          '</button>';
        }).join('');

    const breakdownRows = breakdown.map((b) => {
      const pct = Math.round((b.total / maxTotal) * 100);
      return '<div class="space-y-1.5">' +
        '<div class="flex items-center justify-between text-sm">' +
          '<span class="font-medium text-slate-700">' + escapeHtml(b.employer) + '</span>' +
          '<span class="text-slate-400">' + b.total + ' ' + (b.total === 1 ? t('candidate_one') : t('candidate_many')) + ' • ' + b.completed + ' ' + t('onboard_abbr') + '</span>' +
        '</div>' +
        '<div class="h-2.5 overflow-hidden rounded-full bg-slate-100">' +
          '<div class="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400" style="width:' + pct + '%"></div>' +
        '</div>' +
      '</div>';
    }).join('');

    // Pipeline distribution mini-overview, grouped by team (1-4 RD · 5-9 Italy)
    const pipeline = steps().map((s) => {
      const count = state.nurses.filter((n) => n.currentStep === s.id).length;
      return '<div class="flex flex-col items-center gap-1">' +
        '<div class="flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ' + (count ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400') + '">' + count + '</div>' +
        '<span class="w-14 text-center text-[10px] leading-tight text-slate-400">' + escapeHtml(s.short) + '</span>' +
      '</div>';
    }).join('');
    const pipelineTeams =
      '<div class="mb-3 flex gap-1.5">' +
        '<div style="flex:4" class="rounded-lg bg-sky-50 px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-sky-700 ring-1 ring-inset ring-sky-200">🇩🇴 ' + escapeHtml(t('team_rd')) + ' · 1–4</div>' +
        '<div style="flex:5" class="rounded-lg bg-emerald-50 px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-200">🇮🇹 ' + escapeHtml(t('team_it')) + ' · 5–9</div>' +
      '</div>';

    // Who is working: HR operator record matched to the signed-in user (or the local demo name).
    const op = currentOperator();
    const opName = op ? op.name : (fbEnabled && currentUser ? (currentUser.displayName || currentUser.email || '') : localOperatorName());
    const opTeam = myTeam();
    const opChip = opName
      ? '<span data-tooltip="' + escapeHtml(t('operator')) + '" class="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 shadow-sm"><i data-lucide="user-round" class="h-3.5 w-3.5 text-indigo-500"></i>' +
        escapeHtml(opName) + (opTeam ? ' · ' + teamFlag(opTeam) + ' ' + escapeHtml(teamLabel(opTeam)) : '') + '</span>'
      : '';

    return '<main class="animate-fadeIn mx-auto max-w-[1400px] px-4 py-6 sm:px-5">' +
      '<div class="mb-6 flex flex-wrap items-end justify-between gap-3">' +
        '<div><h2 class="text-xl font-extrabold text-slate-900">' + t('dash_title') + '</h2>' +
        '<p class="text-sm text-slate-500">' + t('dash_subtitle') + '</p></div>' +
        '<div class="flex flex-wrap items-center gap-2">' +
          opChip +
          (isAdmin() ? '<button data-action="export-csv" class="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 shadow-sm transition hover:bg-slate-50"><i data-lucide="download" class="h-3.5 w-3.5"></i>' + t('export_csv') + '</button>' : '') +
        '</div>' +
      '</div>' +

      '<section data-tour="summary" class="dhl-summary mb-6 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-5 shadow-sm">' +
        '<div class="mb-4 flex items-center gap-2">' +
          '<i data-lucide="plane-takeoff" class="h-5 w-5 text-indigo-500"></i>' +
          '<h3 class="text-sm font-bold text-slate-900">' + t('summary_title') + '</h3>' +
          '<span class="ml-auto hidden text-xs text-slate-400 sm:block">' + t('summary_hint') + '</span>' +
        '</div>' +
        '<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">' +
          summaryTile('users', 'indigo', t('kpi_treating'), k.treating, t('kpi_treating_sub'), 'all') +
          summaryTile('plane-landing', 'emerald', t('kpi_sent'), k.sent, t('kpi_sent_sub'), 'sent') +
          summaryTile('hourglass', 'amber', t('kpi_tosend'), k.toSend, t('kpi_tosend_sub'), 'tosend') +
        '</div>' +
      '</section>' +

      '<div data-tour="kpi" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">' +
        kpiCard('users-round', t('kpi_active'), k.active, 'indigo', t('kpi_active_sub'), 'goto-cases', 'active') +
        kpiCard('file-warning', t('kpi_missing'), k.missing, 'rose', t('kpi_missing_sub'), 'goto-cases', 'Missing Docs') +
        kpiCard('target', t('kpi_matching'), k.matching, 'amber', t('kpi_matching_sub'), 'goto-cases', 'matching') +
        kpiCard('calendar-clock', t('kpi_expiring'), k.expiring, k.expiring ? 'rose' : 'emerald', t('kpi_expiring_sub'), 'show-expiring') +
        // Facility requests at a glance: still to fulfil (with seats left) and fulfilled.
        kpiCard('inbox', t('kpi_req_open'), k.reqOpen, k.reqOpen ? 'amber' : 'emerald', t('kpi_req_open_sub', { n: k.reqSeats }), 'open-matching') +
        kpiCard('clipboard-check', t('kpi_req_done'), k.reqDone, 'indigo', t('kpi_req_done_sub'), 'open-matching') +
        kpiCard('badge-check', t('kpi_done'), k.completed, 'emerald', t('kpi_done_sub'), 'goto-cases', 'Onboarding Completed') +
      '</div>' +

      '<div class="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">' +
        '<section data-tour="risk" class="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">' +
          '<div class="mb-4 flex items-center gap-2">' +
            '<i data-lucide="traffic-cone" class="h-5 w-5 text-rose-500"></i>' +
            '<h3 class="text-sm font-bold text-slate-900">' + t('risk_title') + '</h3>' +
            '<span class="ml-auto text-xs text-slate-400">' + t('risk_hint') + '</span>' +
          '</div>' +
          '<div class="space-y-2.5">' + riskPanel + '</div>' +
        '</section>' +

        '<section class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">' +
          '<div class="mb-4 flex items-center gap-2">' +
            '<i data-lucide="building-2" class="h-5 w-5 text-indigo-500"></i>' +
            '<h3 class="text-sm font-bold text-slate-900">' + t('struct_title') + '</h3>' +
          '</div>' +
          '<div class="space-y-4">' + breakdownRows + '</div>' +
        '</section>' +
      '</div>' +

      '<section class="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">' +
        '<div class="mb-4 flex items-center gap-2">' +
          '<i data-lucide="calendar-clock" class="h-5 w-5 text-amber-500"></i>' +
          '<h3 class="text-sm font-bold text-slate-900">' + t('exp_panel_title') + '</h3>' +
          (expiring.length ? '<span class="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">' + expiring.length + '</span>' : '') +
          '<span class="ml-auto text-xs text-slate-400">' + t('kpi_expiring_sub') + '</span>' +
        '</div>' +
        '<div class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">' + expiringPanel + '</div>' +
      '</section>' +

      '<section class="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">' +
        '<div class="mb-4 flex items-center gap-2">' +
          '<i data-lucide="git-commit-horizontal" class="h-5 w-5 text-indigo-500"></i>' +
          '<h3 class="text-sm font-bold text-slate-900">' + t('pipeline_title') + '</h3>' +
        '</div>' +
        '<div class="overflow-x-auto pb-1"><div class="min-w-[560px]">' +
          pipelineTeams +
          '<div class="flex items-start justify-between gap-1">' + pipeline + '</div>' +
        '</div></div>' +
      '</section>' +
    '</main>';
  }

  // ------------------------------------------------------------------ CASES (master-detail)
  function casesView() {
    return '<main class="animate-fadeIn mx-auto max-w-[1400px] px-4 py-6 sm:px-5">' +
      '<div id="cases-host">' + casesBody() + '</div>' +
    '</main>';
  }

  function filteredNurses() {
    const q = state.search.trim().toLowerCase();
    return state.nurses.filter((n) => {
      const f = state.statusFilter;
      if (f === 'risk') { if (!isAtRisk(n)) return false; }
      else if (f === 'sent') { if (!(n.currentStep >= SENT_TO_ITALY_STEP)) return false; }
      else if (f === 'tosend') { if (!(n.currentStep < SENT_TO_ITALY_STEP)) return false; }
      else if (f === 'active') { if (!(n.currentStep < DONE_STEP)) return false; }
      else if (f === 'matching') { if (!(n.currentStep === 7)) return false; }
      else if (f === 'myteam') {
        // Cases in the phases handled by the current operator's team (completed excluded).
        // If the operator has no team the filter is inert (shows everything).
        const tm = myTeam();
        if (tm && !(n.currentStep < DONE_STEP && stepTeam(n.currentStep) === tm)) return false;
      }
      else if (f !== 'all' && deriveStatus(n) !== f) return false;
      if (!q) return true;
      return (
        n.name.toLowerCase().includes(q) ||
        n.passport.toLowerCase().includes(q) ||
        (n.employer || '').toLowerCase().includes(q) ||
        (n.partnerAgency || '').toLowerCase().includes(q) ||
        (n.hrReferent || '').toLowerCase().includes(q) ||
        (n.birthPlace || '').toLowerCase().includes(q) ||
        nurseSpecs(n).some((s) => s.toLowerCase().includes(q))
      );
    });
  }

  function casesBody() {
    return '<div class="grid grid-cols-1 gap-5 lg:grid-cols-[340px_minmax(0,1fr)]">' +
      masterList() +
      detailPanel() +
    '</div>';
  }

  // Filters reachable from the chip row directly. Others (set from dashboard KPIs, e.g. 'active'/'matching')
  // are shown as a temporary, removable highlighted chip so the user always sees what is filtered.
  const STANDARD_FILTERS = ['all', 'myteam', 'risk', 'sent', 'tosend', 'Missing Docs', 'In Progress', 'Visa Obtained', 'Onboarding Completed'];
  function activeFilterLabel(f) {
    const map = { active: t('kpi_active'), matching: t('kpi_matching') };
    return map[f] || f;
  }
  function extraFilterChip() {
    const f = state.statusFilter;
    if (STANDARD_FILTERS.indexOf(f) >= 0) return '';
    return '<button data-action="set-filter" data-filter="all" class="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white shadow-sm" data-tooltip="' + escapeHtml(t('clear_filter')) + '">' + escapeHtml(activeFilterLabel(f)) + '<i data-lucide="x" class="h-3 w-3"></i></button>';
  }

  function masterList() {
    const list = filteredNurses();
    const filterChip = (val, label) =>
      '<button data-action="set-filter" data-filter="' + val + '" class="rounded-full px-3 py-1 text-xs font-semibold transition ' +
      (state.statusFilter === val ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200') + '">' + label + '</button>';

    const cards = list.length === 0
      ? '<div class="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">' + t('no_candidates') + '</div>'
      : list.map((n) => {
          const selected = n.id === state.selectedNurseId;
          const risk = isAtRisk(n);
          return '<button data-action="open-nurse" data-id="' + n.id + '" class="block w-full rounded-xl border p-3.5 text-left transition ' +
            (selected ? 'border-indigo-300 bg-indigo-50/60 ring-1 ring-indigo-200' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50') + '">' +
            '<div class="flex items-start justify-between gap-2">' +
              '<div class="min-w-0">' +
                '<p class="truncate text-sm font-bold text-slate-900">' + escapeHtml(n.name) + '</p>' +
                '<p class="mt-0.5 truncate text-xs text-slate-500">' + escapeHtml(n.passport) + ' • ' + escapeHtml(n.employer) + '</p>' +
              '</div>' +
              (risk ? '<span class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600"><i data-lucide="alarm-clock" class="h-3 w-3"></i></span>' : '') +
            '</div>' +
            '<div class="mt-2.5 flex items-center justify-between gap-2">' +
              statusBadge(deriveStatus(n)) +
              '<span class="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400"><i data-lucide="languages" class="h-3 w-3"></i>' + escapeHtml(n.languageLevel.split(' ')[0]) + '</span>' +
            '</div>' +
            '<div class="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400"><i data-lucide="map-pin" class="h-3 w-3"></i>' + (n.currentStep >= DONE_STEP ? escapeHtml(t('state_done')) : t('step_x', { n: n.currentStep }) + ' • ' + escapeHtml(stepName(n.currentStep))) + '</div>' +
          '</button>';
        }).join('');

    return '<aside data-tour="master" class="lg:sticky lg:top-[76px] lg:self-start">' +
      '<div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">' +
        '<button data-action="open-new-nurse" class="mb-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-700 active:scale-[.99]"><i data-lucide="user-plus" class="h-4 w-4"></i>' + t('new_candidate') + '</button>' +
        '<div class="relative mb-3">' +
          '<i data-lucide="search" class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"></i>' +
          '<input id="search-input" data-action="search" type="text" value="' + escapeHtml(state.search) + '" placeholder="' + escapeHtml(t('search_ph')) + '" ' +
            'class="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100" />' +
        '</div>' +
        '<div class="mb-3 flex flex-wrap gap-1.5">' +
          extraFilterChip() +
          filterChip('all', t('filter_all')) +
          (myTeam() ? filterChip('myteam', teamFlag(myTeam()) + ' ' + t('filter_myteam')) : '') +
          filterChip('sent', t('filter_sent')) +
          filterChip('tosend', t('filter_tosend')) +
          filterChip('risk', t('risk_filter')) +
          filterChip('Missing Docs', t('filter_missing')) +
          filterChip('In Progress', t('filter_progress')) +
          filterChip('Visa Obtained', t('filter_visa')) +
          filterChip('Onboarding Completed', t('filter_done')) +
        '</div>' +
        '<div class="space-y-2.5 pr-1 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto">' + cards + '</div>' +
      '</div>' +
    '</aside>';
  }

  function detailPanel() {
    const n = getNurse(state.selectedNurseId) || filteredNurses()[0];
    if (!n) return '<div class="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-slate-400">' + t('no_candidates') + '</div>';

    return '<section class="space-y-5">' +
      profileHeader(n) +
      stepper(n) +
      advanceBar(n) +
      '<div class="grid grid-cols-1 gap-5 xl:grid-cols-2">' +
        documentManager(n) +
        checklistSection(n) +
      '</div>' +
      '<div class="grid grid-cols-1 gap-5 xl:grid-cols-2">' +
        relocationCard(n) +
        communicationLog(n) +
      '</div>' +
    '</section>';
  }

  function profileHeader(n) {
    const initials = n.name.split(' ').map((w) => w[0]).slice(0, 2).join('');
    const field = (icon, label, value) =>
      '<div class="flex items-start gap-2">' +
        '<i data-lucide="' + icon + '" class="mt-0.5 h-4 w-4 shrink-0 text-slate-400"></i>' +
        '<div><p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">' + label + '</p>' +
        '<p class="text-sm font-medium text-slate-700">' + escapeHtml(value) + '</p></div>' +
      '</div>';

    return '<div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">' +
      '<div class="flex flex-col gap-4 border-b border-slate-100 bg-gradient-to-br from-indigo-50 to-slate-50 p-5 sm:flex-row sm:items-center">' +
        '<div class="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-xl font-extrabold text-white shadow-md shadow-indigo-200">' + escapeHtml(initials) + '</div>' +
        '<div class="min-w-0 flex-1">' +
          '<h2 class="text-lg font-extrabold text-slate-900">' + escapeHtml(n.name) + '</h2>' +
          '<p class="text-sm text-slate-500">' + escapeHtml([n.birthPlace, n.nationality].filter(Boolean).join(' · ') || '—') + '</p>' +
          // Current phase + privacy consent, pinned next to the name (always visible).
          '<div class="mt-2 flex flex-wrap items-center gap-1.5">' +
            '<span class="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200"><i data-lucide="flag" class="h-3 w-3"></i>' +
              escapeHtml(n.currentStep >= DONE_STEP ? t('state_done') : t('step_state', { n: n.currentStep, name: stepName(n.currentStep) })) + '</span>' +
            '<span class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ' + (n.privacyConsent ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-600 ring-rose-200') + '"><i data-lucide="shield-check" class="h-3 w-3"></i>' +
              escapeHtml(t('f_privacy') + ': ' + (n.privacyConsent ? t('privacy_given', { d: formatDate(n.privacyConsentDate) }) : t('privacy_none'))) + '</span>' +
            '<button data-action="print-privacy" data-id="' + n.id + '" class="inline-flex items-center justify-center rounded-full p-1 text-indigo-500 ring-1 ring-inset ring-indigo-200 transition hover:bg-indigo-50" data-tooltip="' + escapeHtml(t('privacy_print')) + '"><i data-lucide="printer" class="h-3.5 w-3.5"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="flex flex-col items-start gap-2 sm:items-end">' +
          statusBadge(deriveStatus(n)) +
          '<span class="text-xs text-slate-400">' + t('last_update', { d: formatDate(n.lastUpdate) }) + '</span>' +
          '<button data-action="open-sheet" data-id="' + n.id + '" class="inline-flex items-center gap-1 rounded-lg bg-white/70 px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition hover:bg-white" data-tooltip="' + escapeHtml(t('sheet_tip')) + '"><i data-lucide="printer" class="h-3 w-3"></i>' + t('sheet_btn') + '</button>' +
          '<button data-action="open-edit-nurse" data-id="' + n.id + '" class="inline-flex items-center gap-1 rounded-lg bg-white/70 px-2.5 py-1 text-xs font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200 transition hover:bg-white"><i data-lucide="pencil" class="h-3 w-3"></i>' + t('edit_candidate') + '</button>' +
        '</div>' +
      '</div>' +
      profileTabsHtml(n) +
      personalDocsStrip(n) +
    '</div>';
  }

  // Which anagrafica tab is open (kept across renders; not persisted).
  let profileTab = 'dati';

  function profileTabsHtml(n) {
    const field = (icon, label, value) =>
      '<div class="flex items-start gap-2">' +
        '<i data-lucide="' + icon + '" class="mt-0.5 h-4 w-4 shrink-0 text-slate-400"></i>' +
        '<div><p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">' + label + '</p>' +
        '<p class="text-sm font-medium text-slate-700">' + escapeHtml(value) + '</p></div>' +
      '</div>';
    // Expiry field with traffic-light coloring (red = expired, amber = within 60 days).
    const expField = (label, dateStr) => {
      let cls = 'text-slate-700', icon = 'calendar', iconCls = 'text-slate-400';
      if (dateStr) {
        const days = Math.floor((new Date(dateStr) - today()) / 86400000);
        if (days < 0) { cls = 'text-rose-600'; icon = 'calendar-x'; iconCls = 'text-rose-400'; }
        else if (days <= 60) { cls = 'text-amber-600'; icon = 'calendar-clock'; iconCls = 'text-amber-500'; }
      }
      return '<div class="flex items-start gap-2">' +
        '<i data-lucide="' + icon + '" class="mt-0.5 h-4 w-4 shrink-0 ' + iconCls + '"></i>' +
        '<div><p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">' + label + '</p>' +
        '<p class="text-sm font-medium ' + cls + '">' + (dateStr ? formatDate(dateStr) : '—') + '</p></div>' +
      '</div>';
    };
    const tabBtn = (id, icon, label) =>
      '<button data-action="profile-tab" data-tab="' + id + '" class="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ' +
      (profileTab === id ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-800') + '"><i data-lucide="' + icon + '" class="h-3.5 w-3.5"></i>' + label + '</button>';

    let body;
    if (profileTab === 'contatti') {
      body =
        field('phone', t('f_phone'), n.phone || '—') +
        field('mail', t('f_email'), n.email || '—') +
        field('handshake', t('f_agency'), n.partnerAgency) +
        field('hospital', t('f_employer'), n.employer) +
        field('user-cog', t('f_hr'), n.hrReferent + (operatorByName(n.hrReferent) && operatorByName(n.hrReferent).team ? ' · ' + teamFlag(operatorByName(n.hrReferent).team) + ' ' + teamLabel(operatorByName(n.hrReferent).team) : ''));
    } else if (profileTab === 'competenze') {
      body =
        field('briefcase', t('f_role'), n.profRole || '—') +
        field('building-2', t('f_sector'), n.profSector || '—') +
        field('history', t('f_experience'), n.profExperience || '—') +
        field('languages', t('f_lang'), n.languageLevel) +
        field('stethoscope', t('f_specs'), nurseSpecs(n).length ? nurseSpecs(n).join(' · ') : '—') +
        (n.matchedRequestId ? field('target', t('f_match'), n.employer + (n.matchedDepartment ? ' — ' + n.matchedDepartment : '')) : '');
    } else {
      body =
        field('cake', t('f_birth'), [n.birthDate ? formatDate(n.birthDate) : '', n.birthPlace || ''].filter(Boolean).join(' · ') || '—') +
        field('globe', t('f_nationality'), n.nationality || '—') +
        field('heart', t('f_marital'), n.maritalStatus ? t('ms_' + n.maritalStatus) : '—') +
        field('map-pin', t('f_address'), n.address || '—') +
        field('book-user', t('f_passport'), n.passport) +
        expField(t('f_passport_exp'), n.passportExpiry) +
        field('credit-card', t('f_cedula'), n.cedula || '—') +
        expField(t('f_cedula_exp'), n.cedulaExpiry);
      // Current phase and privacy consent live in the profile header, next to the name.
    }
    return '<div class="px-5 pt-4">' +
        '<div class="flex w-max max-w-full items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">' +
          tabBtn('dati', 'id-card', t('tab_dati')) + tabBtn('contatti', 'phone', t('tab_contatti')) + tabBtn('competenze', 'briefcase', t('tab_competenze')) +
        '</div>' +
      '</div>' +
      '<div class="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">' + body + '</div>';
  }

  // Personal documents (passport copy, Cédula, photo, CV, certificates) uploadable
  // straight from the anagrafica card — same actions as the documents table.
  function personalDocsStrip(n) {
    const personalNames = PERSONAL_DOC_TYPES.map((p) => p.name.toLowerCase());
    const docs = (n.documents || []).filter((d) => personalNames.indexOf((d.name || '').toLowerCase()) >= 0);
    if (!docs.length) return '';
    // Phase owned by the other team: documents are read-only (same rule as checklist/advance).
    const docsLocked = n.currentStep < DONE_STEP && !canOperatePhase(n.currentStep);
    const rows = docs.map((d) => {
      const statusIcon = d.status === 'approved' ? '<i data-lucide="check-circle-2" class="h-4 w-4 shrink-0 text-emerald-500"></i>'
        : d.status === 'pending' ? '<i data-lucide="clock" class="h-4 w-4 shrink-0 text-amber-500"></i>'
        : '<i data-lucide="' + (d.optional ? 'circle-dashed' : 'x-circle') + '" class="h-4 w-4 shrink-0 ' + (d.optional ? 'text-slate-300' : 'text-rose-400') + '"></i>';
      const viewBtn = (d.fileName && d.fileUrl)
        ? '<button data-action="view-doc" data-nurse="' + n.id + '" data-doc="' + d.id + '" class="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50" data-tooltip="' + escapeHtml(t('doc_view')) + '"><i data-lucide="eye" class="h-3.5 w-3.5"></i></button>'
        : '';
      const uploadBtn = docsLocked ? '' : '<button data-action="upload-doc" data-nurse="' + n.id + '" data-doc="' + d.id + '" class="shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200 transition hover:bg-indigo-50">' + (d.fileName ? t('act_replace') : t('act_upload')) + '</button>';
      return '<div class="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2">' +
        statusIcon +
        '<div class="min-w-0 flex-1">' +
          '<p class="truncate text-xs font-semibold text-slate-700">' + escapeHtml(d.name) +
            (d.optional ? ' <span class="font-medium text-slate-400">(' + escapeHtml(t('doc_optional')) + ')</span>' : '') + '</p>' +
          (d.fileName ? '<p class="truncate text-[11px] text-slate-400">' + escapeHtml(d.fileName) + '</p>' : '') +
        '</div>' +
        viewBtn + uploadBtn +
      '</div>';
    }).join('');
    return '<div class="border-t border-slate-100 p-5 pt-4">' +
      '<p class="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><i data-lucide="paperclip" class="h-3.5 w-3.5"></i>' + t('personal_docs') + '</p>' +
      '<div class="grid grid-cols-1 gap-2 md:grid-cols-2">' + rows + '</div>' +
    '</div>';
  }

  function stepper(n) {
    const nodes = steps().map((s) => {
      let circle, line, labelCls;
      const blocked = s.id === n.currentStep && !canAdvance(n);
      if (s.id < n.currentStep) {
        circle = 'bg-emerald-500 text-white'; labelCls = 'text-emerald-600';
      } else if (s.id === n.currentStep) {
        circle = blocked ? 'bg-amber-500 text-white ring-4 ring-amber-100' : 'bg-indigo-600 text-white ring-4 ring-indigo-100';
        labelCls = blocked ? 'text-amber-600 font-bold' : 'text-indigo-600 font-bold';
      } else {
        circle = 'bg-slate-100 text-slate-400'; labelCls = 'text-slate-400';
      }
      const inner = s.id < n.currentStep
        ? '<i data-lucide="check" class="h-4 w-4"></i>'
        : (blocked ? '<i data-lucide="lock" class="h-3.5 w-3.5"></i>' : String(s.id));
      return '<div class="flex min-w-[78px] flex-1 flex-col items-center">' +
        '<div class="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold transition ' + circle + '">' + inner + '</div>' +
        '<span class="mt-2 text-center text-[10px] leading-tight ' + labelCls + '">' + escapeHtml(s.short) + '</span>' +
      '</div>';
    });
    // connectors between nodes
    const withConnectors = [];
    nodes.forEach((nd, i) => {
      withConnectors.push(nd);
      if (i < nodes.length - 1) {
        const done = (i + 1) < n.currentStep;
        withConnectors.push('<div class="mt-4 h-0.5 flex-1 min-w-[8px] ' + (done ? 'bg-emerald-400' : 'bg-slate-200') + '"></div>');
      }
    });

    // Two-team band above the phase nodes: RD team covers 4 of the 9 phases, Italy team 5.
    const teamBand =
      '<div class="mb-3 flex gap-1.5">' +
        '<div style="flex:4" class="rounded-lg px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ' + (stepTeam(Math.min(n.currentStep, LAST_STEP)) === 'rd' && n.currentStep < DONE_STEP ? 'bg-sky-100 text-sky-800 ring-sky-300' : 'bg-sky-50 text-sky-600 ring-sky-200') + '">🇩🇴 ' + escapeHtml(t('team_rd')) + ' · 1–4</div>' +
        '<div style="flex:5" class="rounded-lg px-2 py-1 text-center text-[10px] font-bold uppercase tracking-wide ring-1 ring-inset ' + (stepTeam(Math.min(n.currentStep, LAST_STEP)) === 'it' && n.currentStep < DONE_STEP ? 'bg-emerald-100 text-emerald-800 ring-emerald-300' : 'bg-emerald-50 text-emerald-600 ring-emerald-200') + '">🇮🇹 ' + escapeHtml(t('team_it')) + ' · 5–9</div>' +
      '</div>';

    return '<div data-tour="stepper" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">' +
      '<div class="mb-4 flex items-center gap-2">' +
        '<i data-lucide="route" class="h-5 w-5 text-indigo-500"></i>' +
        '<h3 class="text-sm font-bold text-slate-900">' + t('stepper_title') + '</h3>' +
      '</div>' +
      '<div class="overflow-x-auto pb-1"><div class="min-w-[700px]">' +
        teamBand +
        '<div class="flex items-start">' + withConnectors.join('') + '</div>' +
      '</div></div>' +
    '</div>';
  }

  function advanceBar(n) {
    const reasons = blockers(n);
    const ok = reasons.length === 0;
    const done = n.currentStep >= DONE_STEP;
    // Phase owned by the other team: the current operator can watch, not act.
    const locked = !done && !canOperatePhase(n.currentStep);

    const btn = done
      ? '<button disabled class="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white opacity-90"><i data-lucide="badge-check" class="h-4 w-4"></i>' + t('case_completed_btn') + '</button>'
      : locked
        ? '<button disabled class="inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-400"><i data-lucide="users" class="h-4 w-4"></i>' + t('advance_btn') + '</button>'
        : ok
          ? '<button data-action="advance" data-id="' + n.id + '" class="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700 active:scale-[.98]"><i data-lucide="arrow-right-circle" class="h-4 w-4"></i>' + t('advance_btn') + '</button>'
          : '<button disabled data-tooltip="' + escapeHtml(t('adv_blocked_tip')) + '" class="inline-flex cursor-not-allowed items-center gap-2 rounded-xl bg-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-400"><i data-lucide="lock" class="h-4 w-4"></i>' + t('advance_btn') + '</button>';

    const lockedNote = locked
      ? '<div class="mb-1.5 flex items-center gap-2 text-sm font-semibold text-sky-700"><i data-lucide="users" class="h-4 w-4"></i>' + t('phase_team_locked', { team: escapeHtml(teamTag(stepTeam(n.currentStep))) }) + '</div>'
      : '';
    const banner = done
      ? '<div class="flex items-center gap-2 text-sm text-emerald-600"><i data-lucide="check-circle-2" class="h-4 w-4"></i>' + t('adv_done_banner') + '</div>'
      : ok
        ? lockedNote + '<div class="flex items-center gap-2 text-sm text-emerald-600"><i data-lucide="check-circle-2" class="h-4 w-4"></i>' + t('adv_ok_banner', { state: escapeHtml(stepName(n.currentStep)) }) + '</div>'
        : '<div class="space-y-1.5">' + lockedNote +
            '<div class="flex items-center gap-2 text-sm font-semibold text-amber-600"><i data-lucide="alert-triangle" class="h-4 w-4"></i>' + t('adv_blocked_title') + '</div>' +
            '<ul class="ml-6 list-disc space-y-0.5 text-xs text-slate-500">' + reasons.slice(0, 6).map((r) => '<li>' + escapeHtml(r) + '</li>').join('') + '</ul>' +
          '</div>';

    return '<div data-tour="advance" class="flex flex-col items-start justify-between gap-4 rounded-2xl border p-5 shadow-sm sm:flex-row sm:items-center ' +
      (done ? 'border-emerald-200 bg-emerald-50/40' : locked ? 'border-sky-200 bg-sky-50/40' : ok ? 'border-indigo-200 bg-indigo-50/30' : 'border-amber-200 bg-amber-50/40') + '">' +
      '<div class="min-w-0 flex-1">' + banner + '</div>' + btn +
    '</div>';
  }

  function documentManager(n) {
    // Same team rule as checklist/advance: the other team's phase is read-only here too.
    const docsLocked = n.currentStep < DONE_STEP && !canOperatePhase(n.currentStep);
    const rows = n.documents.map((d) => {
      const cls = DOC_STATUS_CLS[d.status], icon = DOC_STATUS_ICON[d.status];
      const uploadBtn = '<button data-action="upload-doc" data-nurse="' + n.id + '" data-doc="' + d.id + '" class="rounded-lg px-2 py-1 text-xs font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200 transition hover:bg-indigo-50">' + (d.fileName ? t('act_replace') : t('act_upload')) + '</button>';
      const actions = docsLocked
        ? '<span class="text-[11px] text-slate-400">—</span>'
        : d.status === 'approved'
        ? '<div class="flex flex-wrap justify-end gap-1.5">' + uploadBtn +
            '<button data-action="reject-doc" data-nurse="' + n.id + '" data-doc="' + d.id + '" class="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-50">' + t('act_reject') + '</button></div>'
        : d.status === 'missing'
          ? uploadBtn
          : '<div class="flex flex-wrap justify-end gap-1.5">' + uploadBtn +
              '<button data-action="approve-doc" data-nurse="' + n.id + '" data-doc="' + d.id + '" class="rounded-lg px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 transition hover:bg-emerald-50">' + t('act_approve') + '</button>' +
              '<button data-action="reject-doc" data-nurse="' + n.id + '" data-doc="' + d.id + '" class="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 ring-1 ring-inset ring-rose-200 transition hover:bg-rose-50">' + t('act_reject') + '</button>' +
            '</div>';
      const fileLine = d.fileName
        ? '<p class="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400"><i data-lucide="paperclip" class="h-3 w-3"></i>' +
            (d.fileUrl ? '<button data-action="view-doc" data-nurse="' + n.id + '" data-doc="' + d.id + '" class="font-medium text-indigo-500 underline-offset-2 hover:underline">' + escapeHtml(d.fileName) + '</button>' : escapeHtml(d.fileName)) +
            (d.fileTooBig ? ' <span class="text-amber-500">(' + escapeHtml(t('file_too_big')) + ')</span>' : '') + '</p>'
        : '';
      return '<tr class="border-b border-slate-100 last:border-0">' +
        '<td class="py-3 pr-2"><p class="text-sm font-medium text-slate-800">' + escapeHtml(d.name) +
          ' <span class="ml-0.5 inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-slate-400">' + escapeHtml(d.language) + '</span>' +
          (d.optional ? ' <span class="ml-1 inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">' + escapeHtml(t('doc_optional')) + '</span>' : '') + '</p>' +
          '<p class="text-[11px] text-slate-400">' + t('validity', { v: (d.validity ? escapeHtml(d.validity) : '—') }) +
            (d.uploadDate ? ' · ' + t('th_uploaded') + ': ' + formatDate(d.uploadDate) : '') + '</p>' + fileLine + '</td>' +
        '<td class="px-2 py-3"><span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ' + cls + '"><i data-lucide="' + icon + '" class="h-3 w-3"></i>' + docStatusLabel(d.status) + '</span></td>' +
        '<td class="py-3 pl-2 text-right">' + actions + '</td>' +
      '</tr>';
    }).join('');

    const approved = n.documents.filter((d) => d.status === 'approved').length;

    return '<div data-tour="docs" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">' +
      '<div class="mb-3 flex items-center gap-2">' +
        '<i data-lucide="files" class="h-5 w-5 text-indigo-500"></i>' +
        '<h3 class="text-sm font-bold text-slate-900">' + t('docs_title') + '</h3>' +
        '<span class="ml-auto text-xs text-slate-400">' + t('docs_count', { a: approved, b: n.documents.length }) + '</span>' +
        (docsLocked ? '' : '<button data-action="open-add-doc" data-nurse="' + n.id + '" class="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200 transition hover:bg-indigo-100"><i data-lucide="plus" class="h-3 w-3"></i>' + t('add') + '</button>') +
      '</div>' +
      (docsLocked ? '<div class="mb-2 flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-200"><i data-lucide="users" class="h-3.5 w-3.5"></i>' + t('phase_team_locked', { team: escapeHtml(teamTag(stepTeam(n.currentStep))) }) + '</div>' : '') +
      '<div class="-mx-5 overflow-x-auto px-5">' +
        '<table class="w-full min-w-[340px]">' +
          '<thead><tr class="border-b border-slate-200 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">' +
            '<th class="pb-2 pr-2">' + t('th_document') + '</th><th class="px-2 pb-2">' + t('th_status') + '</th><th class="pb-2 pl-2 text-right">' + t('th_actions') + '</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>' +
    '</div>';
  }

  function checklistSection(n) {
    const items = n.checklist[n.currentStep] || [];
    const done = items.filter((i) => i.done).length;
    const locked = n.currentStep < DONE_STEP && !canOperatePhase(n.currentStep);
    const lockedNote = locked
      ? '<div class="mb-2 flex items-center gap-2 rounded-xl bg-sky-50 p-3 text-xs font-medium text-sky-700 ring-1 ring-inset ring-sky-200"><i data-lucide="users" class="h-4 w-4 shrink-0"></i>' + t('phase_team_locked', { team: escapeHtml(teamTag(stepTeam(n.currentStep))) }) + '</div>'
      : '';
    const list = n.currentStep >= DONE_STEP
      ? '<div class="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700 ring-1 ring-inset ring-emerald-200"><i data-lucide="check-circle-2" class="h-4 w-4"></i>' + t('checklist_all_done') + '</div>'
      : items.map((i) =>
          '<label class="flex items-start gap-3 rounded-xl border p-3 transition ' + (locked ? 'cursor-not-allowed opacity-70 ' : 'cursor-pointer ') + (i.done ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white' + (locked ? '' : ' hover:bg-slate-50')) + '">' +
            '<input type="checkbox" ' + (i.done ? 'checked' : '') + (locked ? ' disabled' : '') + ' data-action="toggle-check" data-nurse="' + n.id + '" data-step="' + n.currentStep + '" data-item="' + i.id + '" class="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />' +
            '<span class="text-sm ' + (i.done ? 'text-slate-400 line-through' : 'text-slate-700') + '">' + escapeHtml(checklistLabel(i.step, i.idx)) + '</span>' +
          '</label>'
        ).join('');

    return '<div data-tour="checklist" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">' +
      '<div class="mb-3 flex items-center gap-2">' +
        '<i data-lucide="list-checks" class="h-5 w-5 text-indigo-500"></i>' +
        '<h3 class="text-sm font-bold text-slate-900">' + t('checklist_title') + '</h3>' +
        (n.currentStep < DONE_STEP ? '<span class="ml-auto text-xs text-slate-400">' + t('checklist_count', { a: done, b: items.length, s: n.currentStep }) + '</span>' : '') +
      '</div>' +
      '<p class="mb-3 text-xs text-slate-400">' + t('checklist_sub', { state: escapeHtml(n.currentStep >= DONE_STEP ? t('state_done') : stepName(n.currentStep)) }) + '</p>' +
      lockedNote +
      '<div class="space-y-2">' + list + '</div>' +
    '</div>';
  }

  function relocationCard(n) {
    const r = n.relocation || {};
    const row = (icon, label, value) =>
      '<div class="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3">' +
        '<i data-lucide="' + icon + '" class="mt-0.5 h-4 w-4 shrink-0 text-indigo-400"></i>' +
        '<div><p class="text-[11px] font-semibold uppercase tracking-wide text-slate-400">' + label + '</p>' +
        '<p class="text-sm font-medium text-slate-700">' + (value ? escapeHtml(value) : '<span class="text-slate-300">' + t('to_define') + '</span>') + '</p></div>' +
      '</div>';
    return '<div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">' +
      '<div class="mb-3 flex items-center gap-2">' +
        '<i data-lucide="plane" class="h-5 w-5 text-indigo-500"></i>' +
        '<h3 class="text-sm font-bold text-slate-900">' + t('reloc_title') + '</h3>' +
        '<button data-action="open-relocation" data-id="' + n.id + '" class="ml-auto inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200 transition hover:bg-indigo-100"><i data-lucide="pencil" class="h-3 w-3"></i>' + t('edit') + '</button>' +
      '</div>' +
      '<div class="space-y-2.5">' +
        row('ticket', t('reloc_flight'), r.flight) +
        row('home', t('reloc_housing'), r.housing) +
        row('user-check', t('reloc_tutor'), r.tutor) +
        row('file-signature', t('reloc_contract'), r.contractStatus) +
      '</div>' +
    '</div>';
  }

  function communicationLog(n) {
    const ICONS = { note: 'message-square', call: 'phone', alert: 'bell-ring', system: 'cpu' };
    const TONES = {
      note: 'bg-indigo-100 text-indigo-600',
      call: 'bg-emerald-100 text-emerald-600',
      alert: 'bg-rose-100 text-rose-600',
      system: 'bg-slate-200 text-slate-500',
    };
    const entries = n.logs.map((l) =>
      '<li class="relative flex gap-3 pb-4 last:pb-0">' +
        '<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full ' + (TONES[l.type] || TONES.system) + '"><i data-lucide="' + (ICONS[l.type] || 'cpu') + '" class="h-3.5 w-3.5"></i></span>' +
        '<div class="min-w-0 flex-1">' +
          '<div class="flex items-center justify-between gap-2">' +
            '<p class="text-xs font-semibold text-slate-700">' + escapeHtml(l.author) + '</p>' +
            '<p class="text-[11px] text-slate-400">' + formatDateTime(l.at) + '</p>' +
          '</div>' +
          '<p class="mt-0.5 text-sm text-slate-600">' + escapeHtml(l.text) + '</p>' +
        '</div>' +
      '</li>'
    ).join('');

    return '<div data-tour="log" class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">' +
      '<div class="mb-3 flex items-center gap-2">' +
        '<i data-lucide="history" class="h-5 w-5 text-indigo-500"></i>' +
        '<h3 class="text-sm font-bold text-slate-900">' + t('log_title') + '</h3>' +
      '</div>' +
      '<form data-action="add-log-form" data-nurse="' + n.id + '" class="mb-4 space-y-2">' +
        '<textarea id="log-text-' + n.id + '" rows="2" placeholder="' + escapeHtml(t('log_ph')) + '" ' +
          'class="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"></textarea>' +
        '<div class="flex items-center gap-2">' +
          '<select id="log-type-' + n.id + '" class="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 outline-none focus:border-indigo-300">' +
            '<option value="note">' + t('log_note') + '</option><option value="call">' + t('log_call') + '</option><option value="alert">' + t('log_alert') + '</option>' +
          '</select>' +
          '<button type="submit" class="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700"><i data-lucide="send" class="h-3.5 w-3.5"></i>' + t('log_register') + '</button>' +
        '</div>' +
      '</form>' +
      '<ul class="relative max-h-80 overflow-y-auto pr-1">' + entries + '</ul>' +
    '</div>';
  }

  // =====================================================================================
  //  LOGIN SCREEN (rendered only when Firebase is configured)
  // =====================================================================================
  function langSwitcher(dark) {
    const base = dark
      ? { on: 'bg-white/20 text-white', off: 'text-slate-300 hover:text-white' }
      : { on: 'bg-white text-indigo-700 shadow-sm', off: 'text-slate-500 hover:text-slate-800' };
    const btn = (code) => '<button data-action="set-lang" data-lang="' + code + '" class="rounded-lg px-2 py-1 text-[11px] font-bold uppercase transition ' + (LANG === code ? base.on : base.off) + '">' + code + '</button>';
    return '<div class="flex items-center gap-0.5 rounded-xl ' + (dark ? 'bg-white/10' : 'bg-slate-100') + ' p-0.5">' + btn('it') + btn('en') + btn('es') + '</div>';
  }

  function loginScreen() {
    return '<div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 px-4 py-10">' +
      '<div class="w-full max-w-md animate-fadeIn">' +
        '<div class="mb-4 flex justify-center">' + langSwitcher(true) + '</div>' +
        '<div class="mb-6 flex flex-col items-center text-center">' +
          '<img src="' + logoUrl + '" alt="DHL Nurses" class="mb-3 h-14 w-14 rounded-2xl shadow-xl shadow-indigo-900/40 ring-1 ring-white/20" />' +
          '<h1 class="text-2xl font-extrabold text-white">DHL Nurses</h1>' +
          '<p class="mt-1 text-sm text-slate-300">' + t('login_subtitle') + '</p>' +
        '</div>' +
        '<div class="rounded-2xl border border-white/10 bg-white p-6 shadow-2xl">' +
          '<div id="auth-error" class="mb-3 hidden rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-600 ring-1 ring-inset ring-rose-200"></div>' +
          '<form data-action="login-form" class="space-y-3">' +
            '<div>' +
              '<label class="mb-1 block text-xs font-semibold text-slate-500">' + t('login_email') + '</label>' +
              '<input id="auth-email" type="email" autocomplete="username" placeholder="' + escapeHtml(t('email_ph')) + '" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100" />' +
            '</div>' +
            '<div>' +
              '<label class="mb-1 block text-xs font-semibold text-slate-500">' + t('login_password') + '</label>' +
              '<input id="auth-pass" type="password" autocomplete="current-password" placeholder="••••••••" class="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100" />' +
              '<button type="button" data-action="forgot-password" class="mt-1.5 block w-full text-right text-xs font-medium text-indigo-500 transition hover:underline">' + t('login_forgot') + '</button>' +
            '</div>' +
            '<div class="flex gap-2 pt-1">' +
              '<button type="submit" data-intent="login" class="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700">' + t('login_signin') + '</button>' +
              '<button type="submit" data-intent="signup" class="rounded-xl px-4 py-2.5 text-sm font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200 transition hover:bg-indigo-50">' + t('login_signup') + '</button>' +
            '</div>' +
          '</form>' +
          '<div class="my-4 flex items-center gap-3"><div class="h-px flex-1 bg-slate-100"></div><span class="text-[11px] font-medium text-slate-400">' + t('login_or') + '</span><div class="h-px flex-1 bg-slate-100"></div></div>' +
          '<button data-action="login-google" class="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">' +
            '<svg class="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"/><path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>' +
            t('login_google') + '</button>' +
          '<p class="mt-4 text-center text-[11px] text-slate-400">' + t('login_isolated') + '</p>' +
        '</div>' +
        '<p class="mt-4 text-center text-xs text-slate-400">' + t('login_protected') + '</p>' +
      '</div>' +
    '</div>';
  }

  function showAuthError(msg) {
    const el = document.getElementById('auth-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  }
  function translateAuthError(e) {
    const code = (e && e.code) || '';
    const map = {
      'auth/invalid-email': 'auth_invalid_email',
      'auth/user-not-found': 'auth_user_not_found',
      'auth/wrong-password': 'auth_wrong_password',
      'auth/invalid-credential': 'auth_invalid_credential',
      'auth/email-already-in-use': 'auth_email_in_use',
      'auth/weak-password': 'auth_weak_password',
      'auth/popup-closed-by-user': 'auth_popup_closed',
      'auth/operation-not-allowed': 'auth_not_allowed',
    };
    return map[code] ? t(map[code]) : t('auth_generic', { m: (e && e.message ? e.message : code) });
  }

  async function emailAuth(isSignup) {
    if (!auth) return;
    const email = (document.getElementById('auth-email') || {}).value || '';
    const pass = (document.getElementById('auth-pass') || {}).value || '';
    if (!email.trim() || !pass) { showAuthError(t('auth_need_credentials')); return; }
    try {
      if (isSignup) await auth.createUserWithEmailAndPassword(email.trim(), pass);
      else await auth.signInWithEmailAndPassword(email.trim(), pass);
    } catch (e) { showAuthError(translateAuthError(e)); }
  }
  async function googleAuth() {
    if (!auth) return;
    try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
    catch (e) { showAuthError(translateAuthError(e)); }
  }
  async function doLogout() { closeModal(); if (auth) { try { await auth.signOut(); } catch (e) { /* ignore */ } } }

  // =====================================================================================
  //  FIREBASE INIT + REMOTE STATE
  // =====================================================================================
  function initFirebase() {
    if (!firebaseConfigured()) return false;
    try {
      firebase.initializeApp(FIREBASE_CONFIG);
      auth = firebase.auth();
      db = firebase.firestore();
      fbEnabled = true;
      auth.onAuthStateChanged(async (user) => {
        authResolved = true;
        currentUser = user;
        tourAutoChecked = false; // re-evaluate tour for the new session
        userClaims = null;
        if (user) {
          // Read the role from Firebase custom claims — the trusted, server-set source.
          try { const res = await user.getIdTokenResult(); userClaims = res.claims || null; } catch (e) { userClaims = null; }
          // Instant start: when a previous session left a local cache, render it right away
          // and refresh from Firestore in the background (a second render follows on arrival).
          let hasCache = false;
          try { hasCache = !!localStorage.getItem(STORAGE_KEY); } catch (e) { hasCache = false; }
          if (hasCache) {
            render();
            loadRemoteState().then(() => { render(); attachRealtimeSync(); });
          } else {
            await loadRemoteState();
            render();
            attachRealtimeSync();
          }
        } else {
          // Signed out: stop listening and forget the cloud baseline of the previous session.
          detachRealtimeSync();
          lastSynced = { nurses: {}, requests: {}, settingsJson: '' };
          syncStatus = 'idle'; syncErrorMsg = '';
          render();
        }
      });
      return true;
    } catch (e) {
      console.warn('Init Firebase fallito, passo a modalità locale:', e && e.message);
      fbEnabled = false; auth = null; db = null;
      return false;
    }
  }

  async function loadRemoteState() {
    remoteLoading = true;
    try {
      if (SHARED_WORKSPACE) {
        await loadSharedState();
      } else {
        const ref = db.collection('nurseflow').doc(currentUser.uid);
        const snap = await ref.get();
        if (snap.exists && snap.data() && snap.data().state) {
          state = normalizeState(snap.data().state);
        } else {
          state = seedState();
          await ref.set({ state: state, updatedAt: serverTs() });
        }
      }
    } catch (e) {
      console.warn('Lettura Firestore fallita, uso cache locale:', e && e.message);
      state = loadState();
      setSyncError(t('sync_ctx_load'), e);
    }
    remoteLoading = false;
    state.nurses.forEach((n) => { n.status = deriveStatus(n); });
  }

  // Shared team workspace: cases and settings come from two separate documents.
  // UI preferences (view, selection, language, theme) stay local — they're not shared.
  async function loadSharedState() {
    const data = db.collection('organizations').doc(ORG_ID).collection('data');
    const seed = seedState();
    const [casesSnap, settingsSnap] = await Promise.all([data.doc('cases').get(), data.doc('settings').get()]);
    state = seed;
    if (casesSnap.exists && Array.isArray(casesSnap.data().nurses)) state.nurses = casesSnap.data().nurses;
    if (casesSnap.exists) state.requests = Array.isArray(casesSnap.data().requests) ? casesSnap.data().requests : [];
    if (settingsSnap.exists && settingsSnap.data().settings) state.settings = settingsSnap.data().settings;
    normalizeState(state);
    // Cloud baseline for the per-record merge: everything just read is, by definition, in sync.
    lastSynced.nurses = snapshotMap(state.nurses);
    lastSynced.requests = snapshotMap(state.requests || []);
    lastSynced.settingsJson = stableJson(state.settings);
    state.selectedNurseId = state.nurses[0] ? state.nurses[0].id : null;
    // First-run initialization: seed the shared docs (writes succeed only for an admin).
    if (!casesSnap.exists) data.doc('cases').set({ nurses: state.nurses, requests: state.requests || [], updatedAt: serverTs() }, { merge: true }).catch(() => {});
    if (!settingsSnap.exists && isAdmin()) data.doc('settings').set({ settings: state.settings, updatedAt: serverTs() }, { merge: true }).catch(() => {});
  }

  // =====================================================================================
  //  INTERACTIVE GUIDED TOUR
  // =====================================================================================
  const TOUR_SEEN_KEY = 'nurseflow.tourSeen.v1';
  let tour = { active: false, i: 0 };
  const TOUR_STEPS = [
    { view: 'dashboard', sel: '[data-tour="views"]', key: 'tour1' },
    { view: 'dashboard', sel: '[data-tour="kpi"]', key: 'tour2' },
    { view: 'dashboard', sel: '[data-tour="risk"]', key: 'tour3' },
    { view: 'cases', sel: '[data-tour="master"]', key: 'tour4' },
    { view: 'cases', sel: '[data-tour="stepper"]', key: 'tour5' },
    // The matching view right after the 9-phase story: phase 7 is its natural hook.
    { view: 'matching', sel: '[data-tour="matching"]', key: 'tour10' },
    { view: 'cases', sel: '[data-tour="advance"]', key: 'tour6' },
    { view: 'cases', sel: '[data-tour="docs"]', key: 'tour7' },
    { view: 'cases', sel: '[data-tour="checklist"]', key: 'tour8' },
    { view: 'cases', sel: '[data-tour="log"]', key: 'tour9' },
  ];

  function ensureTourDom() {
    if (document.getElementById('tour-layer')) return;
    const layer = document.createElement('div');
    layer.id = 'tour-layer';
    layer.innerHTML = '<div id="tour-hole"></div><div id="tour-card"></div>';
    document.body.appendChild(layer);
  }
  function removeTourDom() { const l = document.getElementById('tour-layer'); if (l) l.remove(); }

  function maybeAutoStartTour() {
    if (tourAutoChecked) return;
    tourAutoChecked = true;
    if (tour.active) return;
    let seen = false;
    try { seen = localStorage.getItem(TOUR_SEEN_KEY) === '1'; } catch (e) { /* ignore */ }
    if (!seen) setTimeout(startTour, 450);
  }
  function startTour() { ensureTourDom(); tour.active = true; tour.i = 0; renderTourStep(); }
  function tourNext() { if (tour.i < TOUR_STEPS.length - 1) { tour.i++; renderTourStep(); } else endTour(true); }
  function tourPrev() { if (tour.i > 0) { tour.i--; renderTourStep(); } }
  function endTour(remember) {
    tour.active = false; removeTourDom();
    if (remember) { try { localStorage.setItem(TOUR_SEEN_KEY, '1'); } catch (e) { /* ignore */ } }
  }

  function tourCardHtml(step) {
    const dots = TOUR_STEPS.map((_, i) =>
      '<span class="h-1.5 rounded-full transition-all ' + (i === tour.i ? 'w-5 bg-indigo-600' : 'w-1.5 bg-slate-300') + '"></span>').join('');
    const isLast = tour.i === TOUR_STEPS.length - 1;
    return '<div class="flex items-center justify-between">' +
        '<span class="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">' + t('guide') + ' ' + (tour.i + 1) + '/' + TOUR_STEPS.length + '</span>' +
        '<button data-action="tour-skip" class="text-slate-300 transition hover:text-slate-500"><i data-lucide="x" class="h-4 w-4"></i></button>' +
      '</div>' +
      '<h4 class="mt-1.5 text-base font-extrabold text-slate-900">' + t(step.key + '_title') + '</h4>' +
      '<p class="mt-1.5 text-sm leading-relaxed text-slate-600">' + t(step.key + '_text') + '</p>' +
      '<div class="mt-4 flex items-center justify-between">' +
        '<div class="flex items-center gap-1">' + dots + '</div>' +
        '<div class="flex items-center gap-2">' +
          (tour.i > 0 ? '<button data-action="tour-prev" class="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50">' + t('tour_back') + '</button>' : '') +
          '<button data-action="tour-next" class="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700">' + (isLast ? t('tour_finish') : t('tour_next')) + '<i data-lucide="' + (isLast ? 'check' : 'arrow-right') + '" class="h-3.5 w-3.5"></i></button>' +
        '</div>' +
      '</div>';
  }

  function renderTourStep() {
    const step = TOUR_STEPS[tour.i];
    let needRender = false;
    if (step.view && state.view !== step.view) { state.view = step.view; saveState(); needRender = true; }
    if (step.view === 'cases' && !getNurse(state.selectedNurseId) && state.nurses.length) {
      state.selectedNurseId = state.nurses[0].id; needRender = true;
    }
    if (needRender) render();
    requestAnimationFrame(() => requestAnimationFrame(() => positionTour(step)));
  }

  function positionTour(step) {
    if (!tour.active) return;
    ensureTourDom();
    const el = document.querySelector(step.sel);
    const hole = document.getElementById('tour-hole');
    const card = document.getElementById('tour-card');
    card.innerHTML = tourCardHtml(step);
    lucide.createIcons();

    if (!el) { // target missing: center the card, hide the spotlight
      hole.style.opacity = '0';
      card.style.top = '50%'; card.style.left = '50%';
      card.style.transform = 'translate(-50%, -50%)'; card.style.opacity = '1';
      return;
    }
    card.style.transform = 'none';
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { el.scrollIntoView(); }
    requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const pad = 8;
      hole.style.opacity = '1';
      hole.style.top = (r.top - pad) + 'px';
      hole.style.left = (r.left - pad) + 'px';
      hole.style.width = (r.width + pad * 2) + 'px';
      hole.style.height = (r.height + pad * 2) + 'px';
      const cr = card.getBoundingClientRect();
      let top = r.bottom + 14;
      if (top + cr.height > window.innerHeight - 12) top = r.top - cr.height - 14;
      if (top < 12) top = 12;
      let left = r.left + r.width / 2 - cr.width / 2;
      left = Math.max(12, Math.min(left, window.innerWidth - cr.width - 12));
      card.style.top = top + 'px';
      card.style.left = left + 'px';
      card.style.opacity = '1';
    });
  }

  // Keep the spotlight aligned on resize/scroll while the tour is active.
  window.addEventListener('resize', () => { if (tour.active) positionTour(TOUR_STEPS[tour.i]); });
  window.addEventListener('scroll', () => { if (tour.active) positionTour(TOUR_STEPS[tour.i]); }, true);

  // =====================================================================================
  //  EVENT DELEGATION
  // =====================================================================================
  document.addEventListener('click', (e) => {
    // Close the mobile "tools" dropdown when clicking outside it (or its toggle button).
    const _menu = document.getElementById('hdr-tools');
    if (_menu && _menu.classList.contains('open') && !e.target.closest('#hdr-tools') && !e.target.closest('#hdr-tools-btn')) {
      _menu.classList.remove('open');
    }
    const t = e.target.closest('[data-action]');
    if (!t) return;
    const a = t.getAttribute('data-action');
    if (a === 'toggle-tools') { if (_menu) _menu.classList.toggle('open'); return; }
    switch (a) {
      case 'set-view': setView(t.getAttribute('data-view')); break;
      case 'open-nurse': closeModal(); selectNurse(t.getAttribute('data-id')); break;
      case 'set-filter': setFilter(t.getAttribute('data-filter')); break;
      case 'advance': advanceStatus(t.getAttribute('data-id')); break;
      case 'approve-doc': approveDoc(t.getAttribute('data-nurse'), t.getAttribute('data-doc')); break;
      case 'reject-doc': rejectDoc(t.getAttribute('data-nurse'), t.getAttribute('data-doc')); break;
      case 'upload-doc': triggerUpload(t.getAttribute('data-nurse'), t.getAttribute('data-doc')); break;
      case 'open-edit-nurse': openNewNurseModal(t.getAttribute('data-id')); break;
      case 'open-relocation': openRelocationModal(t.getAttribute('data-id')); break;
      case 'save-relocation': saveRelocation(); break;
      case 'view-doc': openDocPreview(t.getAttribute('data-nurse'), t.getAttribute('data-doc')); break;
      case 'doc-filter': state.docFilter = t.getAttribute('data-filter'); saveState(); render(); break;
      case 'delete-nurse': deleteNurse(t.getAttribute('data-id')); break;
      case 'export-csv': exportCandidatesCsv(); break;
      case 'show-expiring': state.view = 'documents'; state.docFilter = 'expiring'; commit(); break;
      case 'open-matching': state.view = 'matching'; commit(); break;
      case 'goto-cases': state.statusFilter = t.getAttribute('data-filter') || 'all'; state.selectedNurseId = null; state.view = 'cases'; commit(); break;
      case 'reset': resetData(); break;
      case 'start-tour': startTour(); break;
      case 'tour-next': tourNext(); break;
      case 'tour-prev': tourPrev(); break;
      case 'tour-skip': endTour(true); break;
      case 'login-google': googleAuth(); break;
      case 'logout': doLogout(); break;
      case 'open-new-nurse': openNewNurseModal(); break;
      case 'create-nurse': createNurseFromForm(); break;
      case 'open-add-doc': openAddDocModal(t.getAttribute('data-nurse')); break;
      case 'create-doc': createDocFromForm(); break;
      case 'close-modal': closeModal(); break;
      case 'open-profile': openProfileModal(); break;
      case 'save-profile': saveProfile(); break;
      case 'reset-password': sendPasswordReset(); break;
      case 'open-manual': openManual(); break;
      case 'close-manual': closeManual(); break;
      case 'open-guide': openGuide(); break;
      case 'close-guide': closeGuide(); break;
      case 'print-privacy': openPrivacyForm(t.getAttribute('data-id')); break;
      case 'open-sheet': openNurseSheet(t.getAttribute('data-id')); break;
      case 'close-sheet': closeNurseSheet(); break;
      case 'backup-export': exportBackup(); break;
      case 'backup-import': triggerImportBackup(); break;
      case 'profile-tab': profileTab = t.getAttribute('data-tab'); render(); break;
      case 'welcome-start': closeWelcome(); if (state.view !== 'dashboard') { state.view = 'dashboard'; render(); } startTour(); break;
      case 'welcome-explore': closeWelcome(); break;
      case 'welcome-detail': welcomeDetail(t.getAttribute('data-key')); break;
      case 'welcome-detail-close': closeWelcomeDetail(); break;
      case 'welcome-lang': setLang(t.getAttribute('data-lang')); openWelcome(); break;
      case 'close-privacy': closePrivacyForm(); break;
      case 'set-lang': setLang(t.getAttribute('data-lang')); break;
      case 'toggle-theme': toggleTheme(); break;
      case 'show-risk': state.statusFilter = 'risk'; state.view = 'cases'; commit(); break;
      case 'open-entity': openEntityModal(t.getAttribute('data-type'), t.getAttribute('data-id')); break;
      case 'save-entity': saveEntity(); break;
      case 'open-create-account': openCreateAccountModal(t.getAttribute('data-id')); break;
      case 'do-create-account': createOperatorAccount(); break;
      case 'forgot-password': forgotPassword(); break;
      case 'open-request': openRequestModal(t.getAttribute('data-id')); break;
      case 'save-request': saveRequestFromForm(); break;
      case 'delete-request': deleteRequest(t.getAttribute('data-id')); break;
      case 'find-candidates': openMatchCandidates(t.getAttribute('data-id')); break;
      case 'assign-match': assignMatch(t.getAttribute('data-req'), t.getAttribute('data-nurse')); break;
      case 'unassign-match': unassignMatch(t.getAttribute('data-id'), t.getAttribute('data-nurse')); break;
      case 'close-request': closeRequest(t.getAttribute('data-id')); break;
      case 'reopen-request': reopenRequest(t.getAttribute('data-id')); break;
      case 'delete-entity': deleteEntity(t.getAttribute('data-type'), t.getAttribute('data-id')); break;
      case 'set-demo-role': setDemoRole(t.getAttribute('data-role')); break;
      case 'sync-info': syncInfo(); break;
    }
    // Any action selected from the mobile tools dropdown should close it.
    const _m2 = document.getElementById('hdr-tools');
    if (_m2) _m2.classList.remove('open');
  });

  // Close any open modal / tour with the Escape key.
  document.addEventListener('keydown', (e) => {
    // Arrow keys drive the interactive guided tour: →/↓ next step, ←/↑ previous.
    if (tour.active && !document.getElementById('modal-layer')) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); tourNext(); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); tourPrev(); return; }
    }
    if (e.key !== 'Escape') return;
    if (document.getElementById('wl-detail')) closeWelcomeDetail();
    else if (document.getElementById('welcome-overlay')) closeWelcome();
    else if (document.getElementById('modal-layer')) closeModal();
    else if (document.getElementById('sheet-overlay')) closeNurseSheet();
    else if (document.getElementById('privacy-overlay')) closePrivacyForm();
    else if (document.getElementById('guide-overlay')) closeGuide();
    else if (document.getElementById('manual-overlay')) closeManual();
    else if (tour.active) endTour(true);
  });

  document.addEventListener('change', (e) => {
    const t = e.target.closest('[data-action="toggle-check"]');
    if (t) {
      toggleChecklist(t.getAttribute('data-nurse'), parseInt(t.getAttribute('data-step'), 10), t.getAttribute('data-item'));
    }
  });

  document.addEventListener('input', (e) => {
    const t = e.target.closest('[data-action="search"]');
    if (t) { state.search = t.value; saveState();
      // Re-render the master list only, preserving input focus & caret.
      const host = document.getElementById('cases-host');
      if (host) {
        const caret = t.selectionStart;
        host.innerHTML = casesBody();
        lucide.createIcons();
        const fresh = document.getElementById('search-input');
        if (fresh) { fresh.focus(); try { fresh.setSelectionRange(caret, caret); } catch (_) {} }
      }
      return;
    }
    const ds = e.target.closest('[data-action="doc-search"]');
    if (ds) { state.docSearch = ds.value; saveState();
      const host = document.getElementById('archive-host');
      if (host) {
        const caret = ds.selectionStart;
        host.innerHTML = archiveBody();
        lucide.createIcons();
        const fresh = document.getElementById('doc-search-input');
        if (fresh) { fresh.focus(); try { fresh.setSelectionRange(caret, caret); } catch (_) {} }
      }
    }
  });

  document.addEventListener('submit', (e) => {
    const logForm = e.target.closest('[data-action="add-log-form"]');
    if (logForm) {
      e.preventDefault();
      const nurseId = logForm.getAttribute('data-nurse');
      const ta = document.getElementById('log-text-' + nurseId);
      const sel = document.getElementById('log-type-' + nurseId);
      addLog(nurseId, sel ? sel.value : 'note', ta ? ta.value : '');
      return;
    }
    const authForm = e.target.closest('[data-action="login-form"]');
    if (authForm) {
      e.preventDefault();
      const intent = e.submitter && e.submitter.getAttribute('data-intent') === 'signup';
      emailAuth(intent);
    }
  });


  // ---------- Demo welcome page (presentation cover with auto-playing feature tour) ----------
  // Scrolling landing: one section per feature, revealed on scroll, each with a detail popup.
  const LANDING_SECTIONS = [
    { icon: 'layout-dashboard', key: 'wl_s1', tint: 'indigo' },
    { icon: 'route', key: 'wl_s2', tint: 'sky' },
    { icon: 'files', key: 'wl_s4', tint: 'amber' },
    { icon: 'shield-check', key: 'wl_s3', tint: 'emerald' },
    { icon: 'target', key: 'wl_s5', tint: 'indigo' },
    { icon: 'bell-ring', key: 'wl_s7', tint: 'rose' },
    { icon: 'printer', key: 'wl_s8', tint: 'sky' },
    { icon: 'sparkles', key: 'wl_s6', tint: 'violet' },
  ];
  let welcomeObserver = null;

  // Lightweight inline-SVG previews of the real app screens (self-contained, no image
  // assets → immune to caching). One per welcome slide, matched to its topic.
  function welcomePreview(key) {
    const frame = (inner) =>
      '<svg viewBox="0 0 320 140" xmlns="http://www.w3.org/2000/svg" class="w-full rounded-xl">' +
        '<rect x="1" y="1" width="318" height="138" rx="12" fill="#f8fafc" stroke="#e2e8f0"/>' +
        '<circle cx="16" cy="15" r="3" fill="#cbd5e1"/><circle cx="26" cy="15" r="3" fill="#cbd5e1"/><circle cx="36" cy="15" r="3" fill="#cbd5e1"/>' +
        '<rect x="250" y="10" width="58" height="10" rx="5" fill="#e2e8f0"/>' +
        '<line x1="0" y1="28" x2="320" y2="28" stroke="#eaeff5"/>' + inner +
      '</svg>';
    const F = 'font-family="Inter,sans-serif"';
    if (key === 'wl_s1') { // Dashboard: KPI tiles + risk row
      const tile = (x, num, color) =>
        '<rect x="' + x + '" y="38" width="90" height="52" rx="8" fill="#ffffff" stroke="#eef2f7"/>' +
        '<rect x="' + (x + 10) + '" y="48" width="32" height="6" rx="3" fill="#cbd5e1"/>' +
        '<text x="' + (x + 10) + '" y="80" ' + F + ' font-size="22" font-weight="800" fill="#0f172a">' + num + '</text>' +
        '<rect x="' + (x + 62) + '" y="48" width="18" height="18" rx="5" fill="' + color + '"/>';
      return frame(
        tile(14, '6', '#6366f1') + tile(115, '3', '#10b981') + tile(216, '1', '#f59e0b') +
        '<rect x="14" y="100" width="292" height="28" rx="8" fill="#fff1f2" stroke="#fecdd3"/>' +
        '<circle cx="31" cy="114" r="7" fill="#f43f5e"/>' +
        '<rect x="46" y="108" width="120" height="6" rx="3" fill="#fb7185"/>' +
        '<rect x="46" y="118" width="82" height="4" rx="2" fill="#fecdd3"/>' +
        '<text x="292" y="118" text-anchor="end" ' + F + ' font-size="12" font-weight="800" fill="#e11d48">74 gg</text>');
    }
    if (key === 'wl_s2') { // Workflow: 3 one-off framework phases + two team bands + 9 phase nodes (3+9=12)
      const node = (x, n, kind) => {
        const fill = kind === 'done' ? '#10b981' : (kind === 'cur' ? '#4f46e5' : '#e2e8f0');
        const tx = kind === 'future' ? '#94a3b8' : '#ffffff';
        return (kind === 'cur' ? '<circle cx="' + x + '" cy="98" r="13" fill="#c7d2fe"/>' : '') +
          '<circle cx="' + x + '" cy="98" r="10" fill="' + fill + '"/>' +
          '<text x="' + x + '" y="102" text-anchor="middle" ' + F + ' font-size="10" font-weight="700" fill="' + tx + '">' + n + '</text>';
      };
      const xs = [28, 60, 92, 124, 156, 188, 220, 252, 284];
      let nodes = '<line x1="28" y1="98" x2="284" y2="98" stroke="#e2e8f0" stroke-width="2"/>';
      xs.forEach((x, i) => { const n = i + 1; nodes += node(x, n, n < 7 ? 'done' : (n === 7 ? 'cur' : 'future')); });
      return frame(
        '<rect x="14" y="34" width="292" height="16" rx="6" fill="#f5f3ff" stroke="#ddd6fe"/>' +
        '<circle cx="26" cy="42" r="4" fill="#8b5cf6"/><circle cx="37" cy="42" r="4" fill="#8b5cf6"/><circle cx="48" cy="42" r="4" fill="#8b5cf6"/>' +
        '<text x="180" y="46" text-anchor="middle" ' + F + ' font-size="8.5" font-weight="800" fill="#6d28d9">3× ACCORDI QUADRO · UNA TANTUM</text>' +
        '<rect x="14" y="56" width="126" height="18" rx="6" fill="#e0f2fe" stroke="#bae6fd"/>' +
        '<text x="77" y="69" text-anchor="middle" ' + F + ' font-size="9" font-weight="800" fill="#0369a1">TEAM RD · 1–4</text>' +
        '<rect x="146" y="56" width="160" height="18" rx="6" fill="#dcfce7" stroke="#bbf7d0"/>' +
        '<text x="226" y="69" text-anchor="middle" ' + F + ' font-size="9" font-weight="800" fill="#047857">TEAM ITALIA · 5–9</text>' +
        nodes);
    }
    if (key === 'wl_s3') { // Privacy: signed consent sheet with green check
      return frame(
        '<rect x="108" y="38" width="104" height="92" rx="8" fill="#ffffff" stroke="#e2e8f0"/>' +
        '<rect x="120" y="50" width="60" height="6" rx="3" fill="#cbd5e1"/>' +
        '<rect x="120" y="64" width="80" height="4" rx="2" fill="#e2e8f0"/>' +
        '<rect x="120" y="74" width="80" height="4" rx="2" fill="#e2e8f0"/>' +
        '<rect x="120" y="84" width="64" height="4" rx="2" fill="#e2e8f0"/>' +
        '<path d="M120 112 q10 -10 20 0 q10 10 20 0 q8 -8 16 -2" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round"/>' +
        '<circle cx="196" cy="46" r="13" fill="#10b981"/>' +
        '<path d="M190 46 l4 4 l8 -9" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>');
    }
    if (key === 'wl_s4') { // Documents: rows with status pills
      const row = (y, w, tint, stroke, dot, pillW) =>
        '<circle cx="30" cy="' + (y + 13) + '" r="6" fill="' + dot + '"/>' +
        '<rect x="44" y="' + (y + 7) + '" width="' + w + '" height="6" rx="3" fill="#cbd5e1"/>' +
        '<rect x="44" y="' + (y + 17) + '" width="' + (w - 30) + '" height="4" rx="2" fill="#e2e8f0"/>' +
        '<rect x="' + (306 - pillW) + '" y="' + (y + 6) + '" width="' + pillW + '" height="14" rx="7" fill="' + tint + '" stroke="' + stroke + '"/>';
      return frame(
        row(38, 150, '#ecfdf5', '#a7f3d0', '#10b981', 54) +
        row(72, 130, '#fffbeb', '#fde68a', '#f59e0b', 62) +
        row(106, 140, '#fff1f2', '#fecdd3', '#f43f5e', 50));
    }
    if (key === 'wl_s5') { // Matching: request header + candidate shortlist
      return frame(
        '<rect x="14" y="36" width="292" height="24" rx="7" fill="#eef2ff" stroke="#c7d2fe"/>' +
        '<text x="24" y="52" ' + F + ' font-size="10" font-weight="800" fill="#4338ca">Terapia Intensiva</text>' +
        '<rect x="256" y="41" width="42" height="14" rx="7" fill="#ffffff" stroke="#c7d2fe"/>' +
        '<text x="277" y="51" text-anchor="middle" ' + F + ' font-size="9" font-weight="800" fill="#4f46e5">1/2</text>' +
        '<rect x="14" y="66" width="292" height="28" rx="8" fill="#ecfdf5" stroke="#a7f3d0"/>' +
        '<rect x="26" y="76" width="90" height="8" rx="4" fill="#94a3b8"/>' +
        '<rect x="200" y="73" width="60" height="14" rx="7" fill="#d1fae5"/>' +
        '<text x="230" y="83" text-anchor="middle" ' + F + ' font-size="8" font-weight="800" fill="#047857">IDONEO</text>' +
        '<rect x="268" y="73" width="30" height="14" rx="7" fill="#4f46e5"/>' +
        '<text x="283" y="83" text-anchor="middle" ' + F + ' font-size="8" font-weight="800" fill="#ffffff">+</text>' +
        '<rect x="14" y="100" width="292" height="28" rx="8" fill="#ffffff" stroke="#eef2f7"/>' +
        '<rect x="26" y="110" width="76" height="8" rx="4" fill="#cbd5e1"/>' +
        '<rect x="196" y="107" width="64" height="14" rx="7" fill="#fef3c7"/>' +
        '<text x="228" y="117" text-anchor="middle" ' + F + ' font-size="8" font-weight="800" fill="#b45309">PARZIALE</text>');
    }
    if (key === 'wl_s7') { // Alerts: two toast notifications (new request + fully staffed)
      const toast = (y, fill, stroke, icon, wText) =>
        '<rect x="40" y="' + y + '" width="240" height="30" rx="9" fill="' + fill + '" stroke="' + stroke + '"/>' +
        '<circle cx="60" cy="' + (y + 15) + '" r="8" fill="' + icon + '"/>' +
        '<rect x="78" y="' + (y + 9) + '" width="' + wText + '" height="6" rx="3" fill="#94a3b8"/>' +
        '<rect x="78" y="' + (y + 19) + '" width="' + (wText - 40) + '" height="4" rx="2" fill="#cbd5e1"/>';
      return frame(
        toast(44, '#eef2ff', '#c7d2fe', '#6366f1', 150) +
        toast(94, '#ecfdf5', '#a7f3d0', '#10b981', 180));
    }
    if (key === 'wl_s8') { // Candidate sheet as PDF: document with PDF badge
      return frame(
        '<rect x="112" y="38" width="96" height="94" rx="8" fill="#ffffff" stroke="#e2e8f0"/>' +
        '<rect x="124" y="50" width="52" height="7" rx="3.5" fill="#0f172a"/>' +
        '<rect x="124" y="66" width="72" height="4" rx="2" fill="#e2e8f0"/>' +
        '<rect x="124" y="76" width="72" height="4" rx="2" fill="#e2e8f0"/>' +
        '<rect x="124" y="86" width="56" height="4" rx="2" fill="#e2e8f0"/>' +
        '<rect x="124" y="100" width="72" height="4" rx="2" fill="#e2e8f0"/>' +
        '<rect x="124" y="110" width="44" height="4" rx="2" fill="#e2e8f0"/>' +
        '<rect x="176" y="112" width="44" height="20" rx="6" fill="#f43f5e"/>' +
        '<text x="198" y="126" text-anchor="middle" ' + F + ' font-size="11" font-weight="800" fill="#ffffff">PDF</text>');
    }
    // wl_s6 — "and more": mini grid of features
    const cell = (x, y, color) =>
      '<rect x="' + x + '" y="' + y + '" width="88" height="40" rx="8" fill="#ffffff" stroke="#eef2f7"/>' +
      '<rect x="' + (x + 10) + '" y="' + (y + 11) + '" width="18" height="18" rx="5" fill="' + color + '"/>' +
      '<rect x="' + (x + 36) + '" y="' + (y + 13) + '" width="40" height="5" rx="2.5" fill="#cbd5e1"/>' +
      '<rect x="' + (x + 36) + '" y="' + (y + 22) + '" width="28" height="4" rx="2" fill="#e2e8f0"/>';
    return frame(
      cell(14, 38, '#6366f1') + cell(116, 38, '#10b981') + cell(218, 38, '#f59e0b') +
      cell(14, 86, '#0ea5e9') + cell(116, 86, '#f43f5e') + cell(218, 86, '#8b5cf6'));
  }

  // Accent tints for the section icon badges (Tailwind full strings, never concatenated).
  const WL_TINTS = {
    indigo: 'bg-indigo-500/15 text-indigo-300 ring-indigo-400/30',
    sky: 'bg-sky-500/15 text-sky-300 ring-sky-400/30',
    amber: 'bg-amber-500/15 text-amber-300 ring-amber-400/30',
    emerald: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
    rose: 'bg-rose-500/15 text-rose-300 ring-rose-400/30',
    violet: 'bg-violet-500/15 text-violet-300 ring-violet-400/30',
  };
  function landingSectionHtml(sl, i) {
    const flip = i % 2 === 1; // alternate the preview/text sides down the page
    const badge = '<span class="inline-flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ' + (WL_TINTS[sl.tint] || WL_TINTS.indigo) + '"><i data-lucide="' + sl.icon + '" class="h-5 w-5"></i></span>';
    const visual = '<div class="wl-reveal ' + (flip ? '' : 'd1') + ' w-full lg:w-1/2"><div class="wl-preview mx-auto max-w-md p-3">' + welcomePreview(sl.key) + '</div></div>';
    const text = '<div class="wl-reveal ' + (flip ? 'd1' : '') + ' w-full lg:w-1/2">' +
        '<div class="mb-4 flex items-center gap-3">' + badge +
          '<span class="text-[11px] font-bold uppercase tracking-widest text-slate-400">' + (i + 1) + ' / ' + LANDING_SECTIONS.length + '</span>' +
        '</div>' +
        '<h2 class="text-2xl font-extrabold leading-tight text-white sm:text-3xl">' + t(sl.key + '_title') + '</h2>' +
        '<p class="mt-3 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">' + t(sl.key + '_text') + '</p>' +
        '<button data-action="welcome-detail" data-key="' + sl.key + '" class="mt-5 inline-flex items-center gap-1.5 rounded-xl wl-chip px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"><i data-lucide="plus-circle" class="h-4 w-4"></i>' + t('wl_more') + '</button>' +
      '</div>';
    return '<section class="mx-auto flex max-w-5xl flex-col items-center gap-8 px-6 py-14 sm:py-20 ' + (flip ? 'lg:flex-row-reverse' : 'lg:flex-row') + '">' + visual + text + '</section>';
  }

  function openWelcome() {
    closeWelcome();
    tourAutoChecked = true; // the interactive tour starts from a CTA, never on its own under the cover
    const o = document.createElement('div');
    o.id = 'welcome-overlay';
    const langBtns = ['it', 'en', 'es'].map((l) => '<button data-action="welcome-lang" data-lang="' + l + '" class="rounded-full px-2.5 py-1 text-[11px] font-bold uppercase transition ' + (LANG === l ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white') + '">' + l + '</button>').join('');
    const ctaButtons =
      '<button data-action="welcome-start" class="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-6 py-3.5 text-sm font-bold text-white shadow-xl shadow-indigo-900/40 transition hover:bg-indigo-400 sm:w-auto"><i data-lucide="play" class="h-4 w-4"></i>' + t('wl_start') + '</button>' +
      '<button data-action="welcome-explore" class="inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-semibold text-slate-200 ring-1 ring-inset ring-white/20 transition hover:bg-white/10 hover:text-white sm:w-auto"><i data-lucide="compass" class="h-4 w-4"></i>' + t('wl_explore') + '</button>';
    o.innerHTML =
      '<div class="wl-progress" id="wl-progress"></div>' +
      // Decorative blurred blobs
      '<div class="wl-blob" style="width:380px;height:380px;background:#6366f1;top:-80px;left:-60px"></div>' +
      '<div class="wl-blob" style="width:420px;height:420px;background:#10b981;top:40%;right:-120px"></div>' +
      // Sticky top bar
      '<div class="sticky top-0 z-[3] flex items-center gap-3 border-b border-white/10 bg-slate-900/70 px-5 py-3 backdrop-blur sm:px-8">' +
        '<img src="' + logoUrl + '" alt="DHL Nurses" class="h-9 w-9 shrink-0 rounded-xl shadow-lg shadow-indigo-900/40" />' +
        '<div><p class="text-sm font-extrabold leading-tight">DHL Nurses</p><p class="text-[11px] text-slate-400">' + t('wl_kicker') + '</p></div>' +
        '<div class="ml-auto flex items-center gap-2">' +
          '<div class="flex items-center gap-1 rounded-full bg-white/10 p-1">' + langBtns + '</div>' +
          '<button data-action="welcome-explore" class="hidden rounded-xl px-3 py-1.5 text-xs font-semibold text-slate-300 ring-1 ring-inset ring-white/20 transition hover:bg-white/10 hover:text-white sm:inline-flex">' + t('wl_explore') + '</button>' +
        '</div>' +
      '</div>' +
      // Hero
      '<div class="relative z-[2] flex min-h-[86vh] flex-col items-center justify-center px-6 py-10 text-center">' +
        '<img src="' + logoUrl + '" alt="DHL Nurses — DominicaHealthLink" class="wl-reveal in mb-6 h-28 w-28 rounded-3xl shadow-2xl shadow-indigo-900/50 ring-1 ring-white/20 sm:h-36 sm:w-36" />' +
        '<span class="wl-reveal in mb-4 inline-flex items-center gap-1.5 rounded-full wl-chip px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-200"><i data-lucide="flask-conical" class="h-3.5 w-3.5"></i>' + t('wl_kicker') + '</span>' +
        '<h1 class="wl-reveal in max-w-3xl text-3xl font-extrabold leading-tight sm:text-5xl">' + t('wl_claim') + '</h1>' +
        '<div class="wl-reveal in mt-8 flex w-full max-w-md flex-col items-center gap-3 sm:flex-row sm:justify-center">' + ctaButtons + '</div>' +
        '<div class="wl-scrollhint mt-14 flex flex-col items-center gap-1 text-slate-400"><span class="text-[11px] font-semibold uppercase tracking-widest">' + t('wl_scroll') + '</span><i data-lucide="chevrons-down" class="h-5 w-5"></i></div>' +
      '</div>' +
      // Feature sections
      '<div class="relative z-[2]">' + LANDING_SECTIONS.map(landingSectionHtml).join('') + '</div>' +
      // Closing CTA
      '<div class="relative z-[2] mx-auto max-w-3xl px-6 pb-20 pt-6 text-center">' +
        '<div class="wl-reveal wl-card px-6 py-12 sm:px-12">' +
          '<h2 class="text-2xl font-extrabold text-white sm:text-3xl">' + t('wl_cta_title') + '</h2>' +
          '<p class="mx-auto mt-3 max-w-xl text-sm text-slate-300 sm:text-base">' + t('wl_cta_sub') + '</p>' +
          '<div class="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">' + ctaButtons + '</div>' +
        '</div>' +
        '<p class="mt-8 flex items-center justify-center gap-1.5 text-xs text-slate-500"><span>Realizzato con cura da</span><i data-lucide="heart" class="h-3.5 w-3.5 text-rose-400"></i><span class="font-semibold text-slate-400">iTavix &amp; Claude</span></p>' +
      '</div>';
    document.body.appendChild(o);
    document.documentElement.classList.add('overflow-hidden');
    lucide.createIcons();
    // Reveal-on-scroll: add .in when a section enters the viewport.
    welcomeObserver = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); welcomeObserver.unobserve(en.target); } });
    }, { root: o, threshold: 0.18 });
    o.querySelectorAll('.wl-reveal:not(.in)').forEach((el) => welcomeObserver.observe(el));
    // Scroll progress bar.
    const bar = o.querySelector('#wl-progress');
    o.addEventListener('scroll', () => {
      const max = o.scrollHeight - o.clientHeight;
      if (bar) bar.style.width = (max > 0 ? (o.scrollTop / max) * 100 : 0) + '%';
    });
  }
  // Feature detail popup — "amplifies" a section with a bigger preview + bullet points.
  function welcomeDetail(key) {
    closeWelcomeDetail();
    const sl = LANDING_SECTIONS.find((s) => s.key === key); if (!sl) return;
    const wrap = document.createElement('div');
    wrap.id = 'wl-detail';
    wrap.innerHTML =
      '<div class="wl-detail-card">' +
        '<div class="flex items-center gap-3 border-b border-white/10 p-5">' +
          '<span class="inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1 ' + (WL_TINTS[sl.tint] || WL_TINTS.indigo) + '"><i data-lucide="' + sl.icon + '" class="h-5 w-5"></i></span>' +
          '<h3 class="min-w-0 flex-1 text-base font-bold text-white">' + t(key + '_title') + '</h3>' +
          '<button data-action="welcome-detail-close" class="text-slate-400 transition hover:text-white"><i data-lucide="x" class="h-5 w-5"></i></button>' +
        '</div>' +
        '<div class="p-5">' +
          '<div class="wl-preview mb-4 p-3">' + welcomePreview(key) + '</div>' +
          '<div class="wl-detail-body space-y-2 text-sm leading-relaxed text-slate-300">' + t('ld_' + key.replace('wl_', '')) + '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    lucide.createIcons();
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) closeWelcomeDetail(); });
  }
  function closeWelcomeDetail() { const d = document.getElementById('wl-detail'); if (d) d.remove(); }
  function closeWelcome() {
    if (welcomeObserver) { try { welcomeObserver.disconnect(); } catch (e) { /* ignore */ } welcomeObserver = null; }
    closeWelcomeDetail();
    const o = document.getElementById('welcome-overlay'); if (o) o.remove();
    document.documentElement.classList.remove('overflow-hidden');
  }

  // ---------- Boot ----------
  loadLang();
  loadTheme();
  function applyInitialHashView() {
    const h = (location.hash || '').replace('#', '');
    if (APP_VIEWS.indexOf(h) >= 0) state.view = h;
  }
  if (initFirebase()) {
    // Firebase configured: onAuthStateChanged drives rendering (splash → login screen or app).
    // Seed a baseline state so the first render before auth resolves never crashes.
    state = loadState();
    applyInitialHashView();
    state.nurses.forEach((n) => { n.status = deriveStatus(n); });
    render(); // keeps the boot splash until onAuthStateChanged fires
    // Safety net: if auth never resolves (SDK hiccup, storage blocked), fall through to the
    // login screen instead of leaving the splash up forever.
    setTimeout(() => { if (fbEnabled && !authResolved) { authResolved = true; render(); } }, 6000);
  } else {
    // Local demo mode: no auth, localStorage only.
    state = loadState();
    applyInitialHashView();
    state.nurses.forEach((n) => { n.status = deriveStatus(n); });
    tourAutoChecked = true; // the welcome cover replaces the auto-started tour
    render();
    openWelcome();
  }
