import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB7D5SbNcpElV4zo_zb0CcQZwykt9lvk3E",
  authDomain: "wespace-1286c.firebaseapp.com",
  projectId: "wespace-1286c",
  storageBucket: "wespace-1286c.firebasestorage.app",
  messagingSenderId: "117563356375",
  appId: "1:117563356375:web:94dbf2fa43a2f370d1ec92",
};

let db = null;
let firebaseAvailable = false;

try {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  firebaseAvailable = true;
} catch (err) {
  // If Firebase initialization fails (offline build, network issues), export null db
  // and let the app handle offline mode gracefully.
  // Keep the error quiet in production but log for debugging.
  // eslint-disable-next-line no-console
  console.warn("Firebase init failed:", err);
}

export { db, firebaseAvailable };