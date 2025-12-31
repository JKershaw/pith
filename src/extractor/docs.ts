import type { FunctionDeclaration, MethodDeclaration, ClassDeclaration } from 'ts-morph';
import { join } from 'node:path';
import { readFile, readdir } from 'node:fs/promises';
import type { ProjectContext } from './ast.ts';

/**
 * JSDoc parameter information.
 */
export interface JSDocParam {
  name: string;
  type: string;
  description: string;
}

/**
 * JSDoc documentation data.
 */
export interface JSDoc {
  description: string;
  params: JSDocParam[];
  returns?: string;
  throws?: string[];
  examples?: string[];
  deprecated?: string;
  see?: string[];
}

/**
 * Inline comment information.
 */
export interface InlineComment {
  text: string;
  line: number;
  nearFunction?: string;
}

/**
 * TODO comment information.
 */
export interface Todo {
  type: 'TODO' | 'FIXME' | 'HACK' | 'XXX';
  text: string;
  line: number;
}

/**
 * Deprecation information.
 */
export interface Deprecation {
  entityName: string; // Name of deprecated function/class/method
  message: string; // The deprecation message
  line: number; // Line where the entity is declared
}

/**
 * Complete documentation information for a file.
 */
export interface DocsInfo {
  jsdoc: Record<string, JSDoc>; // function/class name -> JSDoc
  inlineComments: InlineComment[];
  readme?: string;
  todos: Todo[];
  deprecations: Deprecation[];
}

/**
 * Extract JSDoc from a function, method, or class declaration.
 * @param node - The node to extract JSDoc from
 * @returns JSDoc data or null if no JSDoc is present
 */
export function extractJSDoc(
  node: FunctionDeclaration | MethodDeclaration | ClassDeclaration
): JSDoc | null {
  const jsDocs = node.getJsDocs();

  if (jsDocs.length === 0) {
    return null;
  }

  // Get the first JSDoc comment (usually there's only one)
  const jsDoc = jsDocs[0];
  if (!jsDoc) {
    return null;
  }

  // Extract description
  const description = jsDoc.getDescription().trim();

  // Extract tags
  const tags = jsDoc.getTags();

  // Extract @param tags
  const params: JSDocParam[] = [];
  for (const tag of tags) {
    if (tag.getTagName() === 'param') {
      // Get the full tag text
      const tagText = tag.getText();

      // Parse parameter name and type from the tag text
      // Format: @param {type} name - description OR @param name - description
      let paramName = '';
      let paramType = '';
      let description = '';

      // Try to match format: @param {type} name - description
      const withTypeMatch = tagText.match(/@param\s+\{([^}]+)\}\s+(\w+)\s*-?\s*(.*)/s);
      if (withTypeMatch) {
        paramType = withTypeMatch[1] || '';
        paramName = withTypeMatch[2] || '';
        description = withTypeMatch[3]?.trim() || '';
        // Clean up description from JSDoc formatting (remove leading * from continuation lines)
        description = description.replace(/\n\s*\*\s*/g, ' ').trim();
      } else {
        // Try to match format: @param name - description
        const withoutTypeMatch = tagText.match(/@param\s+(\w+)\s*-?\s*(.*)/s);
        if (withoutTypeMatch) {
          paramName = withoutTypeMatch[1] || '';
          description = withoutTypeMatch[2]?.trim() || '';
          // Clean up description from JSDoc formatting (remove leading * from continuation lines)
          description = description.replace(/\n\s*\*\s*/g, ' ').trim();

          // Try to get type from the function's actual parameter
          if ('getParameters' in node && typeof node.getParameters === 'function') {
            const funcParams = node.getParameters();
            const funcParam = funcParams.find((p) => p.getName() === paramName);
            if (funcParam) {
              const fullType = funcParam.getType().getText();
              // Extract just the type name from full path like import("...").User -> User
              const typeMatch = fullType.match(/\.(\w+)$/);
              paramType = typeMatch?.[1] || fullType;
            }
          }
        }
      }

      params.push({
        name: paramName,
        type: paramType,
        description,
      });
    }
  }

  // Extract @returns tag
  let returns: string | undefined;
  const returnsTag = tags.find(
    (tag) => tag.getTagName() === 'returns' || tag.getTagName() === 'return'
  );
  if (returnsTag) {
    const comment = returnsTag.getComment();
    returns = typeof comment === 'string' ? comment : undefined;
  }

  // Extract @throws tags (can be multiple)
  const throwsTags = tags.filter((tag) => tag.getTagName() === 'throws');
  const throws: string[] = [];
  for (const throwsTag of throwsTags) {
    const comment = throwsTag.getComment();
    if (typeof comment === 'string') {
      throws.push(comment);
    }
  }

  // Extract @deprecated tag
  let deprecated: string | undefined;
  const deprecatedTag = tags.find((tag) => tag.getTagName() === 'deprecated');
  if (deprecatedTag) {
    const comment = deprecatedTag.getComment();
    // Set to empty string if tag exists but has no comment
    deprecated = typeof comment === 'string' ? comment : '';
  }

  // Extract @example tags (can be multiple)
  const exampleTags = tags.filter((tag) => tag.getTagName() === 'example');
  const examples: string[] = [];
  for (const exampleTag of exampleTags) {
    const comment = exampleTag.getComment();
    if (typeof comment === 'string') {
      examples.push(comment);
    }
  }

  // Extract @see tags (can be multiple)
  const seeTags = tags.filter((tag) => tag.getTagName() === 'see');
  const see: string[] = [];
  for (const seeTag of seeTags) {
    const comment = seeTag.getComment();
    if (typeof comment === 'string') {
      see.push(comment);
    }
  }

  return {
    description,
    params,
    returns,
    throws: throws.length > 0 ? throws : undefined,
    examples: examples.length > 0 ? examples : undefined,
    deprecated,
    see: see.length > 0 ? see : undefined,
  };
}

