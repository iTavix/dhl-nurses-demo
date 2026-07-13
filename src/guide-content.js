// =====================================================================================
//  DHL Nurses — "Guida Normativa" content (it / en / es)
//  Converted from the source report:
//  "Trasferimento di infermieri dalla Repubblica Dominicana all'Italia — visti,
//   permessi e riconoscimento professionale.md" (repo root — keep the two in sync).
//  Pure content module: no app logic, no t() — the overlay chrome lives in app.js.
//  All section ids are prefixed "g-" to avoid collisions with manual/app anchors.
// =====================================================================================

// Footnote helper: renders superscript links to the numbered source list (#g-ref-N).
const fn = (...ns) => ns.map((n) => '<sup><a href="#g-ref-' + n + '" class="font-semibold text-indigo-600 hover:underline">[' + n + ']</a></sup>').join('');

// The 9 sources are shared across languages (original titles kept).
const REFS = [
  ['https://www.cliclavoro.gov.it/focus-on/stranieri-in-italia/lavoratori-extra-ue/casi-particolari-di-ingresso', 'Casi particolari d’ingresso — Cliclavoro (Ministero del Lavoro)'],
  ['https://italianvisa.it/it/visto-permesso-infermieri/', 'Visto e permesso di soggiorno per infermieri — italianvisa.it'],
  ['https://integrazionemigranti.gov.it/it-it/Ricerca-news/Dettaglio-news/id/133/Infermieri-stranieri-si-al-permesso-per-attesa-occupazione', 'Infermieri stranieri: sì al permesso per attesa occupazione — integrazionemigranti.gov.it'],
  ['https://www.salute.gov.it/new/it/servizi-online/profs-rtenc-d21/infermiere-riconoscimento-titolo-professionale-sanitario-conseguito/', 'Riconoscimento titolo professionale sanitario extracomunitario (infermiere) — Ministero della Salute'],
  ['https://www.soa.it/country/repubblica-domenicana/', 'Legalizzazioni per la Repubblica Dominicana — SOA'],
  ['https://integrazionemigranti.gov.it/it-it/Altre-info/e/4/o/5/id/3/I-permessi-di-soggiorno-che-abilitano-al-lavoro', 'I permessi di soggiorno che abilitano al lavoro — integrazionemigranti.gov.it'],
  ['https://www.portaleimmigrazione.it/immigrazionenet/APR_PDS_Lavoro_CasiParticolari16.aspx', 'Permesso di soggiorno lavoro subordinato — casi particolari — Portale Immigrazione'],
  ['https://www.avvocatoleone.com/riconoscimento-titolo-estero-vittoria-per-un-infermiera-dominicana/', 'Riconoscimento titolo estero: vittoria per un’infermiera dominicana — avvocatoleone.com'],
  ['https://rivermate.com/it/guide/repubblica-dominicana/permessi-lavoro-visti', 'Permessi di lavoro e visti in Repubblica Dominicana — Rivermate'],
  ['https://presidencia.gob.do/sites/default/files/statics/transparencia/marco-legal/leyes/Ley-172-13.pdf', 'Ley 172-13 sobre Protección de Datos de Carácter Personal — Presidencia República Dominicana'],
  ['https://www.redipd.org/documentos/la-legislacion-dominicana-sobre-proteccion-de-datos-personales-principios-consentimiento', 'La legislación dominicana sobre Protección de Datos Personales: Principios, Consentimiento y Habeas Data — RIPD'],
  ['https://eur-lex.europa.eu/legal-content/IT/TXT/PDF/?uri=CELEX:32016R0679', 'Regolamento (UE) 2016/679 (GDPR) — testo integrale — EUR-Lex'],
  ['https://www.garanteprivacy.it/documents/10160/0/Codice+in+materia+di+protezione+dei+dati+personali+(Testo+coordinato).pdf', 'Codice in materia di protezione dei dati personali — D.Lgs. 196/2003 coordinato col D.Lgs. 101/2018 — Garante Privacy'],
  ['https://www.garanteprivacy.it/temi/trasferimento-di-dati-all-estero', 'Trasferimento di dati personali all’estero — Garante Privacy'],
  ['https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/adequacy-decisions_en', 'Data protection adequacy for non-EU countries — Commissione Europea'],
];

function refsHtml(title, note) {
  const items = REFS.map((r, i) =>
    '<li id="g-ref-' + (i + 1) + '"><a href="' + r[0] + '" target="_blank" rel="noopener" class="font-semibold text-indigo-600 hover:underline">' + r[1] + '</a></li>').join('');
  return `
      <section id="g-fonti" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="link" class="h-5 w-5 text-indigo-500"></i>${title}</h2>
        <p class="text-sm leading-relaxed text-slate-600">${note}</p>
        <ol class="ml-5 list-decimal space-y-2 text-sm leading-relaxed text-slate-600">${items}</ol>
      </section>`;
}

// ---------- Table of contents (per language) ----------
const GUIDE_TOC = {
  it: [
    ['g-summary', '1. Sintesi'],
    ['g-normativa', '2. Quadro normativo italiano'],
    ['g-categoria', '3. Infermieri extracomunitari'],
    ['g-visto', '4. Visto (fase consolare)'],
    ['g-permesso', '5. Permesso di soggiorno'],
    ['g-riconoscimento', '6. Riconoscimento del titolo'],
    ['g-lavoro', '7. Ingresso e lavoro in Italia'],
    ['g-documenti-rd', '8. Documenti dalla Rep. Dominicana'],
    ['g-diritto-rd', '9. Diritto dominicano'],
    ['g-privacy', '10. Protezione dei dati personali'],
    ['g-riferimenti', '11. Riferimenti operativi'],
    ['g-conclusioni', '12. Conclusioni'],
    ['g-fonti', '13. Fonti'],
  ],
  en: [
    ['g-summary', '1. Executive summary'],
    ['g-normativa', '2. Italian legal framework'],
    ['g-categoria', '3. Non-EU nurses category'],
    ['g-visto', '4. Visa (consular stage)'],
    ['g-permesso', '5. Residence permit'],
    ['g-riconoscimento', '6. Qualification recognition'],
    ['g-lavoro', '7. Entry and work in Italy'],
    ['g-documenti-rd', '8. Documents from the Dominican Rep.'],
    ['g-diritto-rd', '9. Dominican law aspects'],
    ['g-privacy', '10. Personal data protection'],
    ['g-riferimenti', '11. Practical references'],
    ['g-conclusioni', '12. Conclusions'],
    ['g-fonti', '13. Sources'],
  ],
  es: [
    ['g-summary', '1. Resumen ejecutivo'],
    ['g-normativa', '2. Marco normativo italiano'],
    ['g-categoria', '3. Enfermeros extracomunitarios'],
    ['g-visto', '4. Visado (fase consular)'],
    ['g-permesso', '5. Permiso de residencia'],
    ['g-riconoscimento', '6. Reconocimiento del título'],
    ['g-lavoro', '7. Entrada y trabajo en Italia'],
    ['g-documenti-rd', '8. Documentos de la Rep. Dominicana'],
    ['g-diritto-rd', '9. Derecho dominicano'],
    ['g-privacy', '10. Protección de datos personales'],
    ['g-riferimenti', '11. Referencias operativas'],
    ['g-conclusioni', '12. Conclusiones'],
    ['g-fonti', '13. Fuentes'],
  ],
};

