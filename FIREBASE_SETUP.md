# Firebase Setup Guide (Free Tier)

Follow these steps to enable multiplayer. Single-player works without Firebase.

## 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" (or "Add project")
3. Name it something like "israeli-whist"
4. Disable Google Analytics (not needed)
5. Click "Create project"

## 2. Enable Anonymous Authentication

1. In your Firebase project, go to **Build > Authentication**
2. Click "Get started"
3. Go to **Sign-in method** tab
4. Enable **Anonymous** sign-in
5. Click **Save**

## 3. Create a Realtime Database

1. Go to **Build > Realtime Database**
2. Click "Create Database"
3. Choose your closest region
4. Start in **test mode** (we'll add rules later)
5. Click "Enable"

## 4. Get Your Config

1. Go to **Project Settings** (gear icon in sidebar)
2. Scroll down to "Your apps"
3. Click the **Web** icon (`</>`) to add a web app
4. Name it "israeli-whist-web"
5. Don't check "Firebase Hosting" (we'll use Vercel)
6. Click "Register app"
7. Copy the config values shown

## 5. Configure the App

1. Copy `.env.example` to `.env` in the project root:
   ```
   cp .env.example .env
   ```

2. Fill in the values from step 4:
   ```
   VITE_FIREBASE_API_KEY=AIzaSy...
   VITE_FIREBASE_AUTH_DOMAIN=israeli-whist.firebaseapp.com
   VITE_FIREBASE_DATABASE_URL=https://israeli-whist-default-rtdb.firebaseio.com
   VITE_FIREBASE_PROJECT_ID=israeli-whist
   VITE_FIREBASE_STORAGE_BUCKET=israeli-whist.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
   VITE_FIREBASE_APP_ID=1:123456789:web:abc123
   ```

## 6. Set Database Rules

Go to **Realtime Database > Rules** and paste:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

Click "Publish".

## 7. Deploy to Vercel (Free)

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) and sign in with GitHub
3. Click "New Project" and import your repo
4. Add environment variables (all the VITE_FIREBASE_* values)
5. Click "Deploy"

Your game will be live at `your-project.vercel.app`!

## Free Tier Limits (Spark Plan)

- **Realtime Database**: 1 GB stored, 10 GB/month download
- **Authentication**: unlimited anonymous users
- **100 simultaneous connections** (more than enough for friends)

These limits are very generous for personal use.
