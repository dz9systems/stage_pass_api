// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAlEj1egHnEn_Kr15Vi3OTwefghhPod3jU",
  authDomain: "stage-pass-b1d9b.firebaseapp.com",
  projectId: "stage-pass-b1d9b",
  storageBucket: "stage-pass-b1d9b.firebasestorage.app",
  messagingSenderId: "55719597935",
  appId: "1:55719597935:web:acb9ad699bb5ad2547ba9a",
  measurementId: "G-M2BLZYWPJE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, analytics, db, auth };
