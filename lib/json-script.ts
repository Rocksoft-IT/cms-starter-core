/**
 * Escape '<' because HTML recognizes </script> even inside an application/json script.
 */
export function jsonForScript(value: unknown): string {
  return (JSON.stringify(value) ?? 'null').replace(/</g, '\\u003c')
}