// =====================================================================================
//  ITALIANO
// =====================================================================================
function guideBodyIT() {
  return `
      <div class="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-indigo-900 p-7 text-white shadow-sm">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-inset ring-white/20"><i data-lucide="scale" class="h-3.5 w-3.5"></i>Guida Normativa</span>
        <h2 class="mt-3 text-2xl font-extrabold">Trasferimento di infermieri dalla Repubblica Dominicana all'Italia</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-300">Visti, permessi e riconoscimento professionale: il quadro normativo e le procedure, con i riferimenti alle fonti ufficiali. Le note numerate rimandano alle fonti in fondo alla guida.</p>
      </div>

      <section id="g-summary" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="file-text" class="h-5 w-5 text-indigo-500"></i>1. Sintesi</h2>
        <p class="text-sm leading-relaxed text-slate-600">Questa guida sintetizza la documentazione e le principali procedure necessarie per trasferire infermieri dalla Repubblica Dominicana all'Italia per lavoro, con focus su: <b>riconoscimento del titolo professionale</b> presso il Ministero della Salute, <b>nulla osta e visto</b> per lavoro subordinato/infermieri, <b>permesso di soggiorno</b> per lavoro e requisiti specifici per la categoria "infermieri extracomunitari" prevista dal Testo Unico Immigrazione, oltre ad alcuni elementi di diritto dominicano rilevanti per la preparazione dei documenti (apostille, traduzioni, certificati).${fn(1, 2, 3, 4, 5)}</p>
      </section>

      <section id="g-normativa" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="landmark" class="h-5 w-5 text-indigo-500"></i>2. Quadro normativo italiano di riferimento</h2>
        <p class="text-sm leading-relaxed text-slate-600">La disciplina base è contenuta nel <b>Testo Unico Immigrazione</b> (D.Lgs. 286/1998) e nel relativo regolamento di attuazione (D.P.R. 394/1999), come modificati nel tempo.${fn(3, 1)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Per l'ingresso di lavoratori extra-UE si applicano normalmente le quote del "Decreto Flussi", ma <b>gli infermieri rientrano tra i "casi particolari" di ingresso al di fuori delle quote</b> ai sensi dell'articolo 27, comma 1, lettera r-bis T.U. e dell'articolo 40 del Regolamento di attuazione.${fn(1, 3)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Il permesso di soggiorno che abilita al lavoro è regolato anche dal D.Lgs. 40/2014, che ha introdotto la dizione "permesso unico lavoro" sui titoli che consentono attività lavorativa, e da norme specifiche per i permessi per lavoro subordinato dedicati agli infermieri.${fn(6, 7)}</p>
      </section>

      <section id="g-categoria" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="stethoscope" class="h-5 w-5 text-indigo-500"></i>3. Categoria speciale: infermieri extracomunitari</h2>
        <p class="text-sm leading-relaxed text-slate-600">Gli infermieri professionali assunti presso strutture sanitarie pubbliche e private sono espressamente indicati tra le categorie che possono accedere all'Italia per lavoro subordinato <b>al di fuori delle quote</b>, con procedure proprie per nulla osta, visto e permesso di soggiorno.${fn(3, 1)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Il Consiglio di Stato ha chiarito che ai titolari di permesso di soggiorno rilasciato per attività infermieristica ai sensi dell'art. 27, comma 1, lettera r-bis, si applicano anche le norme sul <b>permesso per attesa occupazione</b> (art. 22, comma 11 T.U.), confermando una tutela in caso di perdita del lavoro.${fn(3)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Il Portale Immigrazione e altre fonti pratiche confermano l'esistenza di un modello specifico di permesso di soggiorno per lavoro subordinato per infermieri assunti presso strutture sanitarie pubbliche e private.${fn(7)}</p>
      </section>

      <section id="g-visto" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="stamp" class="h-5 w-5 text-indigo-500"></i>4. Visto per infermieri (fase consolare)</h2>
        <p class="text-sm leading-relaxed text-slate-600">Il percorso standard prevede la richiesta di un <b>nulla osta al lavoro</b> da parte della struttura sanitaria italiana o, in certi casi, da agenzie di somministrazione o cooperative che gestiscono reparti/servizi sanitari.${fn(2, 1, 3)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Ottenuto il nulla osta presso lo <b>Sportello Unico per l'Immigrazione</b> della Prefettura competente, il lavoratore presenta domanda di visto presso l'ambasciata/consolato italiano competente per la Repubblica Dominicana.${fn(2)} Fonti specialistiche indicano che il visto per infermieri è pensato per cittadini extra-UE con laurea in Scienze Infermieristiche conseguita all'estero e che, in media, dall'ottenimento del nulla osta al rilascio del visto servono <b>circa tre mesi</b>.${fn(2)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Requisiti principali per richiedere il visto</h3>
        <ul class="prose-list ml-5 list-disc text-sm leading-relaxed text-slate-600">
          <li>Diploma di laurea in Scienze Infermieristiche o titolo equivalente in infermieristica.</li>
          <li><b>Riconoscimento del titolo</b> di infermiere professionale da parte del Ministero della Salute italiano (vedi sezione 6).</li>
          <li>Proposta di contratto di lavoro subordinato (anche a tempo determinato), generalmente <b>non inferiore alle 20 ore settimanali</b>, se la richiesta è fatta direttamente da una struttura sanitaria o cooperativa italiana.</li>
          <li>In caso di agenzie di somministrazione, contratto di appalto o somministrazione in corso tra l'agenzia e la struttura sanitaria.</li>
        </ul>
        <p class="text-sm leading-relaxed text-slate-600">Il visto viene richiesto personalmente dal lavoratore presso la rappresentanza diplomatica italiana, allegando nulla osta, documentazione sul rapporto di lavoro, documenti personali e prove del riconoscimento del titolo professionale.${fn(1, 2)}</p>
      </section>

      <section id="g-permesso" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="badge-check" class="h-5 w-5 text-indigo-500"></i>5. Permesso di soggiorno per infermieri e durata</h2>
        <p class="text-sm leading-relaxed text-slate-600">Dopo l'ingresso in Italia con visto per lavoro, l'infermiere deve presentarsi <b>entro 8 giorni</b> allo Sportello Unico e alla Questura per la richiesta del permesso di soggiorno per lavoro subordinato, specificamente impostato per l'attività infermieristica presso strutture sanitarie.${fn(6, 7, 2)}</p>
        <p class="text-sm leading-relaxed text-slate-600">La procedura comporta la compilazione dei moduli postali (kit permesso di soggiorno), il pagamento dei contributi, la consegna della documentazione originale (contratto di lavoro, nulla osta, passaporto, foto, ecc.) e la rilevazione delle impronte digitali in Questura.${fn(6, 2)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Il permesso per infermieri ha normalmente <b>durata massima di 2 anni</b>, è rinnovabile alle stesse condizioni del primo rilascio e <b>non è convertibile</b> in altra tipologia, pur potendo evolvere dopo cinque anni, con requisiti specifici, in permesso di soggiorno UE per soggiornanti di lungo periodo.${fn(3, 2)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Attesa occupazione e lungo periodo</h3>
        <p class="text-sm leading-relaxed text-slate-600">Per gli infermieri entrati ex art. 27, comma 1, lettera r-bis è ammesso il permesso per <b>attesa occupazione</b> in caso di cessazione del rapporto di lavoro (art. 22, comma 11 T.U.).${fn(3)} Con <b>cinque anni</b> di soggiorno regolare e residenza civile e fiscale in Italia è possibile richiedere il permesso di lungo periodo, dimostrando anche un livello minimo di italiano (<b>A2</b>).${fn(2, 3)}</p>
      </section>

      <section id="g-riconoscimento" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="graduation-cap" class="h-5 w-5 text-indigo-500"></i>6. Riconoscimento del titolo di infermiere dominicano</h2>
        <p class="text-sm leading-relaxed text-slate-600">Per esercitare la professione sanitaria in Italia, un infermiere con titolo extra-UE deve ottenere il <b>riconoscimento del titolo professionale</b> presso il Ministero della Salute (DGPROF — Direzione Generale delle professioni sanitarie).${fn(4)} La procedura è descritta nei servizi online del Ministero, dove sono disponibili i moduli specifici per infermieri (<b>modello D2-1 INF</b>) e le istruzioni sulla documentazione.${fn(4)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Dopo la presentazione della domanda completa, l'amministrazione deve concludere l'istruttoria <b>entro quattro mesi</b>, emettendo un decreto di riconoscimento, un riconoscimento subordinato a misure compensative (esame o tirocinio) oppure un diniego.${fn(8, 4)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Documentazione tipica per il riconoscimento</h3>
        <ul class="prose-list ml-5 list-disc text-sm leading-relaxed text-slate-600">
          <li>Copia autenticata del titolo di infermiere conseguito in Repubblica Dominicana, con <b>traduzione giurata</b> in italiano.</li>
          <li>Certificati di esami e programma di studi, tradotti e legalizzati (spesso via <b>apostille dell'Aia</b>).</li>
          <li>Documento di identità o passaporto.</li>
          <li>Eventuali attestazioni di esperienza professionale nel paese d'origine.</li>
          <li>Marca da bollo da <b>16 euro</b> sulla domanda e versamento dell'imposta di bollo tramite PagoPA secondo le indicazioni del Ministero.${fn(4)}</li>
        </ul>
        <p class="text-sm leading-relaxed text-slate-600">In alcuni casi il Ministero può richiedere integrazioni documentali o imporre <b>misure compensative</b> (prove o tirocini) per colmare differenze sostanziali tra la formazione estera e quella italiana.${fn(4)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Tutela in caso di ritardi</h3>
        <p class="text-sm leading-relaxed text-slate-600">Se il Ministero non risponde entro quattro mesi, il silenzio amministrativo può essere contestato e l'interessato può agire legalmente per ottenere una decisione, come dimostrano pronunce relative anche a infermieri extra-UE.${fn(8)} Una volta riconosciuto il titolo, l'infermiere può iscriversi all'albo <b>OPI</b> (Ordine delle Professioni Infermieristiche), superato il test di lingua italiana ove richiesto.${fn(2, 4)}</p>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-800"><b>Nel gestionale.</b> Queste tappe corrispondono agli stati 3–9 della pipeline (Documenti verificati → Iscrizione OPI): usa la checklist di ogni stato per tracciare traduzioni, apostille e invii al Ministero.</div>
      </section>

      <section id="g-lavoro" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="briefcase" class="h-5 w-5 text-indigo-500"></i>7. Ingresso e lavoro in Italia: permessi che abilitano al lavoro</h2>
        <p class="text-sm leading-relaxed text-slate-600">Per lavorare in Italia il cittadino straniero deve possedere un permesso di soggiorno che <b>abilita al lavoro</b>; il D.Lgs. 40/2014 ha configurato il "permesso unico lavoro" sui titoli che consentono attività lavorativa.${fn(6)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Permessi rilasciati per turismo, affari o giustizia <b>non abilitano al lavoro</b> e non sono convertibili in permessi per lavoro; i permessi che abilitano al lavoro possono invece essere convertiti alla scadenza, se sussistono i requisiti.${fn(6)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Per gli infermieri si applicano i permessi per lavoro subordinato legati all'attività infermieristica presso strutture sanitarie, con regole di rinnovo collegate al mantenimento della qualifica e del rapporto di lavoro per cui era stato rilasciato il nulla osta.${fn(7, 3)}</p>
      </section>

      <section id="g-documenti-rd" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="files" class="h-5 w-5 text-indigo-500"></i>8. Documentazione da predisporre nella Repubblica Dominicana</h2>
        <p class="text-sm leading-relaxed text-slate-600">Per la fase consolare e per il riconoscimento del titolo, i documenti dominicani devono generalmente essere <b>tradotti</b> in italiano o inglese da traduttori giurati e <b>legalizzati tramite apostille dell'Aia</b>; questo vale per certificati penali, titoli di studio, certificati medici e altri atti ufficiali.${fn(5)}</p>
        <p class="text-sm leading-relaxed text-slate-600">I certificati di <b>casellario giudiziario</b> devono essere legalizzati con apostille e tradotti; per i visti di lavoro è spesso richiesto anche un <b>certificato medico</b> di buona salute ed eventuali documenti che attestino l'assenza di impedimenti all'esercizio della professione.${fn(5)}</p>
        <p class="text-sm leading-relaxed text-slate-600">La lettera di richiesta visto, l'invito della società italiana e l'eventuale delibera del Ministero del Lavoro dominicano (certificato <b>SIRLA</b>) possono essere necessari per alcune tipologie di visto lavoro.${fn(9, 5)}</p>
      </section>

      <section id="g-diritto-rd" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="globe" class="h-5 w-5 text-indigo-500"></i>9. Elementi di diritto dominicano e mobilità internazionale</h2>
        <p class="text-sm leading-relaxed text-slate-600">Le fonti sul regime dei visti e permessi di lavoro in Repubblica Dominicana illustrano le categorie di visto (turistico, affari, lavoro) e i rispettivi requisiti; tali regole incidono soprattutto sulla fase di uscita dal paese e sulla regolarità dei documenti da presentare all'autorità italiana.${fn(9, 5)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Per i cittadini italiani non è richiesto il visto turistico per entrare in Repubblica Dominicana <b>fino a 60 giorni</b> — informazione utile se si prevedono fasi di formazione o selezione svolte in loco con personale italiano.${fn(5)}</p>
        <p class="text-sm leading-relaxed text-slate-600">La Repubblica Dominicana fa parte del gruppo di paesi <b>ACP</b> con accordi economici con l'UE: circostanza rilevante più per l'ambito commerciale che per l'immigrazione, ma che può generare richieste di documentazione doganale particolare (documento EUR.1) per movimentazioni di beni.${fn(5)}</p>
      </section>

      <section id="g-privacy" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="shield-check" class="h-5 w-5 text-indigo-500"></i>10. Protezione dei dati personali (Italia e Repubblica Dominicana)</h2>
        <p class="text-sm leading-relaxed text-slate-600">Il gestionale raccoglie in Repubblica Dominicana i dati anagrafici, i documenti d'identità e i titoli professionali dei candidati, per poi trattarli e trasmetterli in Italia a operatori HR e strutture sanitarie: si applicano quindi, <b>cumulativamente</b>, il regime dominicano di protezione dei dati (dove i dati nascono) e quello italiano/europeo (dove vengono trattati e ricevuti).${fn(10, 12)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Repubblica Dominicana: la Ley 172-13</h3>
        <p class="text-sm leading-relaxed text-slate-600">La <b>Ley 172-13</b> del 13 dicembre 2013 (fondata sull'art. 44 della Costituzione dominicana) tutela in modo integrale i dati personali contenuti in archivi, registri e banche dati pubbliche o private. Stabilisce i principi di <b>legalità, qualità, informazione, consenso, sicurezza e riservatezza</b> e riconosce i cosiddetti <b>diritti ARCO</b> — accesso, rettifica, cancellazione e opposizione — esercitabili in modo indipendente l'uno dall'altro, oltre all'azione giudiziale di <b>habeas data</b> per conoscere, accedere e correggere i propri dati.${fn(10, 11)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Un limite pratico rilevante: la legge <b>non istituisce un'autorità di controllo indipendente dedicata</b> (a differenza del Garante italiano). Solo per le banche dati creditizie la vigilanza spetta alla Superintendencia de Bancos; per gli altri ambiti, incluso il reclutamento sanitario, la tutela dell'interessato passa soprattutto dal consenso raccolto e, se necessario, dall'azione di habeas data davanti al giudice.${fn(11)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Italia: GDPR e Codice Privacy</h3>
        <p class="text-sm leading-relaxed text-slate-600">In Italia si applica direttamente il <b>Regolamento (UE) 2016/679</b> (GDPR), integrato dal <b>Codice in materia di protezione dei dati personali</b> (D.Lgs. 196/2003, come modificato dal D.Lgs. 101/2018) per gli aspetti lasciati alla disciplina nazionale (sanzioni, adempimenti specifici). L'autorità di controllo è il <b>Garante per la protezione dei dati personali</b>.${fn(12, 13)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Trasferimento dei dati dalla Rep. Dominicana all'Italia</h3>
        <p class="text-sm leading-relaxed text-slate-600">La Repubblica Dominicana <b>non rientra</b> tra i paesi terzi per cui la Commissione Europea ha adottato una decisione di adeguatezza ai sensi dell'art. 45 GDPR.${fn(15)} In assenza di adeguatezza, il trasferimento dei dati dei candidati verso l'Italia si fonda sulle garanzie/deroghe dell'<b>art. 49 GDPR</b>: in pratica, il <b>consenso esplicito e informato</b> dell'interessato e la necessità del trattamento per <b>misure precontrattuali</b> adottate su sua richiesta (l'avvio della pratica di trasferimento).${fn(14)}</p>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-800"><b>Nel gestionale.</b> È per questo che il modulo di <b>Consenso Privacy</b> (bilingue IT/ES, tra i Documenti personali) va raccolto fin dalla Fase 1 e ogni acquisizione o revoca resta tracciata nel log della pratica: non è solo buona prassi, è la base giuridica che rende legittimo il trasferimento dei dati dalla Repubblica Dominicana all'Italia.</div>
      </section>

      <section id="g-riferimenti" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="list-checks" class="h-5 w-5 text-indigo-500"></i>11. Riferimenti operativi e suggerimenti pratici</h2>
        <p class="text-sm leading-relaxed text-slate-600">Per la parte italiana, le fonti primarie di riferimento operativo sono:</p>
        <ul class="prose-list ml-5 list-disc text-sm leading-relaxed text-slate-600">
          <li>Sito del <b>Ministero della Salute</b>, sezione riconoscimento titoli professionali sanitari, con modulistica D2-1 INF e istruzioni dettagliate.${fn(4)}</li>
          <li><b>Portale Immigrazione</b> e Sportello Unico per l'Immigrazione, per nulla osta e permesso di soggiorno.${fn(7, 6, 3)}</li>
          <li>Portale <b>Cliclavoro</b> del Ministero del Lavoro, sezione "casi particolari di ingresso" per lavoratori extra-UE.${fn(1)}</li>
        </ul>
        <p class="text-sm leading-relaxed text-slate-600">È consigliabile predisporre per ogni infermiere una <b>check-list di documenti</b>: titoli e programmi di studio tradotti e legalizzati, certificati penali, certificati medici, passaporto valido, eventuali certificati di esperienza professionale, oltre ai documenti forniti dalla struttura italiana (contratto, lettera d'assunzione, nulla osta).${fn(5, 2, 4)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Gestire il riconoscimento del titolo presso il Ministero della Salute <b>prima o contestualmente</b> alle richieste di nulla osta riduce i rischi di ritardi: il visto per infermieri richiede che il titolo sia riconosciuto o in corso di riconoscimento.${fn(8, 2, 4)}</p>
      </section>

      <section id="g-conclusioni" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="flag" class="h-5 w-5 text-indigo-500"></i>12. Conclusioni</h2>
        <p class="text-sm leading-relaxed text-slate-600">Il trasferimento richiede il coordinamento di <b>tre piani</b>: riconoscimento del titolo presso il Ministero della Salute, procedura di nulla osta e visto per lavoro subordinato specifico per infermieri, e successivo rilascio e rinnovo del permesso di soggiorno, con attenzione alle norme speciali che tutelano questa categoria.${fn(1, 3, 2, 4)}</p>
        <p class="text-sm leading-relaxed text-slate-600">La corretta predisposizione della documentazione dominicana (traduzioni giurate, apostille, certificati penali e medici) e il rispetto dei termini amministrativi (quattro mesi per il riconoscimento, scadenze per la richiesta del permesso dopo l'ingresso) sono elementi centrali per un progetto di migrazione professionale fluido e conforme.${fn(8, 5, 4)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Il ricorso a consulenti esperti in diritto dell'immigrazione italiana e dominicana, oltre al dialogo diretto con le istituzioni competenti (Ministero della Salute, Sportello Unico Immigrazione, ambasciata italiana in RD), aiuta a gestire casistiche particolari, misure compensative e controversie su tempi o dinieghi.</p>
      </section>
${refsHtml('13. Fonti e riferimenti', 'Le note numerate nel testo rimandano a queste fonti (link esterni, si aprono in una nuova scheda).')}`;
}

