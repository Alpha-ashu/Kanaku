# GitHub Actions & Secrets Setup Checklist

Follow these steps to enable CI/CD builds for the Android app.

## Step 1: Prepare Your Keystore

If you don't have a keystore yet:

```bash
# Generate a new keystore (do this securely, offline)
keytool -genkey -v -keystore finance-life-release.keystore \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias finance-life
```

**Keep this file safe!** Store it offline or in a secure vault.

## Step 2: Encode Keystore to Base64

### Windows PowerShell:
```powershell
$keystore = Get-Content -Path ".\android\finance-life-release.keystore" -Encoding Byte
[Convert]::ToBase64String($keystore) | Set-Clipboard
# Now paste from clipboard into GitHub Secret
```

### macOS:
```bash
base64 -i ./android/finance-life-release.keystore | pbcopy
# Now paste from clipboard into GitHub Secret
```

### Linux:
```bash
base64 -w 0 ./android/finance-life-release.keystore | xclip -selection clipboard
# Or:
base64 -w 0 ./android/finance-life-release.keystore > keystore.b64
# Then manually copy content
```

## Step 3: Add GitHub Secrets

1. Go to your GitHub repository
2. Click **Settings** (top right)
3. In left sidebar, click **Secrets and variables**  **Actions**
4. Click **New repository secret** button

### Secret 1: `ANDROID_KEYSTORE_BASE64`
- **Name:** `ANDROID_KEYSTORE_BASE64`
- **Value:** [Paste the Base64-encoded keystore from Step 2]
- Click **Add secret**

### Secret 2: `ANDROID_KEYSTORE_PASSWORD`
- **Name:** `ANDROID_KEYSTORE_PASSWORD`
- **Value:** [The password you used when creating the keystore]
- Click **Add secret**

### Secret 3: `ANDROID_KEY_PASSWORD`
- **Name:** `ANDROID_KEY_PASSWORD`
- **Value:** [The key password (usually same as keystore password)]
- Click **Add secret**

## Step 4: Verify Secrets Are Added

In Settings  Secrets and variables  Actions, you should see:
-  ANDROID_KEYSTORE_BASE64
-  ANDROID_KEYSTORE_PASSWORD
-  ANDROID_KEY_PASSWORD

All should show "Last updated [date]" (masked value, not visible).

## Step 5: Test the Workflow

### Option A: Automatic Trigger
1. Make a commit and push to `main` or `master` branch
2. Go to **Actions** tab in GitHub
3. Watch **Build Android AAB (Release)** workflow run
4. Check status (should show  if successful)

### Option B: Manual Trigger
1. Go to **Actions** tab in GitHub
2. Select **Build Android AAB (Release)** from left sidebar
3. Click **Run workflow** button
4. Choose variant: `release` (default) or `debug`
5. Click **Run workflow**
6. Watch the build execute

## Step 6: Download Build Artifacts

After build completes:
1. Go to **Actions** tab
2. Click on the workflow run
3. Scroll to **Artifacts** section
4. Download:
   - `app-release-aab` (for Play Store)
   - `app-debug` (if you ran debug build)

## Troubleshooting

### Workflow file not found
**Cause:** `.github/workflows/build-android-aab.yml` not committed to git  
**Solution:**
```bash
git add .github/
git commit -m "Add Android CI/CD workflow"
git push
```

### Secrets not recognized
**Cause:** Secret names don't match (case-sensitive)  
**Solution:** Verify exact names:
- `ANDROID_KEYSTORE_BASE64` (not `ANDROID_KEYSTORE`)
- `ANDROID_KEYSTORE_PASSWORD` (not `ANDROID_PASSWORD`)
- `ANDROID_KEY_PASSWORD` (not `KEY_PASSWORD`)

### Build fails with "Keystore file not found"
**Cause:** Base64 secret is malformed  
**Solution:** Re-encode and verify Base64 string is complete (no truncation)

### Build fails with "Invalid keystore password"
**Cause:** Secret value doesn't match keystore password  
**Solution:** Update secret with correct password

### Artifacts not showing
**Cause:** Build failed (check job logs)  
**Solution:** 
1. Click workflow run to see logs
2. Scroll to failed task for error details
3. Check troubleshooting in ANDROID_BUILD_GUIDE.md

## Manage Secrets

### View All Secrets
Settings  Secrets and variables  Actions

### Update a Secret
1. Click secret name
2. Click **Update secret**
3. Enter new value
4. Click **Update secret**

### Delete a Secret
1. Click secret name
2. Click **Delete**
3. Confirm

## Security Best Practices

 **DO:**
- Store keystore offline in a safe location
- Use strong, unique passwords
- Rotate secrets every 6-12 months
- Audit who has repository access
- Use GitHub's encrypted secrets (never in code/commits)
- Review workflow logs for security issues

 **DON'T:**
- Commit keystore or passwords to git
- Share Base64 keystore openly
- Use weak passwords
- Keep secrets in environment files locally committed
- Share GitHub token or PAT without expiry

## Additional Commands

### Manually Trigger via CLI (using GitHub CLI)
```bash
# List available workflows
gh workflow list

# Manually trigger a workflow
gh workflow run build-android-aab.yml \
  -f build_variant=release \
  -b main
```

### Check Workflow Status
```bash
gh run list --workflow build-android-aab.yml
```

### View Workflow Logs
```bash
gh run view <run-id> --log
```

## Next Steps

- [ ] Encode keystore to Base64 (Step 2)
- [ ] Add all 3 GitHub Secrets (Step 3)
- [ ] Verify Secrets in GitHub (Step 4)
- [ ] Test automatic trigger (push to main) - Step 5A
- [ ] Or test manual trigger (Actions UI) - Step 5B
- [ ] Download artifact from successful build (Step 6)
- [ ] Share this checklist with team members

---

**Questions?** Refer to:
- ANDROID_BUILD_GUIDE.md  Comprehensive guide
- ANDROID_BUILD_QUICK_REF.md  Quick commands
- .github/workflows/build-android-aab.yml  Workflow config
