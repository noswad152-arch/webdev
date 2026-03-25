# Authentication Redirect Pattern Guide

## Overview

This document explains the **unified authentication redirect pattern** used throughout Witness V2 to ensure users are returned to their original destination after login. This is especially critical for external referrers (e.g., from external prayer sites, notifications, lesson platforms).

## The Problem This Solves

**Before this pattern:**
- User clicks link from `https://www.external.com/pray` → `https://witnessv2.net/mysanctuary`
- If not logged in, they get redirected to `/login`
- After login, they end up at `/dark` (the main dashboard) instead of returning to their original destination
- They lose context about where they came from and have to navigate manually

**After this pattern:**
- Same scenario, but after login the user is returned to `https://www.external.com/pray` (with auth token)
- Seamless continuity of experience across domains

## How It Works

### 1. Shared Utility: `auth-redirect.js`

Located at: `/static/auth-redirect.js`

This utility provides standardized functions for all authentication redirects:

```javascript
// Check if user has a valid token
WitnessAuthRedirect.hasToken()

// Validate token against /api/auth/me
await WitnessAuthRedirect.validateToken()

// Redirect to login (with optional source URL)
WitnessAuthRedirect.redirectToLogin(sourceUrl)

// Build login URL with source parameter
WitnessAuthRedirect.buildLoginUrl(sourceUrl)

// Main function: redirect to login if not authenticated
await WitnessAuthRedirect.requireLogin(redirectUrl)

// Handle external redirect sources
WitnessAuthRedirect.handleExternalRedirect()

// Get/clear stored redirect source
WitnessAuthRedirect.getStoredRedirectSource()
```

### 2. Flow Diagram

```
User clicks external link
         ↓
Page loads without auth token
         ↓
Page calls: WitnessAuthRedirect.requireLogin(window.location.href)
         ↓
Utility redirects to: /login?source=<current-location>
         ↓
Login page reads source parameter
         ↓
User enters credentials and verifies OTP
         ↓
Login page calls: /api/witness/course/relaunch?source=<source>
         ↓
API returns launch_url with auth token appended
         ↓
User redirected back to original location WITH auth
         ↓
User continues their workflow seamlessly
```

## Implementation Guide

### For New Protected Pages

#### Step 1: Include the Utility

Add this to your `<head>` or before your main `<script>`:

```html
<script src="/static/auth-redirect.js"></script>
```

#### Step 2: Add Authentication Check

In your page's initialization function:

```javascript
async function initPage() {
  // Option A: Simple check (redirect if not auth'd)
  if (!WitnessAuthRedirect.hasToken()) {
    WitnessAuthRedirect.redirectToLogin(window.location.href);
    return;
  }

  // Option B: Comprehensive check (validate token too)
  const isAuth = await WitnessAuthRedirect.requireLogin(window.location.href);
  if (!isAuth) return;

  // Page is protected, load content
  await loadPageContent();
}

// Call on page load
document.addEventListener('DOMContentLoaded', initPage);
// or
initPage();
```

#### Step 3: Update All Login Redirects

Replace all instances of:

```javascript
// ❌ OLD - Don't use this
window.location.href = "/login";
```

With:

```javascript
// ✅ NEW - Use this pattern
WitnessAuthRedirect.redirectToLogin(window.location.href);
```

#### Step 4: Handle Logout

Replace:

```javascript
// ❌ OLD
window.location.href = "/login";
```

With:

```javascript
// ✅ NEW - For logout, no source needed
localStorage.removeItem("auth_token");
localStorage.removeItem("user_email");
WitnessAuthRedirect.redirectToLogin();
```

### Updated Pages (As of 2026-03-25)

✅ `static/prayer_user.html` - Prayer Sanctuary  
✅ `static/Join.html` - Login/Signup Page  
✅ `static/witness.html` - Witness Page  
✅ `static/prayer_review_admin.html` - Prayer Review Admin  
✅ `static/ministry_admin.html` - Ministry Admin  
✅ `routes/ui.py` - Root `/` endpoint  

## Source Parameter Flow

### What Goes in `source`?

The `source` parameter contains the full location string that identifies where the user should be returned:

```
Format: [host][pathname][search]

Examples:
- "external.com/pray" - External prayer site
- "www.external.com/lessons/lesson-1" - External lesson
- "localhost:8000/mysanctuary" - Internal sanctuary
- "witnessv2.net/mysanctuary?tab=prayers" - Any valid location
```

### How the Login Page Uses It

In `Join.html`:

```javascript
// Read source from URL parameter
const sourceParam = String(pageParams.get("source") || "").trim();

// After successful login, call relaunch API
const resp = await fetch("/api/witness/course/relaunch?source=" + 
  encodeURIComponent(sourceParam), {
  headers: { Authorization: "Bearer " + token }
});

// Get back the launch_url with auth token attached
const data = await resp.json();
if (data.launch_url) {
  window.location.href = data.launch_url;
}
```

