# Firebase Deployment Guide

This guide explains how to deploy the Branding Architect Café OS to Firebase.

---

## Prerequisites

1. **Node.js 18+** installed
2. **Firebase CLI** installed:
   ```bash
   npm install -g firebase-tools
   ```
3. **A Firebase Project** created at [console.firebase.google.com](https://console.firebase.google.com)

---

## Step 1: Firebase Project Setup

### 1.1 Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Add project"
3. Enter project name (e.g., "branding-architect")
4. Enable Google Analytics (optional)
5. Create project

### 1.2 Enable Services

In Firebase Console:

1. **Authentication**:
   - Go to Build > Authentication
   - Click "Get started"
   - Enable "Email/Password" provider

2. **Firestore Database**:
   - Go to Build > Firestore Database
   - Click "Create database"
   - Choose "Start in production mode"
   - Select a location (closest to your users)

3. **Storage** (optional, for image uploads):
   - Go to Build > Storage
   - Click "Get started"
   - Accept default rules for now

4. **Hosting**:
   - Go to Build > Hosting
   - Click "Get started"
   - Follow the setup wizard

### 1.3 Get Firebase Config

1. Go to Project Settings (gear icon)
2. Scroll to "Your apps"
3. Click the web icon (</>)
4. Register your app
5. Copy the `firebaseConfig` values

---

## Step 2: Local Setup

### 2.1 Install Dependencies

```bash
cd frontend
npm install
```

### 2.2 Create Environment File

Create `.env.local` in the frontend folder:

```env
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

### 2.3 Login to Firebase CLI

```bash
firebase login
```

This opens a browser for authentication.

### 2.4 Initialize Firebase

```bash
firebase init
```

Select these options:
- **Features**: Firestore, Hosting
- **Project**: Use existing project > select your project
- **Firestore rules**: Use `firestore.rules`
- **Firestore indexes**: Use `firestore.indexes.json`
- **Hosting public directory**: `dist`
- **Single-page app**: Yes
- **Automatic builds**: No

---

## Step 3: Deploy

### 3.1 Deploy Firestore Rules & Indexes

```bash
firebase deploy --only firestore
```

This deploys:
- Security rules (who can read/write data)
- Indexes (for efficient queries)

### 3.2 Build the App

```bash
npm run build
```

This creates optimized production files in `dist/`.

### 3.3 Deploy to Hosting

```bash
firebase deploy --only hosting
```

Or deploy everything at once:

```bash
firebase deploy
```

### 3.4 One-Command Deploy

```bash
npm run deploy
```

This runs build + deploy automatically.

---

## Step 4: Create Initial Data

### 4.1 Create Admin User

1. Go to Firebase Console > Authentication
2. Click "Add user"
3. Enter email and password

4. Go to Firestore > Start collection
5. Collection ID: `users`
6. Document ID: (copy the UID from Authentication)
7. Add fields:
   ```
   email: "admin@example.com"
   role: "admin"
   name: "Admin"
   ```

### 4.2 Create First Café

In Firestore, create document in `cafes` collection:

```
Collection: cafes
Document ID: (auto-generate or custom ID)
Fields:
  name: "My Café"
  primaryColor: "#D4AF37"
  mode: "light"
  whatsappNumber: "+919876543210"
```

### 4.3 Create Café Owner

1. Create user in Authentication
2. Add to `users` collection:
   ```
   email: "owner@mycafe.com"
   role: "cafe"
   cafeId: "<document-id-from-above>"
   name: "Café Owner"
   ```

---

## Step 5: Test Deployment

### 5.1 Access URLs

After deployment, you'll get URLs like:
- **App URL**: `https://your-project.web.app`
- **Hosting URL**: `https://your-project.firebaseapp.com`

### 5.2 Test Routes

| URL | Expected Result |
|-----|-----------------|
| `/login` | Login page |
| `/cafe/<cafeId>` | Customer ordering page |
| `/dashboard` | Café owner dashboard (requires login) |
| `/admin` | Admin panel (requires admin login) |

### 5.3 Test QR Ordering

1. Log in as café owner
2. Go to Dashboard > QR Code
3. Scan the QR code with your phone
4. Should open the café ordering page

---

## Troubleshooting

### "Permission denied" errors

- Check Firestore rules are deployed
- Verify user has correct role in `users` collection
- Check `cafeId` matches between user and café document

### Build fails

```bash
npm run build
```

Check for:
- Missing environment variables
- Import errors
- TypeScript errors (if using TS)

### Hosting shows 404

- Ensure `dist` folder exists after build
- Check `firebase.json` has correct `public` directory
- Verify rewrite rules are configured

### Environment variables not working

- Use `VITE_` prefix for Vite
- Restart dev server after changing `.env`
- Don't commit `.env.local` to git

---

## Custom Domain

To use a custom domain:

1. Go to Firebase Console > Hosting
2. Click "Add custom domain"
3. Follow DNS verification steps
4. Wait for SSL certificate (can take 24-48 hours)

---

## Monitoring

### Firebase Console

- **Analytics**: User engagement
- **Performance**: Page load times
- **Crashlytics**: Error tracking

### Firestore Usage

- Monitor reads/writes in Firebase Console
- Set up billing alerts
- Optimize queries if hitting limits

---

## Security Checklist

- [ ] Firestore rules deployed
- [ ] Authentication enabled
- [ ] Environment variables secure (not in git)
- [ ] Admin accounts have strong passwords
- [ ] Storage rules configured (if using)
- [ ] CORS configured for custom domains

---

## Support

For issues:
1. Check Firebase status: [status.firebase.google.com](https://status.firebase.google.com)
2. Review Firebase docs: [firebase.google.com/docs](https://firebase.google.com/docs)
3. Stack Overflow: Tag with `firebase`
