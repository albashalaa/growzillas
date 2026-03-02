# Google OAuth - Quick Summary

## ✅ What's Done

**"Continue with Google" button added to login and register pages.**

---

## 🔧 What You Need to Do

### **Get Google OAuth Credentials** (5 minutes)

1. Go to: https://console.cloud.google.com/
2. Create project (or use existing)
3. Enable "Google+ API"
4. Create "OAuth client ID" (Web application)
5. Add authorized redirect URI:
   ```
   http://localhost:3002/auth/google/callback
   ```
6. Copy "Client ID" and "Client secret"

### **Update Backend .env**

Edit `apps/api/.env` and replace:

```env
GOOGLE_CLIENT_ID="your-google-client-id"     # ← Paste your Client ID
GOOGLE_CLIENT_SECRET="your-google-client-secret"  # ← Paste your Client secret
```

### **Restart Backend**

Backend should restart automatically. If not:

```bash
cd apps/api
npm run start:dev
```

---

## 🧪 Test It

1. Open: http://localhost:3000/login
2. Click: "Continue with Google"
3. Login with Google
4. Should redirect to `/org/:orgId/home`

---

## 📚 Full Documentation

See `GOOGLE_OAUTH_GUIDE.md` for complete details.

---

## ⚡ Quick Facts

- ✅ Email/password auth still works
- ✅ Google users get org auto-created
- ✅ First-time users become ADMIN
- ✅ Existing users can link Google account
- ✅ No breaking changes to existing code
- ✅ Same token storage (`localStorage`)
- ✅ Same org isolation (bulletproof)

---

## 🔄 OAuth Flow

```
Click "Continue with Google"
  → Google login page
  → Grant permissions
  → Redirect to /auth/callback
  → Token stored
  → Redirect to /org/:orgId/home
```

---

## 📁 Files Changed

### Backend:
- `prisma/schema.prisma` - Added OAuth fields
- `src/auth/*.ts` - OAuth strategy & routes
- Migration applied automatically

### Frontend:
- `app/login/page.tsx` - Added button
- `app/register/page.tsx` - Added button
- `app/auth/callback/page.tsx` - NEW

---

## ⚠️ Before Testing

**You MUST set up Google OAuth credentials!**

Without credentials, the button will not work.

Follow the "Get Google OAuth Credentials" steps above.

---

**Ready after credentials are configured!** 🚀
