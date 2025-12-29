#!/usr/bin/env node --experimental-strip-types
/**
 * PR Review Summary Script
 *
 * Fetches and displays a summary of the current branch's PR including:
 * - PR status and details
 * - CI check results
 * - CodeRabbit review comments
 *
 * Usage: npm run pr:review
 */

import { execSync } from 'node:child_process';
import { request, ProxyAgent, setGlobalDispatcher } from 'undici';

// Configure global proxy if HTTPS_PROXY is set
const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
if (proxyUrl) {
  try {
    setGlobalDispatcher(new ProxyAgent(proxyUrl));
  } catch (error) {
    console.warn(`Warning: Failed to configure proxy: ${(error as Error).message}`);
  }
}

// Types
interface GitHubUser {
  login: string;
  type: string;
}

interface PullRequest {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  html_url: string;
  user: GitHubUser;
  head: {
    sha: string;
    ref: string;
  };
  created_at: string;
  updated_at: string;
}

interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string;
  completed_at: string | null;
  html_url: string;
}

interface CheckRunsResponse {
  total_count: number;
  check_runs: CheckRun[];
}

interface CommitStatus {
  state: string;
  context: string;
  description: string;
}

interface CommitStatusResponse {
  state: string;
  statuses: CommitStatus[];
}

interface ReviewComment {
  id: number;
  user: GitHubUser;
  body: string;
  path: string;
  line: number | null;
  start_line: number | null;
  created_at: string;
  html_url: string;
}

interface IssueComment {
  id: number;
  user: GitHubUser;
  body: string;
  created_at: string;
  html_url: string;
}

interface Review {
  id: number;
  user: GitHubUser;
  state: string;
  body: string;
  submitted_at: string;
}

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

