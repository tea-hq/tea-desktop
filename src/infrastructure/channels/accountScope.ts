export async function deriveChannelAccountRef(
  transportId: string,
  appKey: string,
  account: string,
): Promise<string> {
  const input = new TextEncoder().encode(`${transportId}\0${appKey}\0${account}`)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', input)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}
