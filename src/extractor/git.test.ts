import { describe, it } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { extractGitInfo } from './git.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, '../../test/fixtures/simple-project');

describe('extractGitInfo', () => {
  it('returns commit count (G1)', async () => {
    const result = await extractGitInfo(fixtureDir, 'src/types.ts');

    assert.ok(typeof result.commitCount === 'number');
    assert.ok(result.commitCount >= 1, 'Should have at least 1 commit');
  });

  it('returns last modified date (G2)', async () => {
    const result = await extractGitInfo(fixtureDir, 'src/types.ts');

    assert.ok(result.lastModified instanceof Date);
    assert.ok(!isNaN(result.lastModified.getTime()), 'Date should be valid');
  });

  it('returns created date (G3)', async () => {
    const result = await extractGitInfo(fixtureDir, 'src/types.ts');

    assert.ok(result.createdAt instanceof Date);
    assert.ok(!isNaN(result.createdAt.getTime()), 'Date should be valid');
    assert.ok(result.createdAt <= result.lastModified, 'Created should be <= last modified');
  });

  it('returns unique authors (G4)', async () => {
    const result = await extractGitInfo(fixtureDir, 'src/types.ts');

    assert.ok(Array.isArray(result.authors));
    assert.ok(result.authors.length >= 1, 'Should have at least 1 author');
  });

  it('returns recent commits (G5)', async () => {
    const result = await extractGitInfo(fixtureDir, 'src/types.ts');

    assert.ok(Array.isArray(result.recentCommits));
    assert.ok(result.recentCommits.length >= 1, 'Should have at least 1 commit');

    const commit = result.recentCommits[0];
    assert.ok(commit);
    assert.ok(typeof commit.hash === 'string');
    assert.ok(typeof commit.message === 'string');
    assert.ok(typeof commit.author === 'string');
    assert.ok(commit.date instanceof Date);
  });

  it('returns primary author (G6)', async () => {
    const result = await extractGitInfo(fixtureDir, 'src/types.ts');

    assert.ok(typeof result.primaryAuthor === 'string');
    assert.ok(result.authors.includes(result.primaryAuthor), 'Primary author should be in authors list');
  });
});
