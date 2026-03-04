importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// 1. Initialize the Firebase app in the service worker by passing in
// your app's Firebase config object.
// https://firebase.google.com/docs/web/setup#config-object
firebase.initializeApp({
    apiKey: "AIzaSyCw5SWA0IphZg1DcvpwuybWgaPabs3ewfc",
    authDomain: "titan-makina-gorev.firebaseapp.com",
    projectId: "titan-makina-gorev",
    storageBucket: "titan-makina-gorev.firebasestorage.app",
    messagingSenderId: "862140750370",
    appId: "1:862140750370:web:56dc5ec496b91e95ab887b",
    measurementId: "G-V94D98HRK2"
});

// 2. Retrieve an instance of Firebase Messaging so that it can handle background
// messages.
const messaging = firebase.messaging();

// Handle incoming background messages
messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    // Customize notification here
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/icon-192x192.png' // Or whatever icon you have
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
