# HubSpot CRM MCP Server

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Ftaskcrew%2Fhubspot-crm-mcp&env=HUBSPOT_ACCESS_TOKEN)

MCP server that gives Claude Code and Claude Cowork full access to your HubSpot CRM. Deploy to Vercel in one click, add to your MCP config, and start managing contacts, companies, deals, and more through natural language.

## Quick Start

### 1. Deploy to Vercel

Click the button above, or:

```bash
git clone https://github.com/taskcrew/hubspot-crm-mcp
cd hubspot-crm-mcp
vercel --prod
```

### 2. Get HubSpot Token

Create a [HubSpot private app](https://developers.hubspot.com/docs/api/private-apps) with these scopes:

| Scope | Required For |
|-------|--------------|
| `crm.objects.contacts.read` | Contacts, engagements, tasks, notes |
| `crm.objects.contacts.write` | Creating/updating contacts, tasks, notes |
| `crm.objects.companies.read` | Reading companies |
| `crm.objects.companies.write` | Creating/updating/deleting companies |
| `crm.objects.deals.read` | Reading deals and pipelines |
| `crm.objects.deals.write` | Creating/updating deals |
| `crm.objects.owners.read` | Listing owners |
| `crm.lists.read` | Reading contact lists |
| `crm.lists.write` | Creating/updating/managing lists |
| `sales-email-read` | Reading email engagement history |

Add the token to Vercel: Project Settings → Environment Variables → `HUBSPOT_ACCESS_TOKEN`

### 3. Configure Your MCP Client

**Claude Code** - Add to `.mcp.json` (project) or `~/.claude/mcp.json` (global):

```json
{
  "mcpServers": {
    "hubspot-crm": {
      "url": "https://your-deployment.vercel.app/mcp"
    }
  }
}
```

Restart Claude Code or run `/mcp` to connect.

**Claude Desktop** - Edit `claude_desktop_config.json` ([location](https://modelcontextprotocol.io/docs/develop/connect-local-servers)):

```json
{
  "mcpServers": {
    "hubspot-crm": {
      "command": "npx",
      "args": ["mcp-remote", "https://your-deployment.vercel.app/mcp"]
    }
  }
}
```

Restart Claude Desktop to connect.

## Features

- **Contacts**: List, get, create, update, delete, search contacts
- **Companies**: List, get, create, update, delete, search companies
- **Deals**: List, get, create, update, delete, search deals with pipeline/stage management
- **Tasks**: Get, create, update, delete, search tasks (follow-up reminders)
- **Engagements**: Get engagement history, log emails/calls/meetings, create notes
- **Lists**: Create and manage static/dynamic lists for marketing automation
- **Associations**: Get, create, delete links between objects (contacts↔companies↔deals)
- **Owners**: List and get HubSpot users
- **Properties**: Discover available contact/company/deal properties
- **Pipelines**: List deal pipelines and stages

### Response Optimization

Results are compacted by default to reduce token usage:
- Long text fields truncated at 500 chars
- Metadata fields excluded unless requested
- Client-side filtering for contacts by company/job title

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
| `hubspot_log_call` | Log a call with a contact |
| `hubspot_log_meeting` | Log a meeting with a contact |
| `hubspot_delete_call` | Delete a call record |
| `hubspot_delete_meeting` | Delete a meeting record |
| `hubspot_create_note` | Create note on contact |
| `hubspot_get_task` | Get task by ID |
| `hubspot_create_task` | Create task linked to contact |
| `hubspot_search_tasks` | Search tasks by owner/status/date |
| `hubspot_update_task` | Update task (mark complete, etc.) |
| `hubspot_delete_task` | Delete a task |
| `hubspot_list_deals` | List deals with pagination |
| `hubspot_get_deal` | Get deal by ID |
| `hubspot_create_deal` | Create deal with contact/company associations |
| `hubspot_update_deal` | Update deal properties |
| `hubspot_search_deals` | Search deals by owner/stage/pipeline/amount |
| `hubspot_delete_deal` | Delete a deal |
| `hubspot_deal_properties` | List deal property schema |
| `hubspot_list_pipelines` | List deal pipelines and stages |
| `hubspot_get_associations` | Get associations for a record |
| `hubspot_create_association` | Create association between objects |
| `hubspot_delete_association` | Remove association between objects |
| `hubspot_list_lists` | List all contact lists (static/dynamic) |
| `hubspot_get_list` | Get list details by ID |
| `hubspot_create_list` | Create static or dynamic list |
| `hubspot_update_list` | Update list name or filters |
| `hubspot_delete_list` | Delete a list |
| `hubspot_get_list_memberships` | Get contacts in a list |
| `hubspot_add_to_list` | Add contacts to static list |
| `hubspot_remove_from_list` | Remove contacts from static list |
| `hubspot_search_lists` | Search lists by name |

## Development

For local testing:

```bash
npm install
echo "HUBSPOT_ACCESS_TOKEN=pat-xxx" > .env.local
vercel dev
```

Server runs at `http://localhost:3000/mcp`

## License

MIT
