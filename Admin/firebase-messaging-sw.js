// firebase-messaging-sw.js
  console.log('Service Worker: Script loaded successfully!'); // Test log

  importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/9.6.1/firebase-messaging-compat.js');

  // Initialize Firebase (match config with index.html)
  firebase.initializeApp({
    apiKey: "AIzaSyCmu0kXlzWE29eNlRDMoYG0qYyxnC5Vra4",
    authDomain: "salmart-330ab.firebaseapp.com",
    projectId: "salmart-330ab",
    messagingSenderId: "396604566472",
    appId: "1:396604566472:web:60eff66ef26ab223a12efd"
  });

  const messaging = firebase.messaging();

  // Optional: Background message handler
  messaging.onBackgroundMessage((payload) => {
    console.log('Background message received:', payload);
  });