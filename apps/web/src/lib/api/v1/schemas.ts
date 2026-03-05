import { z } from 'zod';

// ==========================================
// API Keys
// ==========================================

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).min(1).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

// ==========================================
// Templates
// ==========================================

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  style: z.record(z.unknown()),
  category: z.enum(['minimal', 'cinematic', 'bold', 'modern', 'custom']).optional(),
  isPublic: z.boolean().optional(),
});

export const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  style: z.record(z.unknown()).optional(),
  category: z.enum(['minimal', 'cinematic', 'bold', 'modern', 'custom']).optional(),
  isPublic: z.boolean().optional(),
});

// ==========================================
// User Preferences
// ==========================================

export const updatePreferencesSchema = z.object({
  brandPreset: z.object({
    highlightColor: z.string().max(20).optional(),
    backgroundColor: z.string().max(20).optional(),
    captionPreset: z.string().max(50).optional(),
  }).optional(),
  defaultLayout: z.enum(['fullscreen', 'split-screen', 'picture-in-picture']).optional(),
  defaultTtsProvider: z.enum(['edge-tts', 'elevenlabs', 'openai']).optional(),
  defaultTtsVoice: z.string().max(100).optional(),
  defaultTtsLanguage: z.string().max(10).optional(),
  defaultVideoStyle: z.enum(['dynamic', 'calm', 'cinematic', 'educational']).optional(),
});

// ==========================================
// Pagination
// ==========================================

export const paginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
