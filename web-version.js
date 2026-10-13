window.UNWIP_VERSION = "0.32.2";
if ('serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