// =====================================================================================
//  ENGLISH — Italian legal terms kept in italics with a gloss at first occurrence.
// =====================================================================================
function guideBodyEN() {
  return `
      <div class="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-indigo-900 p-7 text-white shadow-sm">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-inset ring-white/20"><i data-lucide="scale" class="h-3.5 w-3.5"></i>Regulatory Guide</span>
        <h2 class="mt-3 text-2xl font-extrabold">Transferring nurses from the Dominican Republic to Italy</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-300">Visas, permits and professional recognition: the legal framework and procedures, with links to official sources. Numbered notes point to the source list at the end of the guide.</p>
      </div>

      <section id="g-summary" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="file-text" class="h-5 w-5 text-indigo-500"></i>1. Executive summary</h2>
        <p class="text-sm leading-relaxed text-slate-600">This guide summarises the documents and main procedures needed to transfer nurses from the Dominican Republic to Italy for work, focusing on: <b>recognition of the professional qualification</b> by the Italian Ministry of Health, the <b><i>nulla osta</i> (work clearance) and visa</b> for salaried employment/nurses, the <b><i>permesso di soggiorno</i> (residence permit)</b> for work, and the specific requirements of the "non-EU nurses" category under the Consolidated Immigration Act, plus some aspects of Dominican law relevant to document preparation (apostilles, translations, certificates).${fn(1, 2, 3, 4, 5)}</p>
      </section>

      <section id="g-normativa" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="landmark" class="h-5 w-5 text-indigo-500"></i>2. Italian legal framework</h2>
        <p class="text-sm leading-relaxed text-slate-600">The core rules are in the <b><i>Testo Unico Immigrazione</i></b> (Consolidated Immigration Act, Legislative Decree 286/1998) and its implementing regulation (Presidential Decree 394/1999), as amended over time.${fn(3, 1)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Entry of non-EU workers is normally subject to the quotas of the <i>Decreto Flussi</i> (annual entry-quota decree), but <b>nurses are among the "special cases" admitted outside the quotas</b> under Article 27(1)(r-bis) of the Act and Article 40 of the implementing regulation.${fn(1, 3)}</p>
        <p class="text-sm leading-relaxed text-slate-600">The residence permit that entitles the holder to work is also governed by Legislative Decree 40/2014, which introduced the "single work permit" wording on permits allowing work, and by specific rules for salaried-employment permits dedicated to nurses.${fn(6, 7)}</p>
      </section>

      <section id="g-categoria" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="stethoscope" class="h-5 w-5 text-indigo-500"></i>3. Special category: non-EU nurses</h2>
        <p class="text-sm leading-relaxed text-slate-600">Professional nurses hired by public and private healthcare facilities are expressly listed among the categories that may enter Italy for salaried employment <b>outside the quotas</b>, with their own procedures for work clearance, visa and residence permit.${fn(3, 1)}</p>
        <p class="text-sm leading-relaxed text-slate-600">The Council of State has clarified that holders of a residence permit issued for nursing work under Article 27(1)(r-bis) also benefit from the rules on the <b>job-seeking permit</b> (<i>attesa occupazione</i>, Art. 22(11) of the Act), confirming protection if the job is lost.${fn(3)}</p>
        <p class="text-sm leading-relaxed text-slate-600">The Portale Immigrazione and other practical sources confirm the existence of a specific residence-permit template for salaried employment for nurses hired by public and private healthcare facilities.${fn(7)}</p>
      </section>

      <section id="g-visto" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="stamp" class="h-5 w-5 text-indigo-500"></i>4. Nurse visa (consular stage)</h2>
        <p class="text-sm leading-relaxed text-slate-600">The standard path starts with a <b>work clearance (<i>nulla osta</i>)</b> requested by the Italian healthcare facility or, in some cases, by staffing agencies or cooperatives that run healthcare wards/services.${fn(2, 1, 3)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Once the clearance is issued by the <b><i>Sportello Unico per l'Immigrazione</i></b> (One-Stop Immigration Desk) of the competent Prefecture, the worker applies for the visa at the Italian embassy/consulate competent for the Dominican Republic.${fn(2)} Specialist sources note the nurse visa targets non-EU citizens with a nursing degree obtained abroad, and that on average <b>about three months</b> pass between the clearance and the visa.${fn(2)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Main visa requirements</h3>
        <ul class="prose-list ml-5 list-disc text-sm leading-relaxed text-slate-600">
          <li>Degree in Nursing Science or an equivalent nursing qualification.</li>
          <li><b>Recognition of the qualification</b> as a professional nurse by the Italian Ministry of Health (see section 6).</li>
          <li>Offer of a salaried employment contract (fixed-term allowed), generally <b>at least 20 hours per week</b>, when the application comes directly from an Italian healthcare facility or cooperative.</li>
          <li>For staffing agencies, an active contracting or staffing agreement between the agency and the healthcare facility.</li>
        </ul>
        <p class="text-sm leading-relaxed text-slate-600">The visa is applied for in person at the Italian diplomatic mission, attaching the clearance, employment documentation, personal documents and proof of professional recognition.${fn(1, 2)}</p>
      </section>

      <section id="g-permesso" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="badge-check" class="h-5 w-5 text-indigo-500"></i>5. Residence permit for nurses and its duration</h2>
        <p class="text-sm leading-relaxed text-slate-600">After entering Italy on a work visa, the nurse must report <b>within 8 days</b> to the One-Stop Desk and the <i>Questura</i> (police headquarters) to apply for the salaried-work residence permit, specifically configured for nursing work at healthcare facilities.${fn(6, 7, 2)}</p>
        <p class="text-sm leading-relaxed text-slate-600">The procedure involves filling in the postal kit forms, paying the fees, submitting original documents (employment contract, clearance, passport, photos, etc.) and fingerprinting at the Questura.${fn(6, 2)}</p>
        <p class="text-sm leading-relaxed text-slate-600">The nurse permit normally has a <b>maximum duration of 2 years</b>, is renewable under the same conditions as the first issue and is <b>not convertible</b> into other permit types, though after five years, with specific requirements, it can evolve into the EU long-term residence permit.${fn(3, 2)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Job-seeking permit and long-term residence</h3>
        <p class="text-sm leading-relaxed text-slate-600">Nurses who entered under Article 27(1)(r-bis) may obtain a <b>job-seeking permit</b> if their employment ends (Art. 22(11)).${fn(3)} After <b>five years</b> of lawful residence with civil and tax residency in Italy, they may apply for the long-term residence permit, which also requires a minimum Italian level (<b>A2</b>).${fn(2, 3)}</p>
      </section>

      <section id="g-riconoscimento" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="graduation-cap" class="h-5 w-5 text-indigo-500"></i>6. Recognition of the Dominican nursing qualification</h2>
        <p class="text-sm leading-relaxed text-slate-600">To practise a healthcare profession in Italy, a nurse with a non-EU qualification must obtain <b>professional recognition</b> from the Ministry of Health (DGPROF — Directorate General for Health Professions).${fn(4)} The procedure is described in the Ministry's online services, including the nurse-specific forms (<b>model D2-1 INF</b>) and documentation instructions.${fn(4)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Once a complete application is filed, the administration must conclude the review <b>within four months</b>, issuing a recognition decree, a recognition conditional on compensatory measures (exam or traineeship), or a refusal.${fn(8, 4)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Typical documentation for recognition</h3>
        <ul class="prose-list ml-5 list-disc text-sm leading-relaxed text-slate-600">
          <li>Authenticated copy of the nursing qualification obtained in the Dominican Republic, with a <b>sworn translation</b> into Italian.</li>
          <li>Exam certificates and study programme, also translated and legalised (usually via <b>Hague apostille</b>).</li>
          <li>Identity document or passport.</li>
          <li>Any certificates of professional experience gained in the country of origin.</li>
          <li><b>€16 revenue stamp</b> on the application and stamp-duty payment via PagoPA per the Ministry's instructions.${fn(4)}</li>
        </ul>
        <p class="text-sm leading-relaxed text-slate-600">In some cases the Ministry may request additional documents or impose <b>compensatory measures</b> (tests or traineeships) to bridge substantial differences between foreign and Italian training.${fn(4)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Protection against delays</h3>
        <p class="text-sm leading-relaxed text-slate-600">If the Ministry does not reply within four months, the administrative silence can be challenged and the applicant can take legal action to obtain a decision, as case law involving non-EU nurses shows.${fn(8)} Once the qualification is recognised, the nurse can register with the <b>OPI</b> (the Italian nursing board), after passing the Italian language test where required.${fn(2, 4)}</p>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-800"><b>In the app.</b> These milestones map to pipeline states 3–9 (Documents verified → OPI registration): use each state's checklist to track translations, apostilles and Ministry filings.</div>
      </section>

      <section id="g-lavoro" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="briefcase" class="h-5 w-5 text-indigo-500"></i>7. Entry and work in Italy: permits that allow work</h2>
        <p class="text-sm leading-relaxed text-slate-600">To work in Italy, a foreign national must hold a residence permit that <b>entitles them to work</b>; Legislative Decree 40/2014 shaped the "single work permit" wording on such permits.${fn(6)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Permits issued for tourism, business or justice reasons <b>never allow work</b> and cannot be converted into work permits; permits that do allow work can instead be converted on expiry if the requirements are met.${fn(6)}</p>
        <p class="text-sm leading-relaxed text-slate-600">For nurses, the applicable permits are the salaried-employment ones tied to nursing work at healthcare facilities, with renewal rules linked to keeping the qualification and the employment relationship for which the clearance was issued.${fn(7, 3)}</p>
      </section>

      <section id="g-documenti-rd" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="files" class="h-5 w-5 text-indigo-500"></i>8. Documents to prepare in the Dominican Republic</h2>
        <p class="text-sm leading-relaxed text-slate-600">For the consular stage and for qualification recognition, Dominican documents generally must be <b>translated</b> into Italian or English by sworn translators and <b>legalised with a Hague apostille</b>; this applies to criminal records, qualifications, medical certificates and other official deeds.${fn(5)}</p>
        <p class="text-sm leading-relaxed text-slate-600"><b>Criminal record certificates</b> must be apostilled and translated; work visas often also require a <b>medical certificate</b> of good health and documents showing no impediments to practising the profession.${fn(5)}</p>
        <p class="text-sm leading-relaxed text-slate-600">The visa request letter, the Italian company's invitation and, where applicable, the Dominican Ministry of Labour resolution (<b>SIRLA</b> certificate) may be needed for certain work-visa types.${fn(9, 5)}</p>
      </section>

      <section id="g-diritto-rd" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="globe" class="h-5 w-5 text-indigo-500"></i>9. Dominican law and international mobility</h2>
        <p class="text-sm leading-relaxed text-slate-600">Sources on Dominican visa and work-permit rules describe the visa categories (tourism, business, work) and their requirements; these rules mainly affect the exit stage and the regularity of the documents to be presented to the Italian authorities.${fn(9, 5)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Italian citizens do not need a tourist visa to enter the Dominican Republic <b>for up to 60 days</b> — useful if training or selection stages are run locally with Italian staff.${fn(5)}</p>
        <p class="text-sm leading-relaxed text-slate-600">The Dominican Republic belongs to the <b>ACP</b> group of countries with economic agreements with the EU — more relevant to trade than to nurse immigration, but it can trigger special customs paperwork (EUR.1 document) for goods movements.${fn(5)}</p>
      </section>

      <section id="g-privacy" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="shield-check" class="h-5 w-5 text-indigo-500"></i>10. Personal data protection (Italy and the Dominican Republic)</h2>
        <p class="text-sm leading-relaxed text-slate-600">The app collects candidates' personal data, identity documents and professional qualifications in the Dominican Republic, then processes and transmits them to HR staff and healthcare facilities in Italy: <b>both</b> the Dominican data-protection regime (where the data originates) and the Italian/EU one (where it is processed and received) apply <b>cumulatively</b>.${fn(10, 12)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Dominican Republic: Law 172-13</h3>
        <p class="text-sm leading-relaxed text-slate-600"><b>Law 172-13</b> of 13 December 2013 (based on Article 44 of the Dominican Constitution) provides comprehensive protection for personal data held in files, registers and public or private databases. It sets out the principles of <b>legality, quality, information, consent, security and confidentiality</b> and recognises the so-called <b>ARCO rights</b> — access, rectification, cancellation and opposition — each exercisable independently of the others, plus the judicial <i>habeas data</i> action (constitutional remedy to know, access and correct one's own data) available under Dominican law.${fn(10, 11)}</p>
        <p class="text-sm leading-relaxed text-slate-600">A significant practical limitation: the law <b>does not establish a dedicated independent supervisory authority</b> (unlike Italy's Garante). Only credit-reporting databases are supervised, by the Superintendency of Banks; in other areas, including healthcare recruitment, protection relies mainly on the consent collected and, where needed, on the <i>habeas data</i> judicial action.${fn(11)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Italy: GDPR and the Privacy Code</h3>
        <p class="text-sm leading-relaxed text-slate-600">Italy directly applies <b>Regulation (EU) 2016/679</b> (GDPR), supplemented by the <b><i>Codice Privacy</i></b> (Privacy Code, Legislative Decree 196/2003 as amended by Legislative Decree 101/2018) for matters left to national law (penalties, specific requirements). The supervisory authority is the <b><i>Garante per la protezione dei dati personali</i></b> (the Italian Data Protection Authority).${fn(12, 13)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Transferring data from the Dominican Republic to Italy</h3>
        <p class="text-sm leading-relaxed text-slate-600">The Dominican Republic is <b>not</b> among the third countries for which the European Commission has adopted an adequacy decision under Article 45 GDPR.${fn(15)} Absent an adequacy decision, transferring candidates' data to Italy relies on the safeguards/derogations of <b>Article 49 GDPR</b>: in practice, the data subject's <b>explicit, informed consent</b> and the necessity of processing for <b>pre-contractual measures</b> taken at their request (starting the transfer case).${fn(14)}</p>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-800"><b>In the app.</b> This is why the <b>Privacy Consent</b> form (bilingual IT/ES, among the Personal Documents) must be collected starting from Phase 1, and every acquisition or revocation is logged on the case: it is not just good practice — it is the legal basis that makes transferring data from the Dominican Republic to Italy lawful.</div>
      </section>

      <section id="g-riferimenti" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="list-checks" class="h-5 w-5 text-indigo-500"></i>11. Practical references and tips</h2>
        <p class="text-sm leading-relaxed text-slate-600">On the Italian side, the primary operational references are:</p>
        <ul class="prose-list ml-5 list-disc text-sm leading-relaxed text-slate-600">
          <li>The <b>Ministry of Health</b> website, healthcare qualification recognition section, with the D2-1 INF forms and detailed instructions.${fn(4)}</li>
          <li>The <b>Portale Immigrazione</b> and the One-Stop Immigration Desk, for work clearance and residence permits.${fn(7, 6, 3)}</li>
          <li>The Ministry of Labour's <b>Cliclavoro</b> portal, "special entry cases" section for non-EU workers.${fn(1)}</li>
        </ul>
        <p class="text-sm leading-relaxed text-slate-600">It is advisable to prepare a <b>document checklist</b> for each nurse: translated and legalised qualifications and study programmes, criminal records, medical certificates, valid passport, any professional experience certificates, plus the documents provided by the Italian facility (contract, hiring letter, clearance).${fn(5, 2, 4)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Handling qualification recognition at the Ministry of Health <b>before or alongside</b> the clearance requests reduces delay risks: the nurse visa requires the qualification to be recognised or under recognition.${fn(8, 2, 4)}</p>
      </section>

      <section id="g-conclusioni" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="flag" class="h-5 w-5 text-indigo-500"></i>12. Conclusions</h2>
        <p class="text-sm leading-relaxed text-slate-600">The transfer requires coordinating <b>three tracks</b>: qualification recognition at the Ministry of Health, the clearance-plus-visa procedure for nurse salaried employment, and the subsequent issue and renewal of the residence permit, minding the special rules protecting this category.${fn(1, 3, 2, 4)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Correctly preparing the Dominican documentation (sworn translations, apostilles, criminal and medical certificates) and meeting the administrative deadlines (four months for recognition, permit application deadlines after entry) are central to a smooth, compliant professional migration project.${fn(8, 5, 4)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Working with advisors experienced in Italian and Dominican immigration law, and direct dialogue with the competent institutions (Ministry of Health, One-Stop Immigration Desk, Italian embassy in the DR), helps manage edge cases, compensatory measures and disputes over timing or refusals.</p>
      </section>
${refsHtml('13. Sources and references', 'The numbered notes in the text point to these sources (external links, they open in a new tab; most are in Italian).')}`;
}

