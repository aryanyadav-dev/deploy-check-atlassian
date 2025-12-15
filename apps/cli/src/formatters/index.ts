/**
 * Formatters Module
 * Exports all output formatters for CLI
 */

export {
  TerminalFormatter,
  TerminalFormatterOptions,
  createTerminalFormatter,
  LinkedFinding,
} from './terminal.formatter';

export {
  JsonFormatter,
  JsonFormatterOptions,
  JsonOutput,
  createJsonFormatter,
} from './json.formatter';

export {
  MarkdownFormatter,
  MarkdownFormatterOptions,
  createMarkdownFormatter,
} from './markdown.formatter';

export {
  ExitCodeHandler,
  ExitCodeOptions,
  getExitCode,
} from './exit-codes';
