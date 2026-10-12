window.UNWIP_VERSION = "0.29.0";
if ('serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
