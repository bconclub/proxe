/**
 * Knowledge Base Content Processor
 * Extracts text from PDFs and DOCX files, then chunks for RAG retrieval.
 */

// ---------- Polyfills for pdf.js in Node.js ----------
// pdfjs-dist expects browser globals (DOMMatrix, Path2D) that don't exist server-side

if (typeof globalThis.DOMMatrix === 'undefined') {
  // Minimal DOMMatrix polyfill — pdf.js uses it for transform calculations
  class DOMMatrixPolyfill {
    m11 = 1; m12 = 0; m13 = 0; m14 = 0
    m21 = 0; m22 = 1; m23 = 0; m24 = 0
    m31 = 0; m32 = 0; m33 = 1; m34 = 0
    m41 = 0; m42 = 0; m43 = 0; m44 = 1
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
    is2D = true; isIdentity = true
    inverse() { return new DOMMatrixPolyfill() }
    multiply() { return new DOMMatrixPolyfill() }
    translate() { return new DOMMatrixPolyfill() }
    scale() { return new DOMMatrixPolyfill() }
    rotate() { return new DOMMatrixPolyfill() }
    transformPoint() { return { x: 0, y: 0, z: 0, w: 1 } }
  }
  globalThis.DOMMatrix = DOMMatrixPolyfill as any
}

if (typeof globalThis.Path2D === 'undefined') {
  class Path2DPolyfill {
    moveTo() {}
    lineTo() {}
    bezierCurveTo() {}
    quadraticCurveTo() {}
    arc() {}
    arcTo() {}
    ellipse() {}
    rect() {}
    closePath() {}
  }
  globalThis.Path2D = Path2DPolyfill as any
}

// ---------- Types ----------

export interface TextChunk {
  index: number
  text: string
  charStart: number
  charEnd: number
  tokenEstimate: number
}

export interface ProcessingResult {
  content: string
  chunks: TextChunk[]
  metadata: {
    totalChunks: number
    totalCharacters: number
    estimatedTokens: number
    extractionMethod: string
  }
}

// ---------- Text Extraction ----------

/**
 * Extract text from a PDF buffer using pdf-parse
 */
export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // Import the inner module to avoid pdf-parse's test file loading on import
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pdfParse = require('pdf-parse/lib/pdf-parse.js')
  const result = await pdfParse(buffer)
  return result.text || ''
}

/**
 * Extract text from a DOCX buffer using mammoth
 */
export async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value || ''
}

/**
 * Extract text from a plain text buffer
 */
export function extractTextFromTxt(buffer: Buffer): string {
  return buffer.toString('utf-8')
}

// ---------- Text Chunking ----------

const DEFAULT_CHUNK_SIZE = 1500    // ~375 tokens (4 chars ≈ 1 token)
const DEFAULT_CHUNK_OVERLAP = 200  // Overlap between chunks for context continuity

/**
 * Split text into overlapping chunks for RAG retrieval.
 *
 * Strategy:
 * 1. Try to break at paragraph boundaries
 * 2. Fall back to sentence boundaries
 * 3. Fall back to word boundaries
 * 4. Hard break at max chunk size
 */
export function chunkText(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_CHUNK_OVERLAP
): TextChunk[] {
  // Clean up the text
  const cleaned = text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim()

  if (!cleaned) return []

  // If text is small enough for a single chunk, return as-is
  if (cleaned.length <= chunkSize) {
    return [{
      index: 0,
      text: cleaned,
      charStart: 0,
      charEnd: cleaned.length,
      tokenEstimate: Math.ceil(cleaned.length / 4),
    }]
  }

  const chunks: TextChunk[] = []
  let position = 0

  while (position < cleaned.length) {
    // Calculate end position for this chunk
    let end = Math.min(position + chunkSize, cleaned.length)

    // If we're not at the end of the text, try to find a good break point
    if (end < cleaned.length) {
      // Look for paragraph break (double newline) within last 30% of chunk
      const searchStart = position + Math.floor(chunkSize * 0.7)
      const searchWindow = cleaned.substring(searchStart, end)

      const paragraphBreak = searchWindow.lastIndexOf('\n\n')
      if (paragraphBreak !== -1) {
        end = searchStart + paragraphBreak + 2
      } else {
        // Look for sentence break (. ! ?) followed by space or newline
        const sentenceBreak = searchWindow.search(/[.!?]\s(?=[A-Z])|[.!?]\n/g)
        if (sentenceBreak !== -1) {
          // Find the last sentence break in the window
          let lastSentenceBreak = -1
          const regex = /[.!?][\s\n]/g
          let match
          while ((match = regex.exec(searchWindow)) !== null) {
            lastSentenceBreak = match.index
          }
          if (lastSentenceBreak !== -1) {
            end = searchStart + lastSentenceBreak + 2
          }
        } else {
          // Fall back to word boundary
          const lastSpace = searchWindow.lastIndexOf(' ')
          if (lastSpace !== -1) {
            end = searchStart + lastSpace + 1
          }
          // Else hard break at chunkSize
        }
      }
    }

    const chunkText = cleaned.substring(position, end).trim()

    if (chunkText.length > 0) {
      chunks.push({
        index: chunks.length,
        text: chunkText,
        charStart: position,
        charEnd: end,
        tokenEstimate: Math.ceil(chunkText.length / 4),
      })
    }

    // Move position forward, accounting for overlap
    position = end - overlap

    // Prevent infinite loops — if we didn't advance, force forward
    if (position <= (chunks.length > 0 ? chunks[chunks.length - 1].charStart : -1)) {
      position = end
    }
  }

  return chunks
}

// ---------- Main Processor ----------

/**
 * Process a file: extract text and chunk it.
 * Returns the full content + chunks array ready for DB storage.
 */
export async function processFile(
  buffer: Buffer,
  fileType: string,
  mimeType: string
): Promise<ProcessingResult> {
  let content = ''
  let extractionMethod = ''

  switch (fileType) {
    case 'pdf':
      content = await extractTextFromPdf(buffer)
      extractionMethod = 'pdf-parse'
      break
    case 'doc':
      // mammoth handles both .doc and .docx
      content = await extractTextFromDocx(buffer)
      extractionMethod = 'mammoth'
      break
    case 'text':
      content = extractTextFromTxt(buffer)
      extractionMethod = 'plaintext'
      break
    default:
      throw new Error(`Unsupported file type: ${fileType}`)
  }

  // Truncate to 500k chars max to prevent DB bloat
  if (content.length > 500000) {
    content = content.substring(0, 500000)
  }

  const chunks = chunkText(content)

  return {
    content,
    chunks,
    metadata: {
      totalChunks: chunks.length,
      totalCharacters: content.length,
      estimatedTokens: Math.ceil(content.length / 4),
      extractionMethod,
    },
  }
}
