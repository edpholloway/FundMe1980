import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Replace with the config object from Firebase console:
// Project settings (gear icon) > General > Your apps > SDK setup and configuration
const firebaseConfig = {
  apiKey: "AIzaSyBFCYLTIs58z1hWYLufuSca9kLFDvmEpSY",
  authDomain: "fundme1980-2c383.firebaseapp.com",
  projectId: "fundme1980-2c383",
  storageBucket: "fundme1980-2c383.firebasestorage.app",
  messagingSenderId: "780559702872",
  appId: "1:780559702872:web:c059bb966218e5ed69e32d",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