// =====================================================================================
//  ESPAÑOL — términos jurídicos italianos en cursiva con glosa en la primera aparición.
// =====================================================================================
function guideBodyES() {
  return `
      <div class="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 to-indigo-900 p-7 text-white shadow-sm">
        <span class="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold ring-1 ring-inset ring-white/20"><i data-lucide="scale" class="h-3.5 w-3.5"></i>Guía Normativa</span>
        <h2 class="mt-3 text-2xl font-extrabold">Traslado de enfermeros de la República Dominicana a Italia</h2>
        <p class="mt-2 max-w-2xl text-sm text-slate-300">Visados, permisos y reconocimiento profesional: el marco normativo y los procedimientos, con enlaces a las fuentes oficiales. Las notas numeradas remiten a las fuentes al final de la guía.</p>
      </div>

      <section id="g-summary" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="file-text" class="h-5 w-5 text-indigo-500"></i>1. Resumen ejecutivo</h2>
        <p class="text-sm leading-relaxed text-slate-600">Esta guía sintetiza la documentación y los principales procedimientos necesarios para trasladar enfermeros de la República Dominicana a Italia por motivos de trabajo, con foco en: el <b>reconocimiento del título profesional</b> ante el Ministerio de Salud italiano, el <b><i>nulla osta</i> (autorización de trabajo) y el visado</b> para trabajo por cuenta ajena/enfermeros, el <b><i>permesso di soggiorno</i> (permiso de residencia)</b> por trabajo y los requisitos específicos de la categoría "enfermeros extracomunitarios" prevista por la Ley de Inmigración consolidada, además de algunos elementos de derecho dominicano relevantes para preparar los documentos (apostillas, traducciones, certificados).${fn(1, 2, 3, 4, 5)}</p>
      </section>

      <section id="g-normativa" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="landmark" class="h-5 w-5 text-indigo-500"></i>2. Marco normativo italiano de referencia</h2>
        <p class="text-sm leading-relaxed text-slate-600">La disciplina básica está en el <b><i>Testo Unico Immigrazione</i></b> (Ley de Inmigración consolidada, Decreto Legislativo 286/1998) y en su reglamento de aplicación (D.P.R. 394/1999), con sus modificaciones.${fn(3, 1)}</p>
        <p class="text-sm leading-relaxed text-slate-600">La entrada de trabajadores extra-UE se rige normalmente por los cupos del <i>Decreto Flussi</i> (decreto anual de cupos de entrada), pero <b>los enfermeros están entre los "casos especiales" de entrada fuera de los cupos</b> según el artículo 27, apartado 1, letra r-bis de la Ley y el artículo 40 del reglamento.${fn(1, 3)}</p>
        <p class="text-sm leading-relaxed text-slate-600">El permiso de residencia que habilita para trabajar también está regulado por el D.Lgs. 40/2014, que introdujo la mención "permiso único de trabajo" en los títulos que permiten la actividad laboral, y por normas específicas para los permisos de trabajo por cuenta ajena dedicados a los enfermeros.${fn(6, 7)}</p>
      </section>

      <section id="g-categoria" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="stethoscope" class="h-5 w-5 text-indigo-500"></i>3. Categoría especial: enfermeros extracomunitarios</h2>
        <p class="text-sm leading-relaxed text-slate-600">Los enfermeros profesionales contratados por estructuras sanitarias públicas y privadas figuran expresamente entre las categorías que pueden entrar en Italia por trabajo <b>fuera de los cupos</b>, con procedimientos propios para autorización, visado y permiso de residencia.${fn(3, 1)}</p>
        <p class="text-sm leading-relaxed text-slate-600">El Consejo de Estado italiano ha aclarado que a los titulares de un permiso expedido para actividad de enfermería según el art. 27.1.r-bis se les aplican también las normas del <b>permiso por búsqueda de empleo</b> (<i>attesa occupazione</i>, art. 22.11), confirmando una tutela en caso de pérdida del trabajo.${fn(3)}</p>
        <p class="text-sm leading-relaxed text-slate-600">El Portale Immigrazione y otras fuentes prácticas confirman la existencia de un modelo específico de permiso de residencia por trabajo para enfermeros contratados por estructuras sanitarias públicas y privadas.${fn(7)}</p>
      </section>

      <section id="g-visto" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="stamp" class="h-5 w-5 text-indigo-500"></i>4. Visado para enfermeros (fase consular)</h2>
        <p class="text-sm leading-relaxed text-slate-600">El recorrido estándar comienza con la solicitud de una <b>autorización de trabajo (<i>nulla osta</i>)</b> por parte de la estructura sanitaria italiana o, en ciertos casos, de agencias de empleo o cooperativas que gestionan servicios sanitarios.${fn(2, 1, 3)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Obtenida la autorización en la <b><i>Sportello Unico per l'Immigrazione</i></b> (Ventanilla Única de Inmigración) de la Prefectura competente, el trabajador solicita el visado en la embajada/consulado italiano competente para la República Dominicana.${fn(2)} Fuentes especializadas indican que el visado para enfermeros está pensado para ciudadanos extra-UE con grado en Enfermería obtenido en el extranjero y que, de media, entre la autorización y el visado pasan <b>unos tres meses</b>.${fn(2)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Requisitos principales del visado</h3>
        <ul class="prose-list ml-5 list-disc text-sm leading-relaxed text-slate-600">
          <li>Grado en Ciencias de la Enfermería o título equivalente.</li>
          <li><b>Reconocimiento del título</b> de enfermero profesional por el Ministerio de Salud italiano (ver sección 6).</li>
          <li>Propuesta de contrato de trabajo por cuenta ajena (incluso temporal), en general <b>no inferior a 20 horas semanales</b>, si la solicitud la hace directamente una estructura sanitaria o cooperativa italiana.</li>
          <li>En el caso de agencias de empleo, contrato de servicios o de cesión vigente entre la agencia y la estructura sanitaria.</li>
        </ul>
        <p class="text-sm leading-relaxed text-slate-600">El visado lo solicita personalmente el trabajador ante la representación diplomática italiana, adjuntando autorización, documentación laboral, documentos personales y pruebas del reconocimiento del título profesional.${fn(1, 2)}</p>
      </section>

      <section id="g-permesso" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="badge-check" class="h-5 w-5 text-indigo-500"></i>5. Permiso de residencia para enfermeros y duración</h2>
        <p class="text-sm leading-relaxed text-slate-600">Tras entrar en Italia con visado de trabajo, el enfermero debe presentarse <b>en un plazo de 8 días</b> en la Ventanilla Única y en la <i>Questura</i> (jefatura de policía) para solicitar el permiso de residencia por trabajo, configurado específicamente para la actividad de enfermería en estructuras sanitarias.${fn(6, 7, 2)}</p>
        <p class="text-sm leading-relaxed text-slate-600">El procedimiento incluye rellenar los formularios del kit postal, pagar las tasas, entregar la documentación original (contrato, autorización, pasaporte, fotos, etc.) y la toma de huellas en la Questura.${fn(6, 2)}</p>
        <p class="text-sm leading-relaxed text-slate-600">El permiso para enfermeros tiene normalmente una <b>duración máxima de 2 años</b>, es renovable en las mismas condiciones de la primera expedición y <b>no es convertible</b> en otro tipo de permiso, aunque tras cinco años, con requisitos específicos, puede evolucionar al permiso UE de larga duración.${fn(3, 2)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Búsqueda de empleo y larga duración</h3>
        <p class="text-sm leading-relaxed text-slate-600">Para los enfermeros entrados por el art. 27.1.r-bis se admite el permiso por <b>búsqueda de empleo</b> si cesa la relación laboral (art. 22.11).${fn(3)} Con <b>cinco años</b> de residencia legal y residencia civil y fiscal en Italia se puede solicitar el permiso de larga duración, acreditando además un nivel mínimo de italiano (<b>A2</b>).${fn(2, 3)}</p>
      </section>

      <section id="g-riconoscimento" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="graduation-cap" class="h-5 w-5 text-indigo-500"></i>6. Reconocimiento del título de enfermero dominicano</h2>
        <p class="text-sm leading-relaxed text-slate-600">Para ejercer la profesión sanitaria en Italia, un enfermero con título extra-UE debe obtener el <b>reconocimiento del título profesional</b> ante el Ministerio de Salud (DGPROF — Dirección General de las profesiones sanitarias).${fn(4)} El procedimiento está descrito en los servicios online del Ministerio, con los formularios específicos para enfermeros (<b>modelo D2-1 INF</b>) y las instrucciones sobre la documentación.${fn(4)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Presentada la solicitud completa, la administración debe concluir la instrucción <b>en cuatro meses</b>, emitiendo un decreto de reconocimiento, un reconocimiento subordinado a medidas compensatorias (examen o prácticas) o una denegación.${fn(8, 4)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Documentación típica para el reconocimiento</h3>
        <ul class="prose-list ml-5 list-disc text-sm leading-relaxed text-slate-600">
          <li>Copia autenticada del título de enfermero obtenido en la República Dominicana, con <b>traducción jurada</b> al italiano.</li>
          <li>Certificados de exámenes y programa de estudios, también traducidos y legalizados (a menudo vía <b>apostilla de La Haya</b>).</li>
          <li>Documento de identidad o pasaporte.</li>
          <li>Eventuales certificados de experiencia profesional en el país de origen.</li>
          <li>Timbre fiscal de <b>16 euros</b> en la solicitud y pago del impuesto de timbre vía PagoPA según las indicaciones del Ministerio.${fn(4)}</li>
        </ul>
        <p class="text-sm leading-relaxed text-slate-600">En algunos casos el Ministerio puede pedir documentación adicional o imponer <b>medidas compensatorias</b> (pruebas o prácticas) para colmar diferencias sustanciales entre la formación extranjera y la italiana.${fn(4)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Tutela en caso de retrasos</h3>
        <p class="text-sm leading-relaxed text-slate-600">Si el Ministerio no responde en cuatro meses, el silencio administrativo puede impugnarse y el interesado puede actuar legalmente para obtener una decisión, como muestran sentencias relativas también a enfermeros extra-UE.${fn(8)} Reconocido el título, el enfermero puede inscribirse en el colegio <b>OPI</b> (Orden de las Profesiones de Enfermería), superado el test de italiano cuando se exija.${fn(2, 4)}</p>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-800"><b>En la aplicación.</b> Estas etapas corresponden a los estados 3–9 del pipeline (Documentos verificados → Inscripción OPI): usa la checklist de cada estado para seguir traducciones, apostillas y envíos al Ministerio.</div>
      </section>

      <section id="g-lavoro" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="briefcase" class="h-5 w-5 text-indigo-500"></i>7. Entrada y trabajo en Italia: permisos que habilitan para trabajar</h2>
        <p class="text-sm leading-relaxed text-slate-600">Para trabajar en Italia, el ciudadano extranjero debe poseer un permiso de residencia que <b>habilite para trabajar</b>; el D.Lgs. 40/2014 configuró el "permiso único de trabajo" en dichos títulos.${fn(6)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Los permisos por turismo, negocios o justicia <b>no habilitan en ningún caso para trabajar</b> y no son convertibles en permisos de trabajo; los permisos que sí habilitan pueden convertirse al vencimiento si se cumplen los requisitos.${fn(6)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Para los enfermeros se aplican los permisos por trabajo por cuenta ajena ligados a la actividad de enfermería en estructuras sanitarias, con reglas de renovación vinculadas al mantenimiento de la cualificación y de la relación laboral por la que se expidió la autorización.${fn(7, 3)}</p>
      </section>

      <section id="g-documenti-rd" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="files" class="h-5 w-5 text-indigo-500"></i>8. Documentación a preparar en la República Dominicana</h2>
        <p class="text-sm leading-relaxed text-slate-600">Para la fase consular y para el reconocimiento del título, los documentos dominicanos deben en general <b>traducirse</b> al italiano o al inglés por traductores jurados y <b>legalizarse mediante apostilla de La Haya</b>; esto vale para certificados penales, títulos de estudio, certificados médicos y otros actos oficiales.${fn(5)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Los <b>certificados de antecedentes penales</b> deben apostillarse y traducirse; para los visados de trabajo a menudo se exige también un <b>certificado médico</b> de buena salud y documentos que acrediten la ausencia de impedimentos para ejercer la profesión.${fn(5)}</p>
        <p class="text-sm leading-relaxed text-slate-600">La carta de solicitud de visado, la invitación de la empresa italiana y, en su caso, la resolución del Ministerio de Trabajo dominicano (certificado <b>SIRLA</b>) pueden ser necesarias para algunos tipos de visado de trabajo.${fn(9, 5)}</p>
      </section>

      <section id="g-diritto-rd" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="globe" class="h-5 w-5 text-indigo-500"></i>9. Derecho dominicano y movilidad internacional</h2>
        <p class="text-sm leading-relaxed text-slate-600">Las fuentes sobre visados y permisos de trabajo en la República Dominicana describen las categorías de visado (turismo, negocios, trabajo) y sus requisitos; estas reglas inciden sobre todo en la fase de salida del país y en la regularidad de los documentos a presentar ante la autoridad italiana.${fn(9, 5)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Los ciudadanos italianos no necesitan visado turístico para entrar en la República Dominicana <b>hasta 60 días</b> — dato útil si se prevén fases de formación o selección realizadas allí con personal italiano.${fn(5)}</p>
        <p class="text-sm leading-relaxed text-slate-600">La República Dominicana pertenece al grupo de países <b>ACP</b> con acuerdos económicos con la UE: circunstancia relevante más para el comercio que para la inmigración, pero que puede generar documentación aduanera particular (documento EUR.1) para movimientos de mercancías.${fn(5)}</p>
      </section>

      <section id="g-privacy" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="shield-check" class="h-5 w-5 text-indigo-500"></i>10. Protección de datos personales (Italia y República Dominicana)</h2>
        <p class="text-sm leading-relaxed text-slate-600">La aplicación recoge en la República Dominicana los datos personales, documentos de identidad y títulos profesionales de los candidatos, y luego los trata y transmite en Italia a personal de RR.HH. y estructuras sanitarias: se aplican, pues, <b>de forma acumulativa</b>, el régimen dominicano de protección de datos (donde los datos se originan) y el italiano/europeo (donde se tratan y reciben).${fn(10, 12)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">República Dominicana: la Ley 172-13</h3>
        <p class="text-sm leading-relaxed text-slate-600">La <b>Ley 172-13</b> del 13 de diciembre de 2013 (fundamentada en el art. 44 de la Constitución dominicana) protege de forma integral los datos personales contenidos en archivos, registros y bancos de datos públicos o privados. Establece los principios de <b>legalidad, calidad, información, consentimiento, seguridad y confidencialidad</b> y reconoce los llamados <b>derechos ARCO</b> — acceso, rectificación, cancelación y oposición —, ejercitables de forma independiente entre sí, además de la acción judicial de <b>habeas data</b> para conocer, acceder y corregir los propios datos.${fn(10, 11)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Una limitación práctica relevante: la ley <b>no instituye una autoridad de control independiente dedicada</b> (a diferencia del Garante italiano). Solo para los bancos de datos crediticios la vigilancia corresponde a la Superintendencia de Bancos; en los demás ámbitos, incluido el reclutamiento sanitario, la tutela del interesado depende sobre todo del consentimiento recabado y, si es necesario, de la acción de habeas data ante el juez.${fn(11)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Italia: RGPD y Código de Privacidad</h3>
        <p class="text-sm leading-relaxed text-slate-600">En Italia se aplica directamente el <b>Reglamento (UE) 2016/679</b> (RGPD), integrado por el <b>Código en materia de protección de datos personales</b> (D.Lgs. 196/2003, modificado por el D.Lgs. 101/2018) para los aspectos dejados a la normativa nacional (sanciones, obligaciones específicas). La autoridad de control es el <b>Garante per la protezione dei dati personali</b> (Autoridad de Protección de Datos italiana).${fn(12, 13)}</p>
        <h3 class="pt-2 text-base font-bold text-slate-800">Transferencia de datos de la Rep. Dominicana a Italia</h3>
        <p class="text-sm leading-relaxed text-slate-600">La República Dominicana <b>no figura</b> entre los países terceros para los que la Comisión Europea haya adoptado una decisión de adecuación conforme al art. 45 RGPD.${fn(15)} A falta de adecuación, la transferencia de los datos de los candidatos hacia Italia se basa en las garantías/excepciones del <b>art. 49 RGPD</b>: en la práctica, el <b>consentimiento explícito e informado</b> del interesado y la necesidad del tratamiento para <b>medidas precontractuales</b> adoptadas a petición suya (el inicio del expediente de traslado).${fn(14)}</p>
        <div class="rounded-xl border-l-4 border-indigo-400 bg-indigo-50 p-4 text-sm text-indigo-800"><b>En la aplicación.</b> Por eso el formulario de <b>Consentimiento de Privacidad</b> (bilingüe IT/ES, entre los Documentos personales) debe recogerse desde la Fase 1, y cada obtención o revocación queda registrada en el log del expediente: no es solo buena práctica, es la base jurídica que legitima la transferencia de datos de la República Dominicana a Italia.</div>
      </section>

      <section id="g-riferimenti" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="list-checks" class="h-5 w-5 text-indigo-500"></i>11. Referencias operativas y consejos prácticos</h2>
        <p class="text-sm leading-relaxed text-slate-600">Para la parte italiana, las fuentes primarias de referencia operativa son:</p>
        <ul class="prose-list ml-5 list-disc text-sm leading-relaxed text-slate-600">
          <li>La web del <b>Ministerio de Salud</b>, sección de reconocimiento de títulos sanitarios, con el formulario D2-1 INF e instrucciones detalladas.${fn(4)}</li>
          <li>El <b>Portale Immigrazione</b> y la Ventanilla Única de Inmigración, para la autorización de trabajo y el permiso de residencia.${fn(7, 6, 3)}</li>
          <li>El portal <b>Cliclavoro</b> del Ministerio de Trabajo, sección "casos especiales de entrada" para trabajadores extra-UE.${fn(1)}</li>
        </ul>
        <p class="text-sm leading-relaxed text-slate-600">Es aconsejable preparar para cada enfermero una <b>checklist de documentos</b>: títulos y programas de estudio traducidos y legalizados, certificados penales, certificados médicos, pasaporte válido, eventuales certificados de experiencia profesional, además de los documentos aportados por la estructura italiana (contrato, carta de contratación, autorización).${fn(5, 2, 4)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Gestionar el reconocimiento del título ante el Ministerio de Salud <b>antes o en paralelo</b> a las solicitudes de autorización reduce el riesgo de retrasos: el visado para enfermeros exige que el título esté reconocido o en proceso de reconocimiento.${fn(8, 2, 4)}</p>
      </section>

      <section id="g-conclusioni" class="space-y-4">
        <h2 class="flex items-center gap-2 text-xl font-extrabold text-slate-900"><i data-lucide="flag" class="h-5 w-5 text-indigo-500"></i>12. Conclusiones</h2>
        <p class="text-sm leading-relaxed text-slate-600">El traslado exige coordinar <b>tres planos</b>: reconocimiento del título ante el Ministerio de Salud, procedimiento de autorización y visado de trabajo específico para enfermeros, y posterior expedición y renovación del permiso de residencia, atendiendo a las normas especiales que protegen a esta categoría.${fn(1, 3, 2, 4)}</p>
        <p class="text-sm leading-relaxed text-slate-600">La correcta preparación de la documentación dominicana (traducciones juradas, apostillas, certificados penales y médicos) y el respeto de los plazos administrativos (cuatro meses para el reconocimiento, plazos para solicitar el permiso tras la entrada) son elementos centrales de un proyecto de migración profesional fluido y conforme.${fn(8, 5, 4)}</p>
        <p class="text-sm leading-relaxed text-slate-600">Recurrir a asesores expertos en derecho de inmigración italiano y dominicano, y el diálogo directo con las instituciones competentes (Ministerio de Salud, Ventanilla Única de Inmigración, embajada italiana en RD), ayuda a gestionar casos particulares, medidas compensatorias y controversias sobre plazos o denegaciones.</p>
      </section>
${refsHtml('13. Fuentes y referencias', 'Las notas numeradas del texto remiten a estas fuentes (enlaces externos, se abren en una pestaña nueva; en su mayoría en italiano).')}`;
}

const GUIDE_BODY = { it: guideBodyIT, en: guideBodyEN, es: guideBodyES };

export function guideToc(lang) { return GUIDE_TOC[lang] || GUIDE_TOC.it; }
export function guideBody(lang) { return (GUIDE_BODY[lang] || GUIDE_BODY.it)(); }
