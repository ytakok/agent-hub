// Template — copy to firebase.config.ts (git-ignored) and fill in from
// Firebase console → Project settings → General → Your apps → SDK setup and configuration.
//
//   cp web/src/environments/firebase.config.example.ts web/src/environments/firebase.config.ts
//
// Firebase web config is shipped to every browser that loads the app, so it is not a secret in the
// strict sense — but keep it out of the repo anyway and restrict the key in Google Cloud console
// (APIs & Services → Credentials → Browser key → Website restrictions).
export const firebaseConfig = {
  apiKey: 'YOUR_WEB_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  appId: 'YOUR_APP_ID',
};
