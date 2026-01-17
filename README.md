# HubSpot CRM MCP Server

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftaskcrew%2Fhubspot-crm-mcp&env=HUBSPOT_ACCESS_TOKEN)

MCP (Model Context Protocol) server for HubSpot CRM, deployed as a Vercel serverless function.

## Features

- **Contacts**: List, get, create, update, delete, search contacts
- **Companies**: List, get, create, update, delete, search companies
- **Deals**: Get, create, update, delete, search deals with pipeline/stage management
- **Tasks**: Create, search, update tasks (follow-up reminders)
- **Engagements**: Get engagement history, log emails, create notes
- **Owners**: List and get HubSpot users
- **Properties**: Discover available contact/company/deal properties
- **Pipelines**: List deal pipelines and stages

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
| `hubspot_get_deal` | Get deal by ID |
| `hubspot_create_deal` | Create deal with contact/company associations |
| `hubspot_update_deal` | Update deal properties |
| `hubspot_search_deals` | Search deals by owner/stage/pipeline/amount |
| `hubspot_delete_deal` | Delete a deal |
| `hubspot_deal_properties` | List deal property schema |
| `hubspot_list_pipelines` | List deal pipelines and stages |

## Required HubSpot Scopes

Your HubSpot private app needs the following scopes:

| Scope | Required For |
|-------|--------------|
| `crm.objects.contacts.read` | Contacts, engagements, tasks, notes |
| `crm.objects.contacts.write` | Creating/updating contacts, tasks, notes |
| `crm.objects.companies.read` | Reading companies |
| `crm.objects.companies.write` | Creating/updating/deleting companies |
| `crm.objects.deals.read` | Reading deals and pipelines |
| `crm.objects.deals.write` | Creating/updating deals |
| `crm.objects.owners.read` | Listing owners |
| `sales-email-read` | Reading email engagement history |

Note: Tasks and notes use the CRM v3 objects API and typically work with contacts scopes. If you encounter permission errors, check [HubSpot's scope documentation](https://developers.hubspot.com/docs/api/scopes) for your specific tier.

## License

MIT
