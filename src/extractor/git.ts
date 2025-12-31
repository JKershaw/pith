import { simpleGit, type DefaultLogFields } from 'simple-git';

/**
 * Commit information.
 */
export interface Commit {
  hash: string;
  message: string;
  author: string;
  date: Date;
}

/**
 * Git metadata for a file.
 */
export interface GitInfo {
  commitCount: number;
  lastModified: Date;
  createdAt: Date;
  authors: string[];
  primaryAuthor: string;
  recentCommits: Commit[];
}

/**
 * Extract git metadata for a file.
 * @param repoDir - The repository directory
 * @param relativePath - The relative path to the file
 * @returns Git metadata for the file
 */
export async function extractGitInfo(repoDir: string, relativePath: string): Promise<GitInfo> {
  const git = simpleGit(repoDir);

  // Get all commits for this file
  const log = await git.log({
    file: relativePath,
    '--follow': null,
  });

  const commits = log.all;

  if (commits.length === 0) {
    // File has no git history (untracked)
    const now = new Date();
    return {
      commitCount: 0,
      lastModified: now,
      createdAt: now,
      authors: [],
      primaryAuthor: '',
      recentCommits: [],
    };
  }

  // Parse commits
  const parsedCommits: Commit[] = commits.map((c: DefaultLogFields) => ({
    hash: c.hash,
    message: c.message,
    author: c.author_email,
    date: new Date(c.date),
  }));

  // Get unique authors
  const authorCounts = new Map<string, number>();
  for (const commit of parsedCommits) {
    authorCounts.set(commit.author, (authorCounts.get(commit.author) || 0) + 1);
  }
  const authors = Array.from(authorCounts.keys());

  // Find primary author (most commits)
  let primaryAuthor = '';
  let maxCommits = 0;
  for (const [author, count] of authorCounts) {
    if (count > maxCommits) {
      maxCommits = count;
      primaryAuthor = author;
    }
  }

  return {
    commitCount: commits.length,
    lastModified: parsedCommits[0]?.date ?? new Date(),
    createdAt: parsedCommits[parsedCommits.length - 1]?.date ?? new Date(),
    authors,
    primaryAuthor,
    recentCommits: parsedCommits.slice(0, 5),
  };
}