### How the Backend Handles It

In `routes/ui.py`, the `/api/witness/course/relaunch` endpoint:

1. Validates that the source URL is on the allowed domain list
2. Looks up the user's witness course state
3. Creates a course launch token (JWT with destination encoded)
4. Returns the source URL with the token appended as `?lt=<token>`

```python
@router.get("/api/witness/course/relaunch")
def witness_course_relaunch(source: str, request: Request, db: Session):
    # Normalize and validate the source URL
    source_url = _normalize_course_source_url(source)
    if not _is_allowed_course_launch_url(source_url):
        return JSONResponse({"error": "source not allowed"}, 403)
    
    # Get user's course state
    state = get_user_course_state(db, user_id)
    
    # Create launch token with context
    token, exp_ts = _create_course_launch_token(
        user=user,
        course_id=course_id,
        story_id=state.story_id,
        external_url=source_url
    )
    
    # Append token to source URL
    launch_url = _append_query_param(source_url, "lt", token)
    
    return {"launch_url": launch_url}
```

## Configuration

### Allowed Domains

External domains that can be used as redirect targets are configured in `.env`:

```env
# Comma-separated list of domains allowed for course launch redirects
COURSE_LAUNCH_ALLOWED_DOMAINS=external.com,www.external.com,lessons.external.com

# Token expiration (minutes)
COURSE_LAUNCH_TOKEN_MINUTES=10
```

Default behavior: If `COURSE_LAUNCH_ALLOWED_DOMAINS` is empty, all domains are allowed (permissive mode). Set specific domains to restrict.

## Security Considerations

1. **Source Validation**: The backend validates that source URLs:
   - Have valid HTTP/HTTPS schemes
   - Have a valid hostname
   - Are in the allowed domains list (if configured)

2. **Token Security**: Course launch tokens:
   - Are JWT-signed with `COURSE_LAUNCH_TOKEN_SECRET`
   - Expire after configured duration (default 10 minutes)
   - Contain user ID, course context, and destination
   - Cannot be forged without the secret

3. **Storage**: Source parameters are stored in `sessionStorage` (client-side):
   - Cleared when tab/browser closes
   - Never sent to server except in login flow
   - Should not contain sensitive information

## Testing the Pattern

### Manual Test Flow

1. **External to Sanctuary:**
   ```
   - Navigate to: https://witnessv2.net/mysanctuary (not logged in)
   - Should redirect to: /login?source=witnessv2.net/mysanctuary
   - Login successfully
   - Should redirect back to: /mysanctuary (with auth token)
   ```

2. **External Site to Prayer:**
   ```
   - Navigate to: http://localhost:3000/?source=http://external.com/pray
   - Should redirect to: /login?source=http://external.com/pray
   - Login successfully
   - Should call relaunch API with that source
   - Should redirect to: http://external.com/pray?lt=<token>
   ```

3. **Notifications:**
   ```
   - Notification deep link: /mysanctuary?source=notificationManager
   - If not logged in, redirects to login
   - If logged in, returns to /mysanctuary
   ```

### Browser Console Testing

```javascript
// Check if utility is loaded
console.log(window.WitnessAuthRedirect)

// Test building login URL
WitnessAuthRedirect.buildLoginUrl("external.com/page")
// Returns: /login?source=external.com%2Fpage

// Check token
WitnessAuthRedirect.hasToken()

// Validate token
await WitnessAuthRedirect.validateToken()
```

## Troubleshooting

### User Not Being Returned to Original Page

**Issue**: User logs in but goes to `/dark` instead of their original location

**Solutions**:
1. Check browser console for `[WitnessAuthRedirect]` logs
2. Verify source parameter is being passed correctly (check URL in location bar)
3. Check if relaunch API is returning an error
4. Verify domain is in `COURSE_LAUNCH_ALLOWED_DOMAINS` list
5. Check token expiration hasn't been exceeded

### "External destination not allowed" Error

**Cause**: The source URL domain is not in the allowed list

**Fix**:
- Add domain to `COURSE_LAUNCH_ALLOWED_DOMAINS` in `.env`
- Or remove that setting to allow all domains (less secure)

### Source Parameter Lost

**Cause**: User navigated through multiple pages before login

**Solution**: The source is stored in `sessionStorage`, so if the user closes their browser/tab before login, it's lost. This is intentional for security.

## Future Enhancements

Possible improvements to this system:

1. **User Preference Storage**: Remember frequent external sources
2. **Deep Link Persistence**: Handle multi-step deep links
3. **Analytics Integration**: Track which external sources drive engagement
4. **Custom Landing Pages**: Show different content based on referrer source
5. **A/B Testing**: Test different post-login pathways

## Related Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design overview
- [README.md](./README.md) - Getting started guide
- `auth/session.py` - JWT token implementation
- `auth/email_otp.py` - OTP verification
