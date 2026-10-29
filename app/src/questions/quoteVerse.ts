/** Wrap verse text in curly quotes unless the WEB text already opens with one. */
export function quoteVerse(text: string): string {
  return /^[“"‘']/.test(text) ? text : `“${text}”`
}
