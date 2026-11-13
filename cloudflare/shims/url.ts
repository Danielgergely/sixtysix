// Stand-in for `node:url` (aliased in wrangler.jsonc). In a Worker bundle import.meta.url is not
// a file path; the server only uses it to locate data files, which shims/fs.ts serves by name.
export function fileURLToPath(url: unknown): string {
  return typeof url === 'string' && url.startsWith('file://') ? decodeURIComponent(url.slice(7)) : '/bundle/server/src/module.js'
}

export const pathToFileURL = (path: string): URL => new URL(`file://${path}`)

export default { fileURLToPath, pathToFileURL }
