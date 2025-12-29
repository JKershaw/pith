import type { FunctionDeclaration, MethodDeclaration, ClassDeclaration } from 'ts-morph';

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
 * Extract JSDoc from a function, method, or class declaration.
 * @param node - The node to extract JSDoc from
 * @returns JSDoc data or null if no JSDoc is present
 */
export function extractJSDoc(
  node: FunctionDeclaration | MethodDeclaration | ClassDeclaration,
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
  const returnsTag = tags.find((tag) => tag.getTagName() === 'returns' || tag.getTagName() === 'return');
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
    deprecated = typeof comment === 'string' ? comment : undefined;
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