/**
 * Extract inline comments from a TypeScript file.
 * @param ctx - The project context
 * @param relativePath - The relative path to the file
 * @returns Array of inline comments with their locations
 */
export function extractInlineComments(ctx: ProjectContext, relativePath: string): InlineComment[] {
  const fullPath = join(ctx.rootDir, relativePath);
  const sourceFile = ctx.project.addSourceFileAtPath(fullPath);
  const comments: InlineComment[] = [];

  // Get the full text to parse comments
  const fullText = sourceFile.getFullText();
  const lines = fullText.split('\n');

  // Get all functions in the file for nearFunction detection
  const functions = sourceFile.getFunctions();
  const functionRanges = functions.map((func) => ({
    name: func.getName() || 'anonymous',
    startLine: func.getStartLineNumber(),
    endLine: func.getEndLineNumber(),
  }));

  // Parse each line for single-line comments
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Match single-line comments (// ...)
    // Avoid matching URLs (http://, https://)
    const commentMatch = line.match(/(?<!:)\/\/\s*(.+)/);
    if (commentMatch) {
      const commentText = commentMatch[1]?.trim();
      if (!commentText) continue;

      const lineNumber = i + 1; // Line numbers are 1-indexed

      // Find which function this comment is in
      let nearFunction: string | undefined;
      for (const func of functionRanges) {
        if (lineNumber >= func.startLine && lineNumber <= func.endLine) {
          nearFunction = func.name;
          break;
        }
      }

      comments.push({
        text: commentText,
        line: lineNumber,
        nearFunction,
      });
    }
  }

  return comments;
}

/**
 * Extract TODO comments from a TypeScript file.
 * @param ctx - The project context
 * @param relativePath - The relative path to the file
 * @returns Array of TODO comments with their locations
 */
export function extractTodos(ctx: ProjectContext, relativePath: string): Todo[] {
  const fullPath = join(ctx.rootDir, relativePath);
  const sourceFile = ctx.project.addSourceFileAtPath(fullPath);
  const todos: Todo[] = [];

  // Get the full text to parse comments
  const fullText = sourceFile.getFullText();
  const lines = fullText.split('\n');

  // Regex to match TODO, FIXME, HACK, or XXX markers
  // Matches: TODO:, TODO , FIXME:, etc. (case-insensitive)
  const todoRegex = /(TODO|FIXME|HACK|XXX):?\s*(.*)$/i;

  // Parse each line for TODO markers
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Check if line contains a comment with a TODO marker
    const commentMatch = line.match(/(?:\/\/|\/\*)\s*(.*)/);
    if (commentMatch) {
      const commentContent = commentMatch[1];
      if (!commentContent) continue;

      // Check if comment contains a TODO marker
      const todoMatch = commentContent.match(todoRegex);
      if (todoMatch) {
        const type = todoMatch[1]?.toUpperCase() as 'TODO' | 'FIXME' | 'HACK' | 'XXX';
        let text = todoMatch[2]?.trim() || '';

        // Remove closing */ from block comments
        text = text.replace(/\*\/\s*$/, '').trim();

        todos.push({
          type,
          text,
          line: i + 1, // Line numbers are 1-indexed
        });
      }
    }
  }

  return todos;
}

