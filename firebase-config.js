// ===== Firebase 設定 =====
const firebaseConfig = {
    apiKey: "AIzaSyDIG42PlOxhFWv_ChYaCDM3utnoKLIafBQ",
    authDomain: "kakeiboki.firebaseapp.com",
    projectId: "kakeiboki",
    storageBucket: "kakeiboki.firebasestorage.app",
    messagingSenderId: "286723936063",
    appId: "1:286723936063:web:b976c5b69801bcb6570d8a",
    measurementId: "G-NRXDVPE0VZ"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
