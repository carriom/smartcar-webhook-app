import crypto from 'node:crypto'

export function verifySmartcarSignature({
  bodyBuffer,
  signatureHeader,
  secret,
}: {
  bodyBuffer: Buffer
  signatureHeader: string | null
  secret: string
}) {
  if (!signatureHeader) return false
  const computed = crypto
    .createHmac('sha256', secret)
    .update(bodyBuffer)
    .digest('hex')

  // Header may contain just the hex digest
  const provided = signatureHeader.trim()
  if (computed.length !== provided.length) return false
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(provided))
}