/**
 * Extracts README.md content from a directory.
 * @param dirPath - Absolute path to directory
 * @returns README content or null if not found
 */
export async function extractReadme(dirPath: string): Promise<string | null> {
  try {
    // Read directory contents
    const files = await readdir(dirPath);

    // Look for README file (case-insensitive)
    const readmeFile = files.find((file) => file.toLowerCase() === 'readme.md');

    if (!readmeFile) {
      return null;
    }

    // Read and return the README content
    const readmePath = join(dirPath, readmeFile);
    const content = await readFile(readmePath, 'utf-8');
    return content;
  } catch {
    // Directory doesn't exist or can't be read
    return null;
  }
}

/**
 * Extract deprecations from a TypeScript file.
 * Finds all @deprecated markers and returns information about deprecated entities.
 * @param ctx - The project context
 * @param relativePath - The relative path to the file
 * @returns Array of deprecations with entity name, message, and line number
 */
export function extractDeprecations(ctx: ProjectContext, relativePath: string): Deprecation[] {
  const fullPath = join(ctx.rootDir, relativePath);
  const sourceFile = ctx.project.addSourceFileAtPath(fullPath);
  const deprecations: Deprecation[] = [];

  // Extract deprecations from classes
  const classes = sourceFile.getClasses();
  for (const cls of classes) {
    const jsdoc = extractJSDoc(cls);
    if (jsdoc?.deprecated !== undefined) {
      const entityName = cls.getName() || 'anonymous';
      const message = jsdoc.deprecated || '';
      const line = cls.getStartLineNumber();
      deprecations.push({ entityName, message, line });
    }

    // Extract deprecations from methods
    const methods = cls.getMethods();
    for (const method of methods) {
      const methodJsdoc = extractJSDoc(method);
      if (methodJsdoc?.deprecated !== undefined) {
        const entityName = method.getName();
        const message = methodJsdoc.deprecated || '';
        const line = method.getStartLineNumber();
        deprecations.push({ entityName, message, line });
      }
    }
  }

  // Extract deprecations from functions
  const functions = sourceFile.getFunctions();
  for (const func of functions) {
    const jsdoc = extractJSDoc(func);
    if (jsdoc?.deprecated !== undefined) {
      const entityName = func.getName() || 'anonymous';
      const message = jsdoc.deprecated || '';
      const line = func.getStartLineNumber();
      deprecations.push({ entityName, message, line });
    }
  }

  return deprecations;
}

/**
 * Extract all documentation data from a file.
 * @param ctx - ProjectContext
 * @param relativePath - Relative path to file
 * @param dirPath - Absolute path to directory (for README)
 * @returns Complete documentation info
 */
export async function extractDocs(
  ctx: ProjectContext,
  relativePath: string,
  dirPath: string
): Promise<DocsInfo> {
  const fullPath = join(ctx.rootDir, relativePath);
  const sourceFile = ctx.project.addSourceFileAtPath(fullPath);

  // Build JSDoc map for functions, classes, and methods
  const jsdoc: Record<string, JSDoc> = {};

  // Extract JSDoc from functions
  const functions = sourceFile.getFunctions();
  for (const func of functions) {
    const doc = extractJSDoc(func);
    if (doc) {
      const name = func.getName();
      if (name) {
        jsdoc[name] = doc;
      }
    }
  }

  // Extract JSDoc from classes and their methods
  const classes = sourceFile.getClasses();
  for (const cls of classes) {
    const classDoc = extractJSDoc(cls);
    if (classDoc) {
      const className = cls.getName();
      if (className) {
        jsdoc[className] = classDoc;
      }
    }

    // Extract JSDoc from methods
    const methods = cls.getMethods();
    for (const method of methods) {
      const methodDoc = extractJSDoc(method);
      if (methodDoc) {
        const methodName = method.getName();
        jsdoc[methodName] = methodDoc;
      }
    }
  }

  // Extract other doc types
  const inlineComments = extractInlineComments(ctx, relativePath);
  const readme = await extractReadme(dirPath);
  const todos = extractTodos(ctx, relativePath);
  const deprecations = extractDeprecations(ctx, relativePath);

  return {
    jsdoc,
    inlineComments,
    readme: readme ?? undefined,
    todos,
    deprecations,
  };
}
