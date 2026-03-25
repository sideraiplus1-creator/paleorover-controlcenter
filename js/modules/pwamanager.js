// Other content above ...

const registration = await navigator.serviceWorker.register('sw.js');

// Other content in between ...

const cacheResources = [
  'js/modules/robotstate.js',
  'js/modules/anothermodule.js',
  'css/style.css'
];

// Other content and code ...