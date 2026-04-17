// Simple SHA-256 hash of PIN (casual protection for mock-draft boards).
export async function hashPin(pin) {
  const encoder = new TextEncoder();
  const data = encoder.encode(`fantasy-mock-${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
