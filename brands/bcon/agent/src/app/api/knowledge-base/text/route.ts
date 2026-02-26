export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { chunkText } from '@/lib/knowledgeProcessor'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/knowledge-base/text — Add manual text entry
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, content, question, answer, category, subcategory, tags } = body

    // Support both formats: simple text (title+content) and Q&A (question+answer)
    const effectiveTitle = (question || title || '').trim()
    const effectiveContent = (answer || content || '').trim()

    if (!effectiveTitle) {
      return NextResponse.json({ error: 'Title or question is required' }, { status: 400 })
    }
    if (!effectiveContent) {
      return NextResponse.json({ error: 'Content or answer is required' }, { status: 400 })
    }

    // For search, combine question + answer as the full content
    const searchableContent = question && answer
      ? `${effectiveTitle}\n\n${effectiveContent}`
      : effectiveContent

    const chunks = chunkText(searchableContent)

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('knowledge_base')
      .insert({
        type: 'text' as const,
        title: effectiveTitle,
        content: searchableContent,
        question: question?.trim() || null,
        answer: answer?.trim() || null,
        category: category?.trim() || null,
        subcategory: subcategory?.trim() || null,
        tags: Array.isArray(tags) ? tags : [],
        chunks,
        embeddings_status: 'ready' as const,
        metadata: {
          totalChunks: chunks.length,
          totalCharacters: searchableContent.length,
          estimatedTokens: Math.ceil(searchableContent.length / 4),
          extractionMethod: 'manual',
        },
      })
      .select()
      .single()

    if (error) {
      console.error('Error inserting text entry:', error)
      return NextResponse.json(
        { error: 'Failed to save text entry', details: process.env.NODE_ENV === 'development' ? error.message : undefined },
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
    console.error('Error in knowledge base text POST:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? errorMessage : undefined },
      { status: 500 }
    )
  }
}
