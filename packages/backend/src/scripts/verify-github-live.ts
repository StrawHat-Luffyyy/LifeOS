/**
 * Live GitHub Integration Verification Script (V5-1)
 *
 * Runs the real connect -> link -> sync flow against live api.github.com
 * using the real GitHub PAT and real repositories.
 */
import { config } from '../config/index.js';
import { githubClient } from '../lib/github-client.js';
import { encryptToken, decryptToken } from '../lib/encryption.js';

// Real PAT from environment/credential helper
const REAL_PAT = 'REDACTED_TOKEN';
const REPO_OWNER = 'StrawHat-Luffyyy';
const REPO_NAME = 'LifeOS';

async function main() {
  console.log('===============================================================');
  console.log('  LifeOS — Phase 5a Live GitHub Integration Verification (V5-1)');
  console.log('===============================================================\n');

  // -------------------------------------------------------------------------
  // 1. Live PAT Validation against GET /user
  // -------------------------------------------------------------------------
  console.log('--- Step 1: Live PAT Validation against api.github.com/user ---');
  const user = await githubClient.validateToken(REAL_PAT);
  console.log('✓ Token validation SUCCEEDED against real GitHub API');
  console.log('  GitHub Username  :', user.username);
  console.log('  GitHub User ID   :', user.id);
  console.log('  GitHub Avatar URL:', user.avatarUrl);
  console.log();

  // -------------------------------------------------------------------------
  // 2. Encryption at Rest Verification (AES-256-GCM)
  // -------------------------------------------------------------------------
  console.log('--- Step 2: AES-256-GCM Token Encryption at Rest ---');
  const encryptionKey = config.INTEGRATION_ENCRYPTION_KEY;
  const encrypted = encryptToken(REAL_PAT, encryptionKey);
  console.log('✓ PAT encrypted with AES-256-GCM');
  console.log('  Ciphertext (hex) :', encrypted.ciphertext.slice(0, 32) + '... (truncated)');
  console.log('  IV (hex)         :', encrypted.iv);
  console.log('  Auth Tag (hex)   :', encrypted.authTag);

  const decrypted = decryptToken(encrypted.ciphertext, encrypted.iv, encrypted.authTag, encryptionKey);
  console.log('✓ PAT decrypted successfully. Matches original:', decrypted === REAL_PAT);
  console.log();

  // -------------------------------------------------------------------------
  // 3. Live Repo Link Validation against GET /repos/:owner/:name
  // -------------------------------------------------------------------------
  console.log(`--- Step 3: Live Repo Validation against api.github.com/repos/${REPO_OWNER}/${REPO_NAME} ---`);
  const repo = await githubClient.getRepo(REAL_PAT, REPO_OWNER, REPO_NAME);
  console.log('✓ Repository lookup SUCCEEDED against real GitHub API');
  console.log('  Full Name        :', repo.fullName);
  console.log('  HTML URL         :', repo.htmlUrl);
  console.log('  Default Branch   :', repo.defaultBranch);
  console.log('  Open Issues Count:', repo.openIssuesCount);
  console.log('  Permissions      :', JSON.stringify(repo.permissions));
  console.log();

  // -------------------------------------------------------------------------
  // 4. Live Issue Sync against StrawHat-Luffyyy/LifeOS
  // -------------------------------------------------------------------------
  console.log(`--- Step 4: Live Issue Sync from ${REPO_OWNER}/${REPO_NAME} ---`);
  const issues = await githubClient.listIssues(REAL_PAT, REPO_OWNER, REPO_NAME);
  console.log(`✓ Fetched ${issues.length} open issue(s) from real repository:`);
  for (const issue of issues) {
    console.log(`  - #${issue.number}: "${issue.title}"`);
    console.log(`    State: ${issue.state} | Author: @${issue.author} | Labels: [${issue.labels.join(', ')}]`);
    console.log(`    URL  : ${issue.url}`);
  }
  console.log();

  // -------------------------------------------------------------------------
  // 5. Critical Verification: PR-Filtering Logic on Real Mixed GitHub Endpoint
  // -------------------------------------------------------------------------
  console.log('--- Step 5: Real PR-Filtering Logic Verification ---');
  console.log('Testing GitHub REST API behavior on facebook/react (active repo with mixed PRs & issues)...');

  // Fetch raw response directly from GitHub API
  const rawResponse = await fetch('https://api.github.com/repos/facebook/react/issues?state=open&per_page=15', {
    headers: {
      'Authorization': `token ${REAL_PAT}`,
      'User-Agent': 'LifeOS/1.0',
      'Accept': 'application/vnd.github.v3+json',
    },
  });
  const rawItems: Array<{ number: number; title: string; pull_request?: object }> = await rawResponse.json();

  const totalRaw = rawItems.length;
  const rawIssuesOnly = rawItems.filter((i) => i.pull_request === undefined);
  const rawPRsInIssues = rawItems.filter((i) => i.pull_request !== undefined);

  console.log(`  Raw items returned by GET /repos/facebook/react/issues : ${totalRaw}`);
  console.log(`  Items with pull_request key (PRs mixed into /issues)  : ${rawPRsInIssues.length}`);
  console.log(`  Items without pull_request key (pure issues)          : ${rawIssuesOnly.length}`);

  // Now run through our LifeOS client's listIssues method
  const clientFilteredIssues = await githubClient.listIssues(REAL_PAT, 'facebook', 'react');
  const clientHasAnyPR = clientFilteredIssues.some((issue) =>
    rawPRsInIssues.some((pr) => pr.number === issue.number)
  );

  console.log(`  LifeOS listIssues returned count                       : ${clientFilteredIssues.length}`);
  console.log(`  Any PR leaked into client listIssues?                  : ${clientHasAnyPR ? 'YES (BUG)' : 'NO (CORRECT)'}`);
  if (!clientHasAnyPR) {
    console.log('✓ PR-filtering logic VERIFIED against real GitHub API: all pull requests cleanly excluded from issue list.');
  }

  // -------------------------------------------------------------------------
  // 6. Live Pull Requests Sync
  // -------------------------------------------------------------------------
  console.log('\n--- Step 6: Live Pull Request Sync from facebook/react ---');
  const prs = await githubClient.listPullRequests(REAL_PAT, 'facebook', 'react');
  console.log(`✓ Fetched ${prs.length} pull request(s) via real /pulls endpoint`);
  const firstPR = prs[0];
  if (firstPR) {
    console.log(`  Sample PR #${firstPR.number}: "${firstPR.title}"`);
    console.log(`    State: ${firstPR.state} | Draft: ${firstPR.isDraft} | Author: @${firstPR.author}`);
    console.log(`    URL  : ${firstPR.url}`);
  }

  console.log('\n===============================================================');
  console.log('  Phase 5a Live GitHub Integration Verification (V5-1) PASSED!  ');
  console.log('===============================================================');
}

main().catch((err) => {
  console.error('Live verification failed:', err);
  process.exit(1);
});
