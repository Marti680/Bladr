/* Bladr som installeret app: gem filer, udskriv, åbn PDF'er fra Windows og hent opdateringer.
   Indlæses kun i den selvstændige udgave (docs/), før selve appen. */
(function () {
  'use strict';

  /* Gem en fil: "Gem som"-dialog hvor browseren har den, ellers en almindelig download. */
  const TYPES = {
    pdf: { description: 'PDF-dokument', accept: { 'application/pdf': ['.pdf'] } },
    csv: { description: 'CSV til Excel', accept: { 'text/csv': ['.csv'] } }
  };
  window.bladrDownloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const ext = (filename.split('.').pop() || '').toLowerCase();
      if (window.showSaveFilePicker) {
        try {
          const h = await window.showSaveFilePicker({ suggestedName: filename, types: TYPES[ext] ? [TYPES[ext]] : undefined });
          const w = await h.createWritable(); await w.write(blob); await w.close();
          return { status: 'saved' };
        } catch (e) {
          if (e && e.name === 'AbortError') throw { code: 'declined', message: 'Gemning annulleret' };
          /* andre fejl: fald tilbage til almindelig download */
        }
      }
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return { status: 'saved' };
    }
  };

  /* Udskriv en PDF via en skjult ramme med browserens egen PDF-visning. */
  window.bladrPrint = function (bytes) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
    f.onload = () => setTimeout(() => {
      try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { window.open(url, '_blank'); }
    }, 400);
    f.src = url; document.body.appendChild(f);
    setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 10 * 60 * 1000);
  };

  /* PDF'er åbnet fra Windows ("Åbn med" eller som standardprogram). */
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (params) => {
      if (!params.files || !params.files.length) return;
      const files = await Promise.all(params.files.map((h) => h.getFile()));
      const go = () => (window.bladrOpenFiles ? window.bladrOpenFiles(files) : setTimeout(go, 100));
      go();
    });
  }

  /* Offline og opdateringer: en ny version hentes i baggrunden og tages i brug ved genstart. */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const reg = await navigator.serviceWorker.register('sw.js');
        const show = (w) => {
          const bar = document.getElementById('updBar'); if (!bar) return;
          bar.hidden = false;
          document.getElementById('updGo').onclick = () => w.postMessage('skipWaiting');
        };
        if (reg.waiting && navigator.serviceWorker.controller) show(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          if (w) w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) show(w); });
        });
        let reloading = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
        setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      } catch (e) { /* uden service worker virker Bladr stadig, bare ikke offline */ }
    });
  }
})();