// Helpers
function getRepoInfo(): { owner: string; repo: string } | null {
  try {
    const remoteUrl = execSync('git config --get remote.origin.url', {
      encoding: 'utf-8',
    }).trim();

    // Handle various URL formats
    // https://github.com/owner/repo.git
    // git@github.com:owner/repo.git
    // http://proxy/git/owner/repo
    // Repo names can contain: letters, numbers, hyphens, underscores, dots
    const patterns = [
      /github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/,
      /\/git\/([\w.-]+)\/([\w.-]+?)(?:\.git)?$/,
    ];

    for (const pattern of patterns) {
      const match = remoteUrl.match(pattern);
      if (match) {
        return { owner: match[1], repo: match[2] };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function getCurrentBranch(): string | null {
  try {
    return execSync('git branch --show-current', { encoding: 'utf-8' }).trim();
  } catch {
    return null;
  }
}

async function fetchJSON<T>(url: string): Promise<T> {
  // Support GITHUB_TOKEN or GH_TOKEN for higher rate limits (5000/hr vs 60/hr)
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'pith-pr-review',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const { statusCode, body } = await request(url, {
    method: 'GET',
    headers,
  });

  if (statusCode !== 200) {
    const text = await body.text();
    throw new Error(`GitHub API error: ${statusCode}. ${text}`);
  }

  return body.json() as Promise<T>;
}

async function findPRForBranch(
  owner: string,
  repo: string,
  branch: string
): Promise<PullRequest | null> {
  const prs = await fetchJSON<PullRequest[]>(
    `https://api.github.com/repos/${owner}/${repo}/pulls?state=all&head=${owner}:${branch}`
  );
  return prs.length > 0 ? prs[0] : null;
}

async function getCheckRuns(
  owner: string,
  repo: string,
  sha: string
): Promise<CheckRunsResponse> {
  return fetchJSON<CheckRunsResponse>(
    `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs`
  );
}

async function getCommitStatus(
  owner: string,
  repo: string,
  sha: string
): Promise<CommitStatusResponse> {
  return fetchJSON<CommitStatusResponse>(
    `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/status`
  );
}

async function getPRComments(
  owner: string,
  repo: string,
  prNumber: number
): Promise<ReviewComment[]> {
  return fetchJSON<ReviewComment[]>(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/comments`
  );
}

async function getIssueComments(
  owner: string,
  repo: string,
  prNumber: number
): Promise<IssueComment[]> {
  return fetchJSON<IssueComment[]>(
    `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/comments`
  );
}

async function getReviews(
  owner: string,
  repo: string,
  prNumber: number
): Promise<Review[]> {
  return fetchJSON<Review[]>(
    `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/reviews`
  );
}

// Formatters
function formatDuration(start: string, end: string | null): string {
  if (!end) return 'in progress';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatCheckIcon(status: string, conclusion: string | null): string {
  if (status !== 'completed') {
    return `${colors.yellow}⏳${colors.reset}`;
  }
  switch (conclusion) {
    case 'success':
      return `${colors.green}✓${colors.reset}`;
    case 'failure':
      return `${colors.red}✗${colors.reset}`;
    case 'skipped':
      return `${colors.dim}○${colors.reset}`;
    default:
      return `${colors.yellow}?${colors.reset}`;
  }
}

function formatPRState(pr: PullRequest): string {
  if (pr.draft) {
    return `${colors.dim}Draft${colors.reset}`;
  }
  switch (pr.state) {
    case 'open':
      return `${colors.green}Open${colors.reset}`;
    case 'closed':
      return `${colors.red}Closed${colors.reset}`;
    case 'merged':
      return `${colors.magenta}Merged${colors.reset}`;
    default:
      return pr.state;
  }
}

function extractCodeRabbitSummary(body: string): string | null {
  // Extract actionable comments count
  const actionableMatch = body.match(/\*\*Actionable comments posted: (\d+)\*\*/);
  if (actionableMatch) {
    return `Actionable comments: ${actionableMatch[1]}`;
  }
  return null;
}

function parseInlineComment(comment: ReviewComment): {
  file: string;
  lines: string;
  summary: string;
  severity: string;
} {
  const file = comment.path;
  const lines =
    comment.start_line && comment.line
      ? `${comment.start_line}-${comment.line}`
      : comment.line
        ? `${comment.line}`
        : '?';

  // Try to extract severity from CodeRabbit format
  let severity = 'info';
  if (comment.body.includes('_⚠️ Potential issue_')) {
    severity = comment.body.includes('🟠 Major') ? 'major' : 'minor';
  } else if (comment.body.includes('🧹 Nitpick')) {
    severity = 'nitpick';
  }

  // Extract first meaningful line as summary
  let summary = '';
  const lines_arr = comment.body.split('\n');
  for (const line of lines_arr) {
    const cleanLine = line.replace(/[_*`#]/g, '').trim();
    if (
      cleanLine &&
      !cleanLine.startsWith('⚠️') &&
      !cleanLine.startsWith('🟠') &&
      !cleanLine.startsWith('🟡') &&
      cleanLine.length > 10
    ) {
      summary = cleanLine.slice(0, 80);
      if (cleanLine.length > 80) summary += '...';
      break;
    }
  }

  return { file, lines, summary, severity };
}

function formatSeverityIcon(severity: string): string {
  switch (severity) {
    case 'major':
      return `${colors.red}●${colors.reset}`;
    case 'minor':
      return `${colors.yellow}●${colors.reset}`;
    case 'nitpick':
      return `${colors.dim}○${colors.reset}`;
    default:
      return `${colors.blue}●${colors.reset}`;
  }
}

async function getPRByNumber(
  owner: string,
  repo: string,
  prNumber: number
): Promise<PullRequest | null> {
  try {
    return await fetchJSON<PullRequest>(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`
    );
  } catch {
    return null;
  }
}

function parseArgs(): { prNumber?: number } {
  const args = process.argv.slice(2);
  const prIndex = args.findIndex((a) => a === '--pr' || a === '-p');
  if (prIndex !== -1 && args[prIndex + 1]) {
    const num = parseInt(args[prIndex + 1], 10);
    if (!isNaN(num)) {
      return { prNumber: num };
    }
  }
  return {};
}

// Main
async function main(): Promise<void> {
  const { prNumber } = parseArgs();

  // Get repo info
  const repoInfo = getRepoInfo();
  if (!repoInfo) {
    console.error('Could not determine repository from git remote');
    process.exit(1);
  }

  const { owner, repo } = repoInfo;
  let pr: PullRequest | null = null;

  if (prNumber) {
    console.log(`${colors.dim}Fetching PR #${prNumber} for ${owner}/${repo}...${colors.reset}\n`);
    pr = await getPRByNumber(owner, repo, prNumber);
    if (!pr) {
      console.error(`${colors.red}PR #${prNumber} not found${colors.reset}`);
      process.exit(1);
    }
  } else {
    const branch = getCurrentBranch();
    if (!branch) {
      console.error('Could not determine current branch');
      process.exit(1);
    }

    console.log(`${colors.dim}Fetching PR for ${owner}/${repo} branch: ${branch}...${colors.reset}\n`);
    pr = await findPRForBranch(owner, repo, branch);
    if (!pr) {
      console.log(`${colors.yellow}No PR found for branch: ${branch}${colors.reset}`);
      console.log(`\nCreate one with: ${colors.cyan}gh pr create${colors.reset}`);
      console.log(`Or specify a PR number: ${colors.cyan}npm run pr:review -- --pr 7${colors.reset}`);
      process.exit(0);
    }
  }

  // Fetch all data in parallel
  const [checkRuns, commitStatus, prComments, issueComments, reviews] = await Promise.all([
    getCheckRuns(owner, repo, pr.head.sha),
    getCommitStatus(owner, repo, pr.head.sha),
    getPRComments(owner, repo, pr.number),
    getIssueComments(owner, repo, pr.number),
    getReviews(owner, repo, pr.number),
  ]);

  // Print header
  const title = pr.title.length > 60 ? pr.title.slice(0, 57) + '...' : pr.title;
  console.log(`${colors.bold}PR #${pr.number}: ${title}${colors.reset}`);
  console.log('━'.repeat(70));
  console.log(`Status: ${formatPRState(pr)}`);
  console.log(`${colors.dim}${pr.html_url}${colors.reset}`);
  console.log();

  // CI Checks
  const allChecks = [
    ...checkRuns.check_runs.map((c) => ({
      name: c.name,
      status: c.status,
      conclusion: c.conclusion,
      duration: formatDuration(c.started_at, c.completed_at),
    })),
    ...commitStatus.statuses.map((s) => ({
      name: s.context,
      status: 'completed',
      conclusion: s.state,
      duration: s.description,
    })),
  ];

  if (allChecks.length > 0) {
    const passed = allChecks.filter((c) => c.conclusion === 'success').length;
    const failed = allChecks.filter((c) => c.conclusion === 'failure').length;
    const pending = allChecks.filter((c) => c.status !== 'completed').length;

    let statusText = `${passed}/${allChecks.length} passed`;
    if (failed > 0) statusText += `, ${colors.red}${failed} failed${colors.reset}`;
    if (pending > 0) statusText += `, ${colors.yellow}${pending} pending${colors.reset}`;

    console.log(`${colors.bold}CI Checks${colors.reset} (${statusText})`);
    for (const check of allChecks) {
      const icon = formatCheckIcon(check.status, check.conclusion);
      console.log(`  ${icon} ${check.name} - ${check.duration}`);
    }
    console.log();
  }

  // CodeRabbit Review
  const coderabbitComments = prComments.filter(
    (c) => c.user.login === 'coderabbitai[bot]'
  );
  const coderabbitIssueComments = issueComments.filter(
    (c) => c.user.login === 'coderabbitai[bot]'
  );
  const coderabbitReviews = reviews.filter(
    (r) => r.user.login === 'coderabbitai[bot]'
  );

  if (coderabbitReviews.length > 0 || coderabbitComments.length > 0) {
    console.log(`${colors.bold}🐰 CodeRabbit Review${colors.reset}`);

    // Show review summary from latest review
    const latestReview = coderabbitReviews[coderabbitReviews.length - 1];
    if (latestReview) {
      const summary = extractCodeRabbitSummary(latestReview.body);
      if (summary) {
        console.log(`  ${summary}`);
      }
    }

    // Show inline comments
    if (coderabbitComments.length > 0) {
      console.log();
      console.log(`  ${colors.cyan}Inline Comments (${coderabbitComments.length}):${colors.reset}`);

      // Group by resolved status (comments with "Addressed" are resolved)
      const unresolvedComments = coderabbitComments.filter(
        (c) => !c.body.includes('✅ Addressed')
      );
      const resolvedComments = coderabbitComments.filter((c) =>
        c.body.includes('✅ Addressed')
      );

      for (const comment of unresolvedComments.slice(0, 10)) {
        const { file, lines, summary, severity } = parseInlineComment(comment);
        const icon = formatSeverityIcon(severity);
        console.log(`  ${icon} ${colors.dim}${file}:${lines}${colors.reset}`);
        if (summary) {
          console.log(`    ${summary}`);
        }
      }

      if (unresolvedComments.length > 10) {
        console.log(
          `  ${colors.dim}... and ${unresolvedComments.length - 10} more${colors.reset}`
        );
      }

      if (resolvedComments.length > 0) {
        console.log(
          `  ${colors.green}✓ ${resolvedComments.length} resolved${colors.reset}`
        );
      }
    }

    // Show walkthrough summary if present
    const walkthroughComment = coderabbitIssueComments.find((c) =>
      c.body.includes('Walkthrough')
    );
    if (walkthroughComment) {
      // Extract pre-merge checks
      const checksMatch = walkthroughComment.body.match(
        /✅ Passed checks \((\d+) passed\)/
      );
      if (checksMatch) {
        console.log();
        console.log(
          `  ${colors.green}✓ Pre-merge checks: ${checksMatch[1]} passed${colors.reset}`
        );
      }
    }
    console.log();
  }

  // Other reviewers
  const otherReviews = reviews.filter(
    (r) => r.user.login !== 'coderabbitai[bot]' && r.user.type !== 'Bot'
  );
  if (otherReviews.length > 0) {
    console.log(`${colors.bold}👥 Reviews${colors.reset}`);
    for (const review of otherReviews) {
      let stateIcon = '💬';
      if (review.state === 'APPROVED') stateIcon = '✅';
      if (review.state === 'CHANGES_REQUESTED') stateIcon = '🔄';
      console.log(`  ${stateIcon} @${review.user.login}: ${review.state}`);
    }
    console.log();
  }

  // Other comments
  const otherComments = issueComments.filter(
    (c) => c.user.login !== 'coderabbitai[bot]' && c.user.type !== 'Bot'
  );
  if (otherComments.length > 0) {
    console.log(`${colors.bold}💬 Comments (${otherComments.length})${colors.reset}`);
    for (const comment of otherComments.slice(0, 5)) {
      const preview =
        comment.body.slice(0, 60).replace(/\n/g, ' ') +
        (comment.body.length > 60 ? '...' : '');
      console.log(`  @${comment.user.login}: ${preview}`);
    }
    if (otherComments.length > 5) {
      console.log(`  ${colors.dim}... and ${otherComments.length - 5} more${colors.reset}`);
    }
    console.log();
  }
}

main().catch((error) => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});
