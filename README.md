# Branding Architect - Café Operating System

A full-stack multi-tenant café ordering system with Firebase backend.

## Features

- **Customer Ordering** (`/cafe/{cafeId}`)
  - QR code menu access
  - Browse menu with categories
  - Real-time offers
  - Cart & checkout
  - WhatsApp order notification

- **Café Owner Dashboard** (`/dashboard`)
  - Real-time order management
  - Menu CRUD operations
  - Offers & combos
  - QR code generator
  - Analytics
  - Appearance customization (colors, light/dark mode)

- **Admin Panel** (`/admin`)
  - Manage all cafés
  - User management

## Tech Stack

- React 18 + Vite
- Firebase (Auth, Firestore, Storage)
- TailwindCSS
- Framer Motion

## Deploy to Netlify

### Step 1: Get Firebase Credentials

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project (or create one)
3. Go to Project Settings > General > Your apps
4. Copy the Firebase config values

### Step 2: Deploy to Netlify

**Option A: Drag & Drop**

1. Unzip the package
2. Create `.env` file with your Firebase credentials:
   ```
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```
3. Run:
   ```bash
   npm install
   npm run build
   ```
4. Drag the `dist` folder to [Netlify](https://app.netlify.com)

**Option B: Git Deploy (Recommended)**

1. Push to GitHub
2. Connect repo to Netlify
3. Set environment variables in Netlify Dashboard:
   - Go to Site Settings > Build & Deploy > Environment Variables
   - Add all `VITE_FIREBASE_*` variables
4. Deploy settings:
   - Build command: `npm run build`
   - Publish directory: `dist`

### Step 3: Configure Firebase

1. **Authentication**: Enable Email/Password in Firebase Console
2. **Firestore**: Create database and deploy rules:
   ```bash
   firebase deploy --only firestore:rules
   ```
3. **Storage**: Enable for image uploads (optional)

## Environment Variables

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |

## Routes

| Route | Description |
|-------|-------------|
| `/` | Redirect based on role |
| `/login` | Café owner login |
| `/dashboard` | Café owner dashboard |
| `/admin` | Admin panel |
| `/cafe/:cafeId` | Customer ordering page |

## Firestore Collections

- `users` - User accounts with roles
- `cafes` - Café settings (name, colors, logo)
- `menuItems` - Menu items per café
- `orders` - Customer orders
- `offers` - Special offers/combos
- `system` - Order counter

## Initial Setup

1. Create admin user in Firebase Auth
2. Add user document in Firestore:
   ```json
   {
     "email": "admin@example.com",
     "role": "admin",
     "name": "Admin"
   }
   ```
3. Create first café in Firestore `cafes` collection
4. Create café owner user with `role: "cafe"` and `cafeId: "<cafe-doc-id>"`

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## License

MIT
