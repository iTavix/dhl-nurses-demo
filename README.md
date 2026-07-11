# DHL Nurses — Demo

Versione **dimostrativa** del gestionale DHL Nurses (trasferimento infermieri
Repubblica Dominicana → Italia), pensata per le presentazioni: **nessun login,
nessun backend** — si apre direttamente sulla dashboard con dati di esempio.

> ⚠️ Tutti i dati sono fittizi. Questa demo non va usata con dati reali:
> la versione di produzione (con Firebase Auth + Firestore) vive nel repo
> `DominicaHealthLink`.

## Cosa mostra la demo

- **Dashboard analitica** — KPI, riepilogo trasferimenti, pratiche a rischio, documenti in scadenza
- **6 candidati di esempio** che coprono l'intera pipeline: documenti mancanti (step 2),
  verifica documenti (3), integrazione ministeriale (5), visto ottenuto (8),
  iscrizione OPI (9) e onboarding completato (11) — incluso un caso "a rischio" oltre SLA
- **Anagrafica completa** — dati personali, consenso privacy con modulo stampabile
  bilingue IT/ES e acquisizione automatica del modulo firmato
- **Ciclo di vita documenti** — upload, approvazione/rifiuto, documenti facoltativi,
  scadenze
- **Workflow a 11 stati** con checklist obbligatorie e blocchi di avanzamento
- **Tour guidato interattivo** (parte al primo avvio), **manuale operatore** e
  **guida normativa** in-app
- **3 lingue** (IT/EN/ES), **tema chiaro/scuro**, **simulatore di ruolo**
  admin/operatore per mostrare i permessi
- **Ripristino demo**: il pulsante ↺ nell'header riporta i dati allo stato iniziale

I dati vivono solo nel `localStorage` del browser: ogni modifica fatta durante la
presentazione è locale e azzerabile col pulsante di ripristino.

## Comandi

```
npm install       # prima volta
npm run dev       # sviluppo (http://localhost:5173)
npm run build     # build di produzione in dist/
npm run preview   # serve dist/ in locale
```

Il deploy su GitHub Pages è automatico a ogni push su `main`
(workflow in `.github/workflows/deploy.yml`; richiede Settings → Pages →
Source = "GitHub Actions").
