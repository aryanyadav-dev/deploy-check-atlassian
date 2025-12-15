/**
 * Markdown to Confluence Storage Format Converter
 * Converts markdown content to Confluence's XHTML-based storage format
 * Requirements: 5.1, 5.5
 */

/**
 * Convert markdown to Confluence storage format (XHTML)
 * This is a simplified converter that handles common markdown elements
 */
export function markdownToConfluenceStorage(markdown: string): string {
  let html = markdown;

  // Escape HTML entities first (except for our generated tags)
  html = escapeHtmlEntities(html);

  // Convert headers (h1-h6)
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Convert code blocks with language
  html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    const language = lang || 'none';
    const escapedCode = code.trim();
    return `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">${language}</ac:parameter><ac:plain-text-body><![CDATA[${escapedCode}]]></ac:plain-text-body></ac:structured-macro>`;
  });

  // Convert inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Convert bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Convert italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Convert links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Convert blockquotes
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote><p>$1</p></blockquote>');

  // Convert horizontal rules
  html = html.replace(/^---+$/gm, '<hr />');
  html = html.replace(/^\*\*\*+$/gm, '<hr />');

  // Convert unordered lists
  html = convertUnorderedLists(html);

  // Convert ordered lists
  html = convertOrderedLists(html);

  // Convert checkboxes in lists
  html = html.replace(/<li>\s*\[ \]\s*/g, '<li><ac:task-status>incomplete</ac:task-status> ');
  html = html.replace(/<li>\s*\[x\]\s*/gi, '<li><ac:task-status>complete</ac:task-status> ');

  // Convert tables
  html = convertTables(html);

  // Convert paragraphs (lines not already wrapped)
  html = convertParagraphs(html);

  // Clean up multiple newlines
  html = html.replace(/\n{3,}/g, '\n\n');

  return html.trim();
}


/**
 * Escape HTML entities in text
 */
function escapeHtmlEntities(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Convert markdown unordered lists to HTML
 */
function convertUnorderedLists(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;

  for (const line of lines) {
    const match = line.match(/^(\s*)[-*]\s+(.+)$/);
    if (match) {
      if (!inList) {
        result.push('<ul>');
        inList = true;
      }
      result.push(`<li>${match[2]}</li>`);
    } else {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      result.push(line);
    }
  }

  if (inList) {
    result.push('</ul>');
  }

  return result.join('\n');
}

/**
 * Convert markdown ordered lists to HTML
 */
function convertOrderedLists(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  let inList = false;

  for (const line of lines) {
    const match = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (match) {
      if (!inList) {
        result.push('<ol>');
        inList = true;
      }
      result.push(`<li>${match[2]}</li>`);
    } else {
      if (inList) {
        result.push('</ol>');
        inList = false;
      }
      result.push(line);
    }
  }

  if (inList) {
    result.push('</ol>');
  }

  return result.join('\n');
}

/**
 * Convert markdown tables to HTML
 */
function convertTables(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];
  let inTable = false;
  let headerProcessed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTableRow = line.match(/^\|(.+)\|$/);

    if (isTableRow) {
      const cells = line.split('|').filter((c) => c.trim() !== '');

      // Check if this is a separator row (|---|---|)
      const isSeparator = cells.every((c) => /^[\s-:]+$/.test(c));

      if (isSeparator) {
        continue; // Skip separator rows
      }

      if (!inTable) {
        result.push('<table>');
        inTable = true;
        headerProcessed = false;
      }

      if (!headerProcessed) {
        // First row is header
        result.push('<tr>');
        for (const cell of cells) {
          result.push(`<th>${cell.trim()}</th>`);
        }
        result.push('</tr>');
        headerProcessed = true;
      } else {
        result.push('<tr>');
        for (const cell of cells) {
          result.push(`<td>${cell.trim()}</td>`);
        }
        result.push('</tr>');
      }
    } else {
      if (inTable) {
        result.push('</table>');
        inTable = false;
        headerProcessed = false;
      }
      result.push(line);
    }
  }

  if (inTable) {
    result.push('</table>');
  }

  return result.join('\n');
}

/**
 * Convert remaining text lines to paragraphs
 */
function convertParagraphs(html: string): string {
  const lines = html.split('\n');
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      result.push('');
      continue;
    }

    // Skip lines that are already HTML elements
    if (
      trimmed.startsWith('<h') ||
      trimmed.startsWith('<p') ||
      trimmed.startsWith('<ul') ||
      trimmed.startsWith('<ol') ||
      trimmed.startsWith('<li') ||
      trimmed.startsWith('</') ||
      trimmed.startsWith('<table') ||
      trimmed.startsWith('<tr') ||
      trimmed.startsWith('<th') ||
      trimmed.startsWith('<td') ||
      trimmed.startsWith('<blockquote') ||
      trimmed.startsWith('<hr') ||
      trimmed.startsWith('<ac:') ||
      trimmed.startsWith('<code')
    ) {
      result.push(line);
      continue;
    }

    // Wrap in paragraph
    result.push(`<p>${trimmed}</p>`);
  }

  return result.join('\n');
}

/**
 * Wrap content in a Confluence expand macro (collapsible section)
 */
export function wrapInExpandMacro(title: string, content: string): string {
  return `<ac:structured-macro ac:name="expand">
<ac:parameter ac:name="title">${title}</ac:parameter>
<ac:rich-text-body>
${content}
</ac:rich-text-body>
</ac:structured-macro>`;
}

/**
 * Create a Confluence status macro
 */
export function createStatusMacro(
  text: string,
  color: 'Grey' | 'Red' | 'Yellow' | 'Green' | 'Blue'
): string {
  return `<ac:structured-macro ac:name="status">
<ac:parameter ac:name="title">${text}</ac:parameter>
<ac:parameter ac:name="colour">${color}</ac:parameter>
</ac:structured-macro>`;
}

/**
 * Create a Confluence info/warning/note panel
 */
export function createPanelMacro(
  type: 'info' | 'warning' | 'note' | 'tip',
  content: string,
  title?: string
): string {
  let macro = `<ac:structured-macro ac:name="${type}">`;
  if (title) {
    macro += `<ac:parameter ac:name="title">${title}</ac:parameter>`;
  }
  macro += `<ac:rich-text-body>${content}</ac:rich-text-body></ac:structured-macro>`;
  return macro;
}
