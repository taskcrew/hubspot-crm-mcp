# HubSpot CRM MCP Server

MCP (Model Context Protocol) server for HubSpot CRM, deployed as a Vercel serverless function.

## Features

- **Contacts**: List, get, create, update, delete, search contacts
- **Companies**: List, get, create, update, delete, search companies
- **Tasks**: Create, search, update tasks (follow-up reminders)
- **Engagements**: Get engagement history, log emails, create notes
- **Owners**: List and get HubSpot users
- **Properties**: Discover available contact/company properties

### Response Optimization

Results are compacted by default to reduce token usage:
- Long text fields truncated at 500 chars
- Metadata fields excluded unless requested
- Client-side filtering for contacts by company/job title

## Setup

### Prerequisites

- Node.js 18+
- Vercel CLI (`npm i -g vercel`)
- HubSpot private app token with CRM scopes

### Installation

```bash
npm install
```

### Environment Variables

Create `.env.local` for local development:

```
HUBSPOT_ACCESS_TOKEN=pat-xxx
```

For production, set in Vercel dashboard.

### Development

```bash
vercel dev
```

Server runs at `http://localhost:3000/mcp`

### Deployment

```bash
vercel --prod
```

## MCP Configuration

Add to your MCP client config (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "hubspot-crm": {
      "url": "https://your-deployment.vercel.app/mcp"
    }
  }
}
```

## Available Tools

| Tool | Description |
|------|-------------|
| `hubspot_list_contacts` | List contacts with pagination |
| `hubspot_get_contact` | Get contact by ID |
| `hubspot_create_contact` | Create new contact |
| `hubspot_update_contact` | Update contact properties |
| `hubspot_delete_contact` | Delete contact |
| `hubspot_search_contacts` | Search with filters |
| `hubspot_list_companies` | List companies with pagination |
| `hubspot_get_company` | Get company by ID |
| `hubspot_create_company` | Create new company |
| `hubspot_update_company` | Update company properties |
| `hubspot_delete_company` | Delete company |
| `hubspot_search_companies` | Search with filters |
| `hubspot_contact_properties` | List contact property schema |
| `hubspot_company_properties` | List company property schema |
| `hubspot_list_owners` | List HubSpot users |
| `hubspot_get_owner` | Get owner by ID |
| `hubspot_get_engagements` | Get contact engagement history |
| `hubspot_log_email` | Log email to contact timeline |
| `hubspot_create_note` | Create note on contact |
| `hubspot_create_task` | Create task linked to contact |
| `hubspot_search_tasks` | Search tasks by owner/status/date |
| `hubspot_update_task` | Update task (mark complete, etc.) |

## License

Private - Duvo/Taskcrew
