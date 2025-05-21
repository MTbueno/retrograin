
// Import the functions you need from the SDKs you need
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, signInWithRedirect, getRedirectResult, onAuthStateChanged } from 'firebase/auth';
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// IMPORTANT: Replace these with your actual Firebase project credentials
const firebaseConfig = {
  apiKey: "AIzaSyChKxl2EoNwytbXT2zlN0qb_J9RGKviXDQ",
  authDomain: "arthubdocs.firebaseapp.com",
  projectId: "arthubdocs",
  storageBucket: "arthubdocs.appspot.com", // Corrected common typo: firebasestorage.app -> appspot.com
  messagingSenderId: "323333692428",
  appId: "1:323333692428:web:df9866b6107f3bbddfa229"
};

// Initialize Firebase
let app;
if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();

export { auth, googleProvider, signInWithPopup, signOut, signInWithRedirect, getRedirectResult, onAuthStateChanged };

