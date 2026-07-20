/**
 * Knowledge Base Search - Hybrid full-text + vector search
 * Extracted from web-agent/api/chat/route.ts (searchKnowledgeBase)
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { KnowledgeResult } from './types';

/**
 * Search the knowledge base using multiple strategies:
 * 1. Chunk-level full-text search via RPC (knowledge_base_chunks)
 * 2. ILIKE fallback on parent knowledge_base table
 * 3. Secondary tables (system_prompts, agents, conversation_states, etc.)
 */
export async function searchKnowledgeBase(
  supabase: SupabaseClient,
  query: string,
  limit: number = 3,
  filterCategory: string | null = null
): Promise<KnowledgeResult[]> {
  console.log('[kb-search] query:', query, filterCategory ? `(category=${filterCategory})` : '');
  try {
    const allResults: KnowledgeResult[] = [];
    // supabase.rpc() resolves { data, error } for a Postgres-level error - it
    // does NOT throw. A prior version of this function only handled the
    // thrown-exception case, so a returned RPC error silently produced zero
    // results and never reached the ILIKE fallback below. Track success
    // explicitly so both failure modes (thrown or returned) fall through.
    let rpcSucceeded = false;

    // 1. Chunk-level full-text search via RPC
    try {
      const { data: kbResults, error: kbError } = await supabase
        .rpc('search_knowledge_base', {
          query_text: query,
          match_limit: limit * 2,
          filter_category: filterCategory,
          filter_subcategory: null
        });

      if (kbError) {
        console.error('[KnowledgeSearch] RPC returned error, falling back to ILIKE:', kbError.message);
      } else if (kbResults && Array.isArray(kbResults)) {
        rpcSucceeded = true;
        kbResults.forEach((item: any) => {
          const content = item.content || item.answer || item.question || '';
          if (content.trim()) {
            allResults.push({
              id: item.id,
              content: `[${item.title || 'Knowledge Base'}] ${content.trim()}`,
              metadata: {
                table: 'knowledge_base',
                source_type: item.source_type,
                chunk_index: item.chunk_index,
                search_method: item.search_method,
                relevance: item.relevance || 0
              }
            });
          }
        });
      }
    } catch (kbError) {
      console.error('[KnowledgeSearch] RPC threw, falling back to ILIKE:', kbError);
    }

    if (!rpcSucceeded) {
      // 2. Fallback to ILIKE search on parent table - still respects the
      //    audience category filter so a broken RPC never leaks Scout
      //    content into a brand/owner reply or vice versa.
      try {
        let fallbackQuery = supabase
          .from('knowledge_base')
          .select('*')
          .eq('embeddings_status', 'ready')
          .ilike('content', `%${query}%`)
          .limit(limit * 2);
        if (filterCategory) {
          fallbackQuery = fallbackQuery.eq('category', filterCategory);
        }
        const { data: fallbackResults } = await fallbackQuery;

        if (fallbackResults && Array.isArray(fallbackResults)) {
          fallbackResults.forEach((item: any) => {
            const content = item.content || item.answer || item.question || item.title || '';
            if (content.trim()) {
              allResults.push({
                id: item.id,
                content: `[${item.title || 'Knowledge Base'}] ${content.trim().substring(0, 2000)}`,
                metadata: {
                  table: 'knowledge_base',
                  relevance: 0.5
                }
              });
            }
          });
        }
      } catch (fallbackError) {
        console.error('[KnowledgeSearch] ILIKE fallback also failed:', fallbackError);
      }
    }

    // 3. Search secondary tables
    const secondaryResults = await searchSecondaryTables(supabase, query);
    allResults.push(...secondaryResults);

    // Sort by priority: knowledge_base first, then by relevance
    const priorityOrder: Record<string, number> = {
      'knowledge_base': 4,
      'system_prompts': 3,
      'agents': 2,
      'conversation_states': 1,
      'cta_triggers': 1,
      'model_context': 0,
      'chatbot_responses': 1
    };

    const sortedResults = allResults.sort((a, b) => {
      const priorityDiff = (priorityOrder[b.metadata.table] || 0) - (priorityOrder[a.metadata.table] || 0);
      if (priorityDiff !== 0) return priorityDiff;
      return (b.metadata.relevance || 0) - (a.metadata.relevance || 0);
    });

    const hits = sortedResults.slice(0, limit * 3);
    console.log('[kb-search] hits:', hits.length, hits.map(h => ({ title: (h.content.match(/^\[([^\]]+)\]/) || [])[1] || '?', table: h.metadata?.table, relevance: h.metadata?.relevance })));
    const context = hits.map((doc, i) => `${i + 1}. ${doc.content}`).join('\n');
    console.log('[kb-search] context returned to prompt:', context.slice(0, 500));
    return hits;
  } catch (error) {
    console.error('[KnowledgeSearch] Error:', error);
    return [];
  }
}

/**
 * Search secondary tables (system_prompts, agents, etc.)
 */
async function searchSecondaryTables(
  supabase: SupabaseClient,
  query: string
): Promise<KnowledgeResult[]> {
  const results: KnowledgeResult[] = [];

  const searchTable = async (table: string, columns: string[], searchTerm: string, perColumnLimit: number = 2) => {
    const tableResults: any[] = [];
    for (const column of columns) {
      try {
        const result = await Promise.race([
          supabase.from(table)
            .select('*')
            .ilike(column, `%${searchTerm}%`)
            .limit(perColumnLimit),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]) as any;

        if (!result.error && result.data) {
          tableResults.push(...result.data);
        }
      } catch {
        // Continue with other columns
      }
    }
    return Array.from(new Map(tableResults.map((item: any) => [item.id, item])).values());
  };

  const queryPromises = [
    searchTable('system_prompts', ['content', 'title', 'description'], query, 2).catch(() => []),
    searchTable('agents', ['agent_name', 'what_it_does', 'pain_point_mapped_to'], query, 2).catch(() => []),
    searchTable('conversation_states', ['state_name', 'description', 'notes'], query, 2).catch(() => []),
    searchTable('cta_triggers', ['cta_text', 'trigger_condition', 'use_case'], query, 2).catch(() => []),
    searchTable('model_context', ['key', 'value', 'category'], query, 3).catch(() => []),
    searchTable('chatbot_responses', ['question', 'query', 'user_message', 'keywords'], query, 2).catch(() => [])
  ];

  const settled = await Promise.allSettled(queryPromises);
  const tableNames = ['system_prompts', 'agents', 'conversation_states', 'cta_triggers', 'model_context', 'chatbot_responses'];

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      result.value.forEach((item: any) => {
        let content = '';

        switch (tableNames[index]) {
          case 'system_prompts':
            content = `${item.title || item.prompt_type || 'System Prompt'}: ${item.content}`;
            break;
          case 'agents':
            content = `Agent: ${item.agent_name}\nWhat it does: ${item.what_it_does || ''}`;
            break;
          case 'conversation_states':
            content = `State: ${item.state_name} (${item.state_key})\n${item.description || ''}`;
            break;
          case 'cta_triggers':
            content = `CTA: ${item.cta_text}\nTrigger: ${item.trigger_condition}`;
            break;
          case 'model_context':
            content = `[${item.category}] ${item.key}: ${item.value}`;
            break;
          case 'chatbot_responses':
            content = item.response || item.answer || item.content || '';
            break;
        }

        if (content.trim()) {
          results.push({
            id: item.id,
            content: content.trim(),
            metadata: { table: tableNames[index] }
          });
        }
      });
    }
  });

  return results;
}
