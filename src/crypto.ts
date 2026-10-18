const K = [0x4b, 0x6e, 0x78, 0x21].concat([0x9d, 0x37, 0xa2, 0x5c]).concat([0x13, 0xe8])

export function decrypt(encoded: string): string {
  const bin = atob(encoded)
  const bytes = Uint8Array.from(bin, (c, i) => c.charCodeAt(0) ^ K[i % K.length])
  return new TextDecoder().decode(bytes)
}
