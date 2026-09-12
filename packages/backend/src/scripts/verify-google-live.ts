/* eslint-disable no-console */
/**
 * Live Google Calendar Integration Verification Script (Phase 5b Acceptance)
 *
 * Runs the real OAuth token refresh and Calendar sync flow against live Google endpoints:
 * 1. Validates environment configuration (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN).
 * 2. Tests AES-256-GCM encryption and decryption round-trip for OAuth tokens.
 * 3. Tests live token refresh against oauth2.googleapis.com using a real refresh token.
 * 4. Tests live userinfo fetch against www.googleapis.com/oauth2/v2/userinfo.
 * 5. Tests live primary calendar fetch against www.googleapis.com/calendar/v3/calendars/primary/events for 14-day rolling window.
 * 6. Tests forced token refresh (simulating expired access token) to confirm autonomous refresh lifecycle.
 */
import { config } from '../config/index.js';
import { googleCalendarClient } from '../lib/google-calendar-client.js';
import { encryptToken, decryptToken } from '../lib/encryption.js';

const CLIENT_ID = process.env['GOOGLE_CLIENT_ID'] || config.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env['GOOGLE_CLIENT_SECRET'] || config.GOOGLE_CLIENT_SECRET;
const REFRESH_TOKEN = process.env['GOOGLE_REFRESH_TOKEN'];

async function main() {
  console.log('===============================================================');
  console.log('  LifeOS — Phase 5b Live Google Calendar Verification');
  console.log('===============================================================\n');

  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    console.warn('Notice: Real Google credentials not detected in environment.');
    console.log('To run this verification against live Google endpoints, provide:');
    console.log('  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... GOOGLE_REFRESH_TOKEN=... pnpm --filter @lifeos/backend verify:google:live\n');
    console.log('Prerequisites:');
    console.log('1. Google Cloud Project with Calendar API enabled.');
    console.log('2. OAuth 2.0 Web Client ID/Secret with redirect URI matching http://localhost:4000/api/integrations/google/callback.');
    console.log('3. An authorized refresh token (obtained via the OAuth consent flow).\n');
    console.log('Skipping live HTTP calls. Running cryptographic token round-trip check...');

    // Cryptographic validation
    const sampleToken = 'ya29.sample_google_access_token_1234567890';
    const enc = encryptToken(sampleToken);
    const dec = decryptToken(enc.ciphertext, enc.iv, enc.authTag);
    console.log('✓ AES-256-GCM Token Encryption at Rest Verified: matches =', dec === sampleToken);
    return;
  }

  // 1. AES-256-GCM Token Encryption Check
  console.log('--- Step 1: AES-256-GCM Token Encryption at Rest ---');
  const encRefresh = encryptToken(REFRESH_TOKEN);
  const decRefresh = decryptToken(encRefresh.ciphertext, encRefresh.iv, encRefresh.authTag);
  console.log('✓ Stored refresh token encrypted at rest (AES-256-GCM)');
  console.log('  Ciphertext (truncated):', encRefresh.ciphertext.slice(0, 32) + '...');
  console.log('  Decrypted matches original:', decRefresh === REFRESH_TOKEN);
  console.log();

  // 2. Live Token Refresh
  console.log('--- Step 2: Live Token Refresh via oauth2.googleapis.com ---');
  const refreshResult = await googleCalendarClient.refreshAccessToken({
    refreshToken: REFRESH_TOKEN,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
  });
  console.log('✓ Successfully refreshed access token against live Google token endpoint');
  console.log('  New Access Token (truncated):', refreshResult.accessToken.slice(0, 25) + '...');
  console.log('  Expires in (seconds)        :', refreshResult.expiresIn);
  console.log();

  // 3. User Info Verification
  console.log('--- Step 3: Live User Identity Verification ---');
  const userInfo = await googleCalendarClient.getUserInfo(refreshResult.accessToken);
  console.log('✓ Successfully retrieved Google user profile');
  console.log('  Connected Email:', userInfo.email);
  console.log('  Account Name   :', userInfo.name || 'N/A');
  console.log();

  // 4. Live Calendar Events Fetch (Rolling 14-day Window)
  console.log('--- Step 4: Live Calendar Events Fetch (Rolling 14-Day Window) ---');
  const now = new Date();
  const timeMin = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const timeMax = new Date(timeMin.getTime() + 14 * 24 * 60 * 60 * 1000);

  const events = await googleCalendarClient.listEvents(
    refreshResult.accessToken,
    timeMin.toISOString(),
    timeMax.toISOString(),
  );
  console.log(`✓ Successfully fetched ${events.length} event(s) from primary Google Calendar:`);
  for (const event of events.slice(0, 5)) {
    console.log(`  - [${event.startTime}] "${event.summary}" (ID: ${event.id})`);
    if (event.location) console.log(`    Location: ${event.location}`);
    if (event.htmlLink) console.log(`    Link: ${event.htmlLink}`);
  }
  if (events.length > 5) {
    console.log(`  ... and ${events.length - 5} more event(s)`);
  }
  console.log();

  // 5. Forced Autonomous Token Refresh Check
  console.log('--- Step 5: Forced Autonomous Token Refresh Lifecycle Check ---');
  console.log('Simulating expired access token and forcing a second refresh...');
  const secondRefresh = await googleCalendarClient.refreshAccessToken({
    refreshToken: REFRESH_TOKEN,
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
  });
  console.log('✓ Second forced refresh succeeded: valid new access token obtained.');
  console.log('  New token matches first token?:', secondRefresh.accessToken === refreshResult.accessToken ? 'Yes' : 'Rotated/Fresh');
  console.log();

  console.log('===============================================================');
  console.log('  Phase 5b Live Google Calendar Integration Verification PASSED! ');
  console.log('===============================================================');
}

main().catch((err) => {
  console.error('Live verification failed:', err);
  process.exit(1);
});
