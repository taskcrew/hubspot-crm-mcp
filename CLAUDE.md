# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

MCP (Model Context Protocol) server for HubSpot CRM v3 API, deployed as a Vercel serverless function. Single-file implementation at `api/mcp.ts`.

## Commands

```bash
npm install          # Install dependencies
vercel dev           # Local development (runs on http://localhost:3000)
vercel --prod        # Deploy to production
```

## Architecture

### MCP Protocol Implementation

The server implements JSON-RPC 2.0 over HTTP POST at `/mcp` endpoint:

```
POST /mcp → vercel.json rewrite → /api/mcp.ts
```

**MCP Methods:**
- `initialize` - Returns server capabilities and version info
- `tools/list` - Returns available tool definitions (TOOLS array)
- `tools/call` - Executes a tool via `handleTool(name, args)`

### Tool Categories

| Category | Tools |
|----------|-------|
| Contacts | `list`, `get`, `create`, `update`, `delete`, `search` |
| Companies | `list`, `get`, `create`, `update`, `delete`, `search` |
| Properties | `contact_properties`, `company_properties` (schema discovery) |
| Owners | `list_owners`, `get_owner` |
| Engagements | `get_engagements`, `log_email`, `create_note` |
| Tasks | `create_task`, `search_tasks`, `update_task` |

### Response Optimization

Results are compacted by default to reduce token usage:
- `maxPropertyLength`: Truncates fields > 500 chars (set to 0 for full data)
- `includeMetadata`: Excludes `createdAt`, `updatedAt`, `archived`, `url` unless true
- `excludeCompanies`/`excludeJobTitles`: Client-side filtering for contacts

### Key Functions

- `hubspot(path, method, body)` - API wrapper with auth header injection
- `handleTool(name, args)` - Tool dispatch, returns MCP content format
- `compactResult(item, options)` - Truncates/filters single result
- `filterResults(results, options)` - Applies exclude filters

## Environment

```bash
HUBSPOT_ACCESS_TOKEN=pat-xxx   # Required - HubSpot private app token
```

Set in Vercel dashboard for production, `.env.local` for local dev.

## HubSpot API Patterns

All tools use HubSpot CRM v3 API (`https://api.hubapi.com/crm/v3/...`):
- List: `GET /objects/{type}?limit=&after=&properties=`
- Get: `GET /objects/{type}/{id}?properties=`
- Create: `POST /objects/{type}` with `{ properties: {...} }`
- Update: `PATCH /objects/{type}/{id}` with `{ properties: {...} }`
- Delete: `DELETE /objects/{type}/{id}`
- Search: `POST /objects/{type}/search` with `{ query, filterGroups, properties, sorts, limit }`

Engagements use associations API: `GET /crm/v4/objects/contacts/{id}/associations/{type}`
