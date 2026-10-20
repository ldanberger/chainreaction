// Apply the saved theme before first paint (light is the default). Loaded in <head>; it lives in its
// own file because the Content-Security-Policy in index.html doesn't allow inline scripts.
try { if (localStorage.getItem('chainreaction.theme') === 'dark') document.documentElement.dataset.theme = 'dark'; } catch (e) { /* storage unavailable */ }
