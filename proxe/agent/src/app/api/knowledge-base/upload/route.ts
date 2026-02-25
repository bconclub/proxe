export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { processFile } from '@/lib/knowledgeProcessor'
import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/plain': 'text',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'doc',
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

// POST /api/knowledge-base/upload — Upload file (PDF, DOC, DOCX, TXT)
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    const fileType = ALLOWED_TYPES[file.type]
    if (!fileType) {
      return NextResponse.json(
        { error: `Unsupported file type: ${file.type}. Accepted: PDF, DOC, DOCX, TXT` },
        { status: 400 }
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
        { status: 400 }
      )
    }

    // Extract content and chunk the file
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let content: string | null = null
    let chunks: any[] = []
    let embeddings_status: 'pending' | 'ready' | 'error' = 'pending'
    let error_message: string | null = null
    let processingMetadata: any = {}

    try {
      const result = await processFile(buffer, fileType, file.type)
      content = result.content
      chunks = result.chunks
      processingMetadata = result.metadata

      // Mark as ready if we got meaningful content
      if (content && content.length > 50) {
        embeddings_status = 'ready'
      } else {
        embeddings_status = 'pending'
        error_message = 'Extracted content too short or empty'
      }
    } catch (processingError) {
      console.error('Error processing file:', processingError)
      // Still save the entry but mark as error
      embeddings_status = 'error'
      error_message = processingError instanceof Error
        ? processingError.message
        : 'Failed to extract content from file'
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from('knowledge_base')
      .insert({
        type: fileType as 'pdf' | 'doc' | 'text',
        title: file.name,
        content,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        chunks,
        embeddings_status,
        error_message,
        metadata: processingMetadata,
      })
      .select()
      .single()

    if (error) {
      console.error('Error inserting file entry:', error)
      return NextResponse.json(
        { error: 'Failed to save file entry', details: process.env.NODE_ENV === 'development' ? error.message : undefined },
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
    console.error('Error in knowledge base upload POST:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? errorMessage : undefined },
      { status: 500 }
    )
  }
}
