/**
 * Brand Configuration Template
 * 
 * This file defines brand-specific configuration values.
 * Copy this to brand/[brand]/build/config/brand.config.ts and customize.
 */

export interface BrandConfig {
  // Brand Identity
  name: string
  displayName: string
  domain: string
  
  // Supabase Configuration
  supabase: {
    urlEnvVar: string
    keyEnvVar: string
    serviceKeyEnvVar?: string
  }
  
  // Port Configuration
  port: {
    dev: number
    prod: number
  }
  
  // Navigation & Links
  navigation: {
    docs?: string | null
    support?: string | null
    webAgent?: boolean
    status?: boolean
  }
  
  // Feature Flags
  features: {
    // Development/Testing
    debugAuth?: boolean
    diagnostics?: boolean
    testConnection?: boolean
    testScoring?: boolean
    
    // Production Features
    buildInfo?: boolean
    healthCheck?: boolean
    errorLogs?: boolean
    widgetEmbed?: boolean
    webAgentSettings?: boolean
  }
  
  // Theme/Branding
  theme: {
    primaryColor: string
    accentColor: string
    logo?: string
  }
  
  // AI Prompts (paths to brand-specific prompt files)
  prompts: {
    claudeService?: string
    systemPrompt?: string
    summaryPrompt?: string
  }
}

// Example: PROXe Configuration
export const proxeConfig: BrandConfig = {
  name: 'PROXe',
  displayName: 'PROXe',
  domain: 'goproxe.com',
  supabase: {
    urlEnvVar: 'NEXT_PUBLIC_PROXE_SUPABASE_URL',
    keyEnvVar: 'NEXT_PUBLIC_PROXE_SUPABASE_ANON_KEY',
    serviceKeyEnvVar: 'PROXE_SUPABASE_SERVICE_ROLE_KEY',
  },
  port: {
    dev: 4000,
    prod: 4000,
  },
  navigation: {
    docs: 'https://docs.goproxe.com',
    support: 'https://support.goproxe.com',
    webAgent: false,
    status: false,
  },
  features: {
    debugAuth: true,
    diagnostics: true,
    testConnection: true,
    testScoring: true,
    buildInfo: false,
    healthCheck: false,
    errorLogs: false,
    widgetEmbed: false,
    webAgentSettings: false,
  },
  theme: {
    primaryColor: '#8B5CF6',
    accentColor: '#A78BFA',
  },
  prompts: {
    claudeService: './config/prompts/claude-prompt.js',
    systemPrompt: './config/prompts/system-prompt.ts',
  },
}

// Example: Windchasers Configuration
export const windchasersConfig: BrandConfig = {
  name: 'Windchasers',
  displayName: 'Windchasers',
  domain: 'windchasers.in',
  supabase: {
    urlEnvVar: 'NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL',
    keyEnvVar: 'NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY',
    serviceKeyEnvVar: 'WINDCHASERS_SUPABASE_SERVICE_KEY',
  },
  port: {
    dev: 4001,
    prod: 3003,
  },
  navigation: {
    docs: null,
    support: null,
    webAgent: true,
    status: true,
  },
  features: {
    debugAuth: false,
    diagnostics: false,
    testConnection: false,
    testScoring: false,
    buildInfo: true,
    healthCheck: true,
    errorLogs: true,
    widgetEmbed: true,
    webAgentSettings: true,
  },
  theme: {
    primaryColor: '#D4AF37',
    accentColor: '#C9A961',
  },
  prompts: {
    claudeService: './config/prompts/claude-prompt.js',
    systemPrompt: './config/prompts/system-prompt.ts',
  },
}
