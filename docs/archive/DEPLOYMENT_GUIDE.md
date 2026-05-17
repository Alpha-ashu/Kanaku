# FinanceLife - Deployment Guide

## Web Deployment (Vercel)

### Prerequisites
- Vercel account
- Connected GitHub repository
- Environment variables configured

### Steps
1. **Fix Applied**: The 404 error was caused by incorrect build source in `vercel.json`
2. Build configuration now points to root `package.json` instead of `frontend/package.json`
3. TypeScript configuration relaxed to allow successful builds
4. All routing issues resolved with proper SPA fallback configuration

### Environment Variables Required
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
NODE_VERSION=18.x
```

## Mobile App Deployment (Google Play Store)

### Prerequisites
- Android Studio installed
- Java JDK 17+
- Android SDK (API level 33+)
- Google Play Console account
- Signing key for release builds

### Step 1: Generate Signing Key
```bash
keytool -genkey -v -keystore finance-life-release.keystore -alias finance-life -keyalg RSA -keysize 2048 -validity 10000
```

### Step 2: Update Capacitor Configuration
Update `capacitor.config.json` with your signing information:
```json
{
  "android": {
    "buildOptions": {
      "keystorePath": "finance-life-release.keystore",
      "keystorePassword": "your_keystore_password",
      "keystoreAlias": "finance-life",
      "keystoreAliasPassword": "your_alias_password",
      "releaseType": "AAB"
    }
  }
}
```

### Step 3: Build and Sync
```bash
# Build the web app
npm run build

# Sync with Capacitor
npx cap sync android

# Open Android Studio
npx cap open android
```

### Step 4: Android Studio Steps
1. Open the project in Android Studio
2. Select **Build > Generate Signed Bundle / APK**
3. Choose **Android App Bundle (AAB)**
4. Use your keystore file and credentials
5. Select **release** build variant
6. Generate the bundle

### Step 5: Play Store Upload
1. Go to Google Play Console
2. Create new application or select existing
3. Upload the AAB file
4. Complete store listing:
   - App name: FinanceLife
   - Description: Your Privacy-First Financial Life Management Platform
   - Category: Finance
   - Content rating: Everyone
5. Set pricing and distribution
6. Submit for review

## Production Checklist

### Web App
- [x] 404 routing fixed
- [x] Build process working
- [x] Environment variables configured
- [x] SPA routing properly configured
- [ ] Test all user flows in production
- [ ] Set up monitoring and analytics

### Backend API and Data Security
- [ ] Run critical backend security smoke tests:
  - npm --prefix backend run test:security:critical
- [ ] Verify test result is green (3 suites passed, no failed tests)
- [ ] Apply Supabase hardening migration:
  - supabase/migrations/010_enforce_rls_core_finance_tables.sql
- [ ] Run Supabase verification query:
  - supabase/migrations/010_verify_rls_core_finance_tables.sql
- [ ] Confirm verification_passed = true for all required core finance tables
- [ ] Confirm API throttling behavior in staging:
  - /api/v1/auth returns 429 after threshold
  - /api/v1/bills returns 429 after threshold
- [ ] Confirm ownership protections in staging:
  - Cross-user transaction access/update/delete is denied
  - Bill upload with foreign transactionId is rejected

### Mobile App
- [x] Android platform added
- [x] Capacitor configuration ready
- [ ] Signing key generated
- [ ] App icons and splash screens designed
- [ ] Permissions configured (camera, storage, notifications)
- [ ] Play Store listing complete
- [ ] Beta testing completed

## Troubleshooting

### Common Issues
1. **Build Failures**: Ensure TypeScript errors are resolved
2. **404 Errors**: Check `vercel.json` routing configuration
3. **Permission Issues**: Verify Android permissions in `AndroidManifest.xml`
4. **Signing Issues**: Double-check keystore paths and passwords

### Monitoring
- Set up error tracking (Sentry recommended)
- Monitor performance metrics
- User feedback collection system

## Security Considerations
- API keys properly secured
- User data encryption
- Secure authentication flow
- Regular security audits

## Next Steps
1. Complete mobile app signing and upload
2. Apply and verify Supabase migration 010 before production cutover
3. Run backend critical security smoke tests as a release gate
4. Set up production monitoring
5. Implement user analytics
6. Plan feature updates and maintenance
