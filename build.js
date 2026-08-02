const fs = require('fs');

const envContent = `window.__FIREBASE_CONFIG__ = ${JSON.stringify({
  apiKey: process.env.FIREBASE_API_KEY || '',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.FIREBASE_APP_ID || ''
})};`;

fs.writeFileSync('env.js', envContent);
console.log('Build Script: env.js successfully generated for Vercel deployment.');
