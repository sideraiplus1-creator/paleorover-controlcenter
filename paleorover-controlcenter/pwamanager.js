// Fixing cache resources list by using correct lowercase filenames
const cacheResources = [
    'index.html',
    'style.css',
    'script.js',
    'image.png'
];

// Fixing Service Worker registration path
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js') // Changed to relative path
            .then((registration) => {
                console.log('SW registered: ', registration);
            })
            .catch((error) => {
                console.log('SW registration failed: ', error);
            });
    });
}