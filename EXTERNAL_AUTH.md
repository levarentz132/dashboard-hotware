# External Authentication API Integration

This project uses an external authentication API for user login and registration. The authentication is handled by calling an external service instead of managing users in a local database.

## Configuration

### Environment Variables

Set the external authentication API URL in your `.env.local` file:

```env
EXTERNAL_AUTH_API_URL=http://localhost/license-ht/api.php
JWT_SECRET=your-super-secret-key-change-in-production
```

If not set, it defaults to `http://localhost/license-ht/api.php`.

### External API Requirements

The external authentication API should accept POST requests with JSON payloads and respond with JSON.

#### Login Request

```json
{
  "username": "demo",
  "password": "demo123"
}
```

#### Login Response (Success)

```json
{
  "success": true,
  "message": "Authentication successful",
  "user": {
    "id": 2,
    "username": "demo",
    "email": "demo@example.com",
    "full_name": "Demo User",
    "role": "admin",
    "license_status": "monthly",
    "license_status_display": "Monthly",
    "license_expires_at": "2026-02-20 00:00:00",
    "days_remaining": 25,
    "last_login": "2026-01-20 10:30:00",
    "is_active": true
  }
}
```

#### Login Response (Failure - Invalid Credentials)

```json
{
  "success": false,
  "message": "Invalid credentials",
  "error_code": "INVALID_CREDENTIALS"
}
```

#### Login Response (Failure - Expired License)

```json
{
  "success": false,
  "message": "License has expired",
  "error_code": "LICENSE_EXPIRED",
  "user": {
    "id": 2,
    "username": "demo",
    "email": "demo@example.com",
    "full_name": "Demo User",
    "license_status": "expired",
    "license_expires_at": "2026-01-01 00:00:00"
  }
}
```

#### Login Response (Failure - Account Inactive)

```json
{
  "success": false,
  "message": "Account is deactivated",
  "error_code": "ACCOUNT_INACTIVE"
}
```

### License Status Mapping

The application maps `license_status` to user roles (if `role` field is not provided):

- **yearly** or **lifetime** → `admin` role (full access)
- **monthly** → `operator` role (moderate access)
- **7_day** or **trial** → `viewer` role (read-only access)

If the API returns a `role` field (admin/operator/viewer), that takes precedence over the license status mapping.

### License Expiration

Users are denied access if:
- `license_status` is "expired"
- `days_remaining` is 0 or negative
- `is_active` is false

The application will display an appropriate error message based on the expiration reason.

## Authentication Flow

1. **User submits login form** → Frontend sends credentials to `/api/auth/login`

2. **Next.js API routes** → Forwards request to external authentication API at `http://localhost/license-ht/api.php`

3. **External API validates** → Returns success/failure with user data including license information

4. **License validation** → Checks if `days_remaining` > 0 to allow access

5. **Role mapping** → Maps `license_status` to appropriate user role

6. **JWT token generation** → If successful, Next.js generates a JWT token with user information

7. **Cookie set** → JWT stored in HTTP-only cookie for session management

8. **Middleware protection** → All protected routes verified using JWT from cookie

### Registration

Registration is not available through the dashboard. Users must be created through the external license management system.

## User Roles

The system supports three user roles, automatically mapped from license status:

- `admin` - Full system access (yearly/lifetime licenses)
- `operator` - Moderate system access (monthly licenses)
- `viewer` - Read-only access (trial/other licenses)

Roles are determined by the `license_status` field from the external API.

## Session Management

- Sessions are managed using JWT tokens stored in HTTP-only cookies
- Token expiration: 24 hours (configurable in `AUTH_CONFIG.JWT_EXPIRES_IN`)
- Automatic session checks every 5 minutes
- Users are redirected to login page when session expires

## Error Handling

The system handles various error scenarios:

- **Network errors** - "Gagal menghubungi server autentikasi"
- **Timeout errors** - "Request timeout - server tidak merespon" (10 second timeout)
- **Invalid credentials** - Message from external API
- **Server errors** - "Terjadi kesalahan pada server"

## Files Modified for External Auth

- `src/lib/auth/external-api.ts` - External API communication helper
- `src/app/api/auth/login/route.ts` - Login endpoint using external API
- `src/app/api/auth/register/route.ts` - Register endpoint using external API
- `src/lib/auth/auth-service.ts` - Added `signJWT` function
- `.env.example` - Added `EXTERNAL_AUTH_API_URL` configuration

## Testing

To test the external authentication:

1. Ensure your external API is running at the configured URL
2. Start the development server: `npm run dev`
3. Navigate to `http://localhost:3000/login`
4. Enter credentials that exist in your external authentication system
5. Check the browser console and server logs for detailed authentication flow

## Security Notes

- Passwords are never stored in this application
- All authentication is delegated to the external API
- JWT tokens are stored in HTTP-only cookies (not accessible via JavaScript)
- Tokens are only sent over HTTPS in production
- Session validation happens on every protected route access
