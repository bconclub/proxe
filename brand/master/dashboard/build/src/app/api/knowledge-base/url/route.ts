export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { chunkText } from '@/lib/knowledgeProcessor'
import { NextRequest, NextResponse } from 'next/server'

// Basic HTML tag stripping for content extraction
function stripHtmlTags(html: string): string {
  // Remove script and style blocks entirely
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, ' ')
  // Decode common HTML entities
  text = text.replace(/&nbsp;/g, ' ')
  text = text.replace(/&amp;/g, '&')
  text = text.replace(/&lt;/g, '<')
  text = text.replace(/&gt;/g, '>')
  text = text.replace(/&quot;/g, '"')
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim()
  return text
}

// POST /api/knowledge-base/url — Add URL entry with basic scraping
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { url, title } = body

    if (!url || !url.trim()) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Basic URL validation
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url.trim())
    } catch {
      return NextResponse.json({ error: 'Invalid URL format' }, { status: 400 })
    }

    // Auto-generate title from hostname if not provided
    const itemTitle = title?.trim() || parsedUrl.hostname

    // Attempt basic content fetch
    let content: string | null = null
    let chunks: any[] = []
    let status: 'pending' | 'ready' | 'error' = 'pending'
    let errorMessage: string | null = null

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

      const response = await fetch(parsedUrl.toString(), {
        signal: controller.signal,
        headers: {
          'User-Agent': 'PROXe-Bot/1.0',
        },
      })
      clearTimeout(timeoutId)

      if (response.ok) {
        const contentType = response.headers.get('content-type') || ''
        if (contentType.includes('text/html') || contentType.includes('text/plain')) {
          const html = await response.text()
          content = stripHtmlTags(html)
          // Truncate to 500k chars
          if (content.length > 500000) {
            content = content.substring(0, 500000)
          }
          if (content.length > 50) {
            chunks = chunkText(content)
            status = 'ready'
          } else {
            status = 'pending'
          }
        }
      } else {
        errorMessage = `Fetch returned status ${response.status}`
        status = 'pending'
      }
    } catch (fetchError) {
      // Fetch failed — still save the entry as pending
      console.warn('URL fetch failed (will retry later):', fetchError instanceof Error ? fetchError.message : fetchError)
      errorMessage = fetchError instanceof Error ? fetchError.message : 'Fetch failed'
      status = 'pending'
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('knowledge_base')
      .insert({
        type: 'url' as const,
        title: itemTitle,
        source_url: parsedUrl.toString(),
        content,
        chunks,
        embeddings_status: status,
        error_message: errorMessage,
        metadata: {
          totalChunks: chunks.length,
          totalCharacters: content?.length || 0,
          estimatedTokens: content ? Math.ceil(content.length / 4) : 0,
          extractionMethod: 'url-scrape',
        },
      })
      .select()
      .single()

    if (error) {
      console.error('Error inserting URL entry:', error)
      return NextResponse.json(
        { error: 'Failed to save URL entry', details: process.env.NODE_ENV === 'development' ? error.message : undefined },
        { status: 500 }
      )
    }

    // Insert individual chunk rows for searchable RAG retrieval
    if (data && chunks.length > 0) {
      const chunkRows = chunks.map((chunk: any, i: number) => ({
        knowledge_base_id: data.id,
        chunk_index: chunk.index ?? i,
        content: chunk.text,
        char_start: chunk.charStart ?? null,
        char_end: chunk.charEnd ?? null,
        token_estimate: chunk.tokenEstimate ?? null,
      }))

      const { error: chunksError } = await supabase
        .from('knowledge_base_chunks')
        .insert(chunkRows)

      if (chunksError) {
        console.error('Error inserting chunks (non-fatal):', chunksError)
      }
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error in knowledge base url POST:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? errorMessage : undefined },
      { status: 500 }
    )
  }
}
