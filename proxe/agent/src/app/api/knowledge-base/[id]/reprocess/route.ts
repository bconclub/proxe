export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/knowledge-base/[id]/reprocess — Reprocess a pending/error item
// For items that were uploaded before content extraction was available
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    if (!id) {
      return NextResponse.json({ error: 'ID is required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Fetch the existing item
    const { data: item, error: fetchError } = await supabase
      .from('knowledge_base')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    // Only reprocess items that need it
    if (item.embeddings_status === 'ready' && item.chunks && (item.chunks as any[]).length > 0) {
      return NextResponse.json({ data: item, message: 'Item already processed' })
    }

    // Mark as processing
    await supabase
      .from('knowledge_base')
      .update({ embeddings_status: 'processing' })
      .eq('id', id)

    // If the item already has content, just re-chunk it
    if (item.content && item.content.length > 50) {
      const { chunkText } = await import('@/lib/knowledgeProcessor')
      const chunks = chunkText(item.content)

      const { data: updated, error: updateError } = await supabase
        .from('knowledge_base')
        .update({
          chunks,
          embeddings_status: 'ready',
          error_message: null,
          metadata: {
            ...(typeof item.metadata === 'object' && item.metadata ? item.metadata : {}),
            totalChunks: chunks.length,
            totalCharacters: item.content.length,
            estimatedTokens: Math.ceil(item.content.length / 4),
            reprocessedAt: new Date().toISOString(),
          },
        })
        .eq('id', id)
        .select()
        .single()

      if (updateError) {
        throw updateError
      }

      // Replace chunk rows in knowledge_base_chunks
      await supabase
        .from('knowledge_base_chunks')
        .delete()
        .eq('knowledge_base_id', id)

      if (chunks.length > 0) {
        const chunkRows = chunks.map((chunk: any, i: number) => ({
          knowledge_base_id: id,
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

      return NextResponse.json({ data: updated, message: 'Reprocessed successfully' })
    }

    // Item has no content — cannot reprocess without the original file
    const { data: updated } = await supabase
      .from('knowledge_base')
      .update({
        embeddings_status: 'error',
        error_message: 'No content available. Please delete and re-upload the file.',
      })
      .eq('id', id)
      .select()
      .single()

    return NextResponse.json(
      { data: updated, message: 'Cannot reprocess — no content stored. Please re-upload.' },
      { status: 422 }
    )
  } catch (error) {
    console.error('Error in knowledge base reprocess:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? errorMessage : undefined },
      { status: 500 }
    )
  }
}
