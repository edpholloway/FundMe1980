# FundMe1980 — Firebase setup

This version stores everything in Firebase instead of the Claude-artifact-only
storage, so it will actually work once it's live on a real URL. Follow these
steps in order — every step here can be done from a phone browser, no
computer or command line required.

## 1. Create the Firebase project

1. Go to https://console.firebase.google.com on your phone, sign in.
2. Tap **Add project**, name it (e.g. "fundme1980"), finish the wizard.
3. In the left menu: **Build > Firestore Database > Create database**.
   Start in production mode, pick any region.
4. **Build > Authentication > Get started > Sign-in method > Anonymous >
   Enable.** This is what gives each visitor an account without a login
   form — no email/password needed.

Note: this version does **not** use Firebase Storage, since Firebase now
requires the paid Blaze plan (billing account on file) to use it. Lawn
photos are instead resized and compressed in the browser, then stored
directly inside the job's Firestore document as a small image — no
billing account needed, no Storage setup step.

## 2. Get your config and paste it in

1. Click the gear icon > **Project settings**.
2. Under "Your apps," click the `</>` (web) icon, register an app (nickname
   anything, no need to check hosting box).
3. Firebase shows you a `firebaseConfig` object. Copy it.
4. Open `src/firebase.js` in this project and replace the placeholder
   `firebaseConfig` values with your real ones.

## 3. Lock down the security rules

The `firestore.rules` file in this project is already written to match the
app (anyone can browse jobs, only signed-in users can post/bid, a profile
can only be edited by its owner). In the Firebase console:
**Firestore Database > Rules** tab, paste in `firestore.rules`, publish.

## 4. Get the code onto GitHub (from your phone)

1. Create a free account at github.com if you don't have one.
2. Create a new repository (e.g. "fundme1980").
3. On the repo page, tap **Add file > Upload files**. This uses your
   phone's normal file picker (Files app / Photos), not drag-and-drop, so
   it works fine on mobile.
4. Upload every file in this project, keeping the folder structure
   (`src/App.jsx`, `src/main.jsx`, `src/firebase.js`, `src/logo.js`,
   `package.json`, `vite.config.js`, `index.html`, `firebase.json`,
   `firestore.rules`).
5. Commit.

## 5. Connect GitHub to Firebase Hosting (auto-builds on every push)

1. Back in Firebase console: **Build > Hosting > Get started**.
2. Choose **Set up GitHub Actions deploys** — walk through connecting your
   GitHub repo and branch.
3. Firebase generates a GitHub Actions workflow that runs `npm install` and
   `npm run build` automatically, then deploys the `dist` folder, every
   time you push. You don't need to run any build commands yourself.
4. Once the first deploy finishes, Firebase gives you a live URL like
   `fundme1980.web.app` — that's your real, working site.

## What's different from the Claude-artifact version

- **Jobs, settings, and profiles** live in Firestore instead of
  `window.storage`, and update in real time across every visitor's screen
  (no polling needed).
- **Photos** are resized and compressed right in the browser, then stored
  as a small embedded image inside the job's own Firestore document — no
  Cloud Storage, no billing account required. Keep this in mind if you
  ever want higher-resolution photos later: at that point Storage (and
  the Blaze plan) becomes worth revisiting.
- **Bidding** uses a Firestore transaction, so two people bidding at the
  same instant can't both "win" — whoever's transaction commits first
  wins, the other gets a friendly "someone just bid lower" message and can
  try again.
- **Auction closing** is still triggered by whichever browser tab happens
  to be open when the timer runs out. That's fine for testing, but for a
  real launch you'll eventually want a scheduled Cloud Function so
  auctions close on time even if nobody's looking at the app right then.
  Ask me when you're ready to add that.
