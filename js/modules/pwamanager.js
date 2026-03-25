// Other content above ...

const registration = await navigator.serviceWorker.register('sw.js');

// Other content in between ...

const cacheResources = [
    'index.html',
    'css/styles.css',
    'js/main.js',
    'js/modules/robotstate.js',
    'js/modules/uicontroller.js',
    'js/modules/maprenderer.js',
    'js/modules/commandsender.js',
    'js/modules/eventhandlers.js',
    'js/modules/connectionmanager.js',
    'js/modules/protocolhandler.js',
    'js/modules/storagemanager.js',
    'js/modules/audiofeedback.js',
    'js/modules/chartmanager.js',
    'js/modules/missionrecorder.js',
    'js/modules/pwamanager.js'
];

// Other content and code ...