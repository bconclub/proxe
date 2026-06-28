export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      dashboard_users: {
        Row: {
          id: string
          email: string
          full_name: string | null
          role: 'admin' | 'viewer'
          created_at: string
          updated_at: string
          last_login: string | null
          is_active: boolean
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          role?: 'admin' | 'viewer'
          created_at?: string
          updated_at?: string
          last_login?: string | null
          is_active?: boolean
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          role?: 'admin' | 'viewer'
          created_at?: string
          updated_at?: string
          last_login?: string | null
          is_active?: boolean
        }
      }
      user_invitations: {
        Row: {
          id: string
          email: string
          token: string
          role: 'admin' | 'viewer'
          invited_by: string | null
          expires_at: string
          accepted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          email: string
          token: string
          role?: 'admin' | 'viewer'
          invited_by?: string | null
          expires_at: string
          accepted_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          token?: string
          role?: 'admin' | 'viewer'
          invited_by?: string | null
          expires_at?: string
          accepted_at?: string | null
          created_at?: string
        }
      }
      dashboard_settings: {
        Row: {
          id: string
          key: string
          value: Json
          description: string | null
          updated_by: string | null
          updated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          key: string
          value: Json
          description?: string | null
          updated_by?: string | null
          updated_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          key?: string
          value?: Json
          description?: string | null
          updated_by?: string | null
          updated_at?: string
          created_at?: string
        }
      }
      sessions: {
        Row: {
          id: string
          external_session_id: string
          user_name: string | null
          email: string | null
          phone: string | null
          website_url: string | null
          conversation_summary: string | null
          last_message_at: string | null
          user_inputs_summary: Json
          message_count: number
          booking_date: string | null
          booking_time: string | null
          booking_status: 'pending' | 'confirmed' | 'cancelled' | null
          google_event_id: string | null
          booking_created_at: string | null
          brand: 'proxe'
          channel: 'web' | 'whatsapp' | 'voice' | 'social'
          channel_data: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          external_session_id: string
          user_name?: string | null
          email?: string | null
          phone?: string | null
          website_url?: string | null
          conversation_summary?: string | null
          last_message_at?: string | null
          user_inputs_summary?: Json
          message_count?: number
          booking_date?: string | null
          booking_time?: string | null
          booking_status?: 'pending' | 'confirmed' | 'cancelled' | null
          google_event_id?: string | null
          booking_created_at?: string | null
          brand?: 'proxe'
          channel: 'web' | 'whatsapp' | 'voice' | 'social'
          channel_data?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          external_session_id?: string
          user_name?: string | null
          email?: string | null
          phone?: string | null
          website_url?: string | null
          conversation_summary?: string | null
          last_message_at?: string | null
          user_inputs_summary?: Json
          message_count?: number
          booking_date?: string | null
          booking_time?: string | null
          booking_status?: 'pending' | 'confirmed' | 'cancelled' | null
          google_event_id?: string | null
          booking_created_at?: string | null
          brand?: 'proxe'
          channel?: 'web' | 'whatsapp' | 'voice' | 'social'
          channel_data?: Json
          created_at?: string
          updated_at?: string
        }
      }
      web_sessions: {
        Row: {
          id: string
          session_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      whatsapp_sessions: {
        Row: {
          id: string
          session_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      voice_sessions: {
        Row: {
          id: string
          session_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      social_sessions: {
        Row: {
          id: string
          session_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          session_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          session_id?: string
          created_at?: string
          updated_at?: string
        }
      }
      unified_leads: {
        Row: {
          id: string
          name: string | null
          email: string | null
          phone: string | null
          source: string | null
          timestamp: string
          status: string | null
          booking_date: string | null
          booking_time: string | null
          lead_type: string
          metadata: Json | null
        }
      }
      knowledge_base_chunks: {
        Row: {
          id: string
          knowledge_base_id: string
          brand: string
          chunk_index: number
          content: string
          char_start: number | null
          char_end: number | null
          token_estimate: number | null
          embedding: number[] | null
          fts_vector: string | null
          created_at: string
        }
        Insert: {
          id?: string
          knowledge_base_id: string
          brand?: string
          chunk_index: number
          content: string
          char_start?: number | null
          char_end?: number | null
          token_estimate?: number | null
          embedding?: number[] | null
          created_at?: string
        }
        Update: {
          id?: string
          knowledge_base_id?: string
          brand?: string
          chunk_index?: number
          content?: string
          char_start?: number | null
          char_end?: number | null
          token_estimate?: number | null
          embedding?: number[] | null
          created_at?: string
        }
      }
      knowledge_base: {
        Row: {
          id: string
          brand: string
          type: 'pdf' | 'doc' | 'url' | 'text'
          title: string
          source_url: string | null
          content: string | null
          file_name: string | null
          file_size: number | null
          file_type: string | null
          chunks: Json
          embeddings_status: 'pending' | 'processing' | 'ready' | 'error'
          error_message: string | null
          metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          brand?: string
          type: 'pdf' | 'doc' | 'url' | 'text'
          title: string
          source_url?: string | null
          content?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          chunks?: Json
          embeddings_status?: 'pending' | 'processing' | 'ready' | 'error'
          error_message?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          brand?: string
          type?: 'pdf' | 'doc' | 'url' | 'text'
          title?: string
          source_url?: string | null
          content?: string | null
          file_name?: string | null
          file_size?: number | null
          file_type?: string | null
          chunks?: Json
          embeddings_status?: 'pending' | 'processing' | 'ready' | 'error'
          error_message?: string | null
          metadata?: Json
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      unified_leads: {
        Row: {
          id: string
          name: string | null
          email: string | null
          phone: string | null
          source: string | null
          timestamp: string
          status: string | null
          booking_date: string | null
          booking_time: string | null
          lead_type: string
          metadata: Json | null
        }
      }
    }
  }
}


