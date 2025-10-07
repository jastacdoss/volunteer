# RCC Volunteer Onboarding Portal

A volunteer onboarding portal for River Christian Church that integrates with Planning Center Online (PCO) to track volunteer progress through required steps.

## Features

- **PCO OAuth Authentication** - Volunteers sign in with their Planning Center account
- **Progress Tracking** - Visual dashboard showing completion status of onboarding steps
- **5-Step Onboarding Process**:
  1. Declaration Form (PCO Form)
  2. Background Check
  3. Child Safety Training
  4. Covenant and Reference Forms
  5. Welcome to RCC Class

## Tech Stack

- **Frontend**: Vue 3 + TypeScript + Vite
- **Styling**: Tailwind CSS v3
- **Backend API**: Express.js (for secure OAuth token exchange)
- **Authentication**: Planning Center OAuth 2.0

## Setup Instructions

### Prerequisites

- Node.js 20.19+ or 22.12+
- PCO Developer Account with OAuth application configured
- Access to your Planning Center organization

### 1. Clone and Install

```bash
cd /Users/jason/dev/rcc/volunteer
npm install
```

### 2. Configure PCO OAuth Application

1. Go to https://api.planningcenteronline.com/oauth/applications
2. Create or edit your OAuth application
3. Set the callback URL to:
   - **Development**: `http://localhost:1700/auth/callback`
   - **Production**: `https://volunteers.riverchristian.church/auth/callback` ⚠️ **TODO: ADD THIS LINK!**
4. Copy your Client ID and Client Secret

### 3. Environment Variables

Create a `.env.local` file in the project root:

```env
# Personal Access Token (Admin) - for reading volunteer field data and API access
# Create at: https://api.planningcenteronline.com/oauth/applications
PCO_SECRET=pco_pat_your_token_here

# OAuth Credentials for volunteer login
VITE_PCO_OAUTH_CLIENT_ID=your_oauth_client_id_here
VITE_PCO_OAUTH_SECRET=your_oauth_client_secret_here
```

**Note:** `PCO_SECRET` uses a Personal Access Token because volunteers cannot read their own custom field data via OAuth. The server uses this admin PAT to fetch field data on behalf of volunteers.

**Important**: These credentials are protected by `.gitignore` and should never be committed to version control.

### 5. Run Development Server

```bash
npm run dev
```

This runs two servers concurrently:
- **Frontend**: http://localhost:1700 (Vite)
- **API**: http://localhost:1701 (Express)

## Volunteer Onboarding Process

### For Administrators

1. **Add volunteer to a team in PCO Services**
2. **Volunteer receives Welcome email from PCO** to set up their account
3. **Volunteer sets a password** (required for OAuth login)
4. **Volunteer can now log in** to the portal at [volunteers.riverchristian.church](https://volunteers.riverchristian.church) ⚠️ **TODO: ADD THIS LINK!**

### For Volunteers

1. Click "Sign in with Planning Center" on the portal
2. Log in with PCO credentials (email + password)
3. Complete each onboarding step in order
4. Progress is tracked automatically (coming soon - custom field integration)

## Important Notes

### OAuth and Passwordless Accounts

PCO's OAuth login requires a password, even if the volunteer account is set up for passwordless login in Church Center. Volunteers must set a password in Planning Center to use OAuth applications.

**Solution**: When sending the welcome email, ensure volunteers set a password for their PCO account.

## Project Structure

```
volunteer/
├── src/
│   ├── views/
│   │   ├── HomeView.vue      # Main dashboard
│   │   └── CallbackView.vue  # OAuth callback handler
│   ├── lib/
│   │   └── auth.ts            # OAuth helper functions
│   ├── router/                # Vue Router config
│   └── App.vue                # Root component
├── server.js                  # Express API for token exchange
├── .env.local                 # Environment variables (gitignored)
└── package.json
```

## Deployment

### Vercel Deployment

1. Connect repository to Vercel
2. Set environment variables in Vercel dashboard:
   - `VITE_PCO_OAUTH_CLIENT_ID`
   - `VITE_PCO_OAUTH_SECRET`
3. Update PCO OAuth callback URL to production URL
4. Deploy!

⚠️ **TODO: ADD PRODUCTION URL TO PCO OAUTH APPLICATION**

## Custom Field Integration

The portal automatically checks PCO People custom fields to show completion status. Currently implemented:

### Step 1: Declaration Form
- **Field Name**: `Leadership/Declaration`
- **Type**: Checkbox or Select
- **Value**: Must be set to `Yes` to mark as complete
- **Updated by**: n8n automation when form is submitted

### Additional Steps (TODO)
Add custom fields in PCO People for remaining steps:

- Step 2: Background Check
- Step 3: Child Safety Training
- Step 4: Covenant Forms
- Step 5: Welcome Class

**Note**: Field values should be set by n8n automation or manually by admins. The portal reads these values to display completion status.

### How Field Mapping Works

The portal fetches field data and definitions from PCO API, then maps field names to steps. To add more field mappings, update `src/views/HomeView.vue` around line 105.

## Support

Questions or issues? Contact:
- Cathy Reigner & Heather Lynn
- RCC Office Admin
- admin@riverchristian.church

---

Built with Vue 3, TypeScript, and Planning Center API
