import { VercelRequest, VercelResponse } from '@vercel/node';

const HUBSPOT_API = 'https://api.hubapi.com';
const MCP_VERSION = '2024-11-05';
const SERVER_NAME = 'hubspot-crm-mcp';
const SERVER_VERSION = '1.3.0';

// Response optimization defaults
const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_MAX_PROPERTY_LENGTH = 500; // Truncate long text fields

// Filter results by excluding companies or job titles (case-insensitive partial match)
function filterResults(
  results: Record<string, unknown>[],
  options: { excludeCompanies?: string[]; excludeJobTitles?: string[] }
): { results: Record<string, unknown>[]; excluded: number } {
  const { excludeCompanies = [], excludeJobTitles = [] } = options;

  if (excludeCompanies.length === 0 && excludeJobTitles.length === 0) {
    return { results, excluded: 0 };
  }

  const excludeCompaniesLower = excludeCompanies.map(c => c.toLowerCase());
  const excludeJobTitlesLower = excludeJobTitles.map(j => j.toLowerCase());

  const filtered = results.filter(item => {
    const props = item.properties as Record<string, unknown> | undefined;
    if (!props) return true;

    // Check company exclusion (partial match)
    const company = String(props.company || '').toLowerCase();
    if (company && excludeCompaniesLower.some(exc => company.includes(exc))) {
      return false;
    }

    // Check job title exclusion (partial match)
    const jobtitle = String(props.jobtitle || '').toLowerCase();
    if (jobtitle && excludeJobTitlesLower.some(exc => jobtitle.includes(exc))) {
      return false;
    }

    return true;
  });

  return { results: filtered, excluded: results.length - filtered.length };
}

// Truncate long string values in properties
function truncateProperties(obj: Record<string, unknown>, maxLength: number): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && value.length > maxLength) {
      result[key] = value.substring(0, maxLength) + '...[truncated]';
    } else {
      result[key] = value;
    }
  }
  return result;
}

// Compact a HubSpot result object - remove metadata, truncate long fields
function compactResult(
  item: Record<string, unknown>,
  options: { maxPropertyLength?: number; includeMetadata?: boolean } = {}
): Record<string, unknown> {
  const { maxPropertyLength = DEFAULT_MAX_PROPERTY_LENGTH, includeMetadata = false } = options;

  const result: Record<string, unknown> = {
    id: item.id,
  };

  if (item.properties && typeof item.properties === 'object') {
    result.properties = truncateProperties(item.properties as Record<string, unknown>, maxPropertyLength);
  }

  if (includeMetadata) {
    if (item.createdAt) result.createdAt = item.createdAt;
    if (item.updatedAt) result.updatedAt = item.updatedAt;
    if (item.archived !== undefined) result.archived = item.archived;
    if (item.url) result.url = item.url;
  }

  return result;
}

// Compact an array of results
function compactResults(
  data: { results: Record<string, unknown>[]; total?: number; paging?: unknown },
  options: { maxPropertyLength?: number; includeMetadata?: boolean } = {}
): { results: Record<string, unknown>[]; total?: number; paging?: unknown } {
  return {
    total: data.total,
    results: data.results.map(item => compactResult(item, options)),
    paging: data.paging,
  };
}

// HubSpot API helper
async function hubspot(path: string, method = 'GET', body?: object): Promise<unknown> {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) throw new Error('HUBSPOT_ACCESS_TOKEN not configured');

  const res = await fetch(`${HUBSPOT_API}${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`HubSpot API ${res.status}: ${error}`);
  }

  return method === 'DELETE' ? { success: true } : res.json();
}

// Tool definitions
const TOOLS = [
  // Contacts
  {
    name: 'hubspot_list_contacts',
    description: 'List contacts from HubSpot CRM with pagination. Results are compacted by default (truncated at 500 chars, no metadata). Use excludeCompanies/excludeJobTitles to filter out specific contacts.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (1-100)', default: 20 },
        after: { type: 'string', description: 'Pagination cursor' },
        properties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Properties to return (e.g., email, firstname, lastname)',
        },
        excludeCompanies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Exclude contacts from these companies (case-insensitive partial match). Example: ["Rohlik", "Albert", "Picnic"] to exclude existing clients.',
        },
        excludeJobTitles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Exclude contacts with these job titles (case-insensitive partial match). Example: ["CEO", "Chief Executive"] to exclude C-level roles.',
        },
        maxPropertyLength: { type: 'number', description: 'Max chars per property value before truncation (default: 500, use 0 for no truncation)', default: 500 },
        includeMetadata: { type: 'boolean', description: 'Include createdAt, updatedAt, archived, url fields (default: false)', default: false },
      },
    },
  },
  {
    name: 'hubspot_get_contact',
    description: 'Get a single contact by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Contact ID' },
        properties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Properties to return',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'hubspot_create_contact',
    description: 'Create a new contact',
    inputSchema: {
      type: 'object',
      properties: {
        properties: {
          type: 'object',
          description: 'Contact properties (email, firstname, lastname, phone, etc.)',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['properties'],
    },
  },
  {
    name: 'hubspot_update_contact',
    description: 'Update an existing contact',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Contact ID' },
        properties: {
          type: 'object',
          description: 'Properties to update',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['id', 'properties'],
    },
  },
  {
    name: 'hubspot_delete_contact',
    description: 'Delete a contact',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Contact ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'hubspot_search_contacts',
    description: 'Search contacts with filters. Filters within a group are ANDed, groups are ORed. Results are compacted by default (truncated at 500 chars, no metadata). Use excludeCompanies to filter out contacts from specific companies (e.g., existing clients). Use excludeJobTitles to filter out certain roles (e.g., ["CEO"] to exclude C-level executives).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search query' },
        filterGroups: {
          type: 'array',
          description: 'Filter groups for advanced search',
          items: {
            type: 'object',
            properties: {
              filters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    propertyName: { type: 'string' },
                    operator: {
                      type: 'string',
                      enum: ['EQ', 'NEQ', 'LT', 'LTE', 'GT', 'GTE', 'CONTAINS_TOKEN', 'NOT_CONTAINS_TOKEN', 'HAS_PROPERTY', 'NOT_HAS_PROPERTY'],
                    },
                    value: { type: 'string' },
                  },
                  required: ['propertyName', 'operator'],
                },
              },
            },
          },
        },
        properties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Properties to return',
        },
        sorts: {
          type: 'array',
          description: 'Sort results by property. Example: [{propertyName: "createdate", direction: "DESCENDING"}]',
          items: {
            type: 'object',
            properties: {
              propertyName: { type: 'string', description: 'Property to sort by' },
              direction: { type: 'string', enum: ['ASCENDING', 'DESCENDING'], description: 'Sort direction' },
            },
            required: ['propertyName', 'direction'],
          },
        },
        limit: { type: 'number', description: 'Max results (1-100)', default: 20 },
        excludeCompanies: {
          type: 'array',
          items: { type: 'string' },
          description: 'Exclude contacts from these companies (case-insensitive partial match). Example: ["Rohlik", "Albert", "Picnic"] to exclude existing clients.',
        },
        excludeJobTitles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Exclude contacts with these job titles (case-insensitive partial match). Example: ["CEO", "Chief Executive"] to exclude C-level roles.',
        },
        maxPropertyLength: { type: 'number', description: 'Max chars per property value before truncation (default: 500, use 0 for no truncation)', default: 500 },
        includeMetadata: { type: 'boolean', description: 'Include createdAt, updatedAt, archived, url fields (default: false)', default: false },
      },
    },
  },
  // Companies
  {
    name: 'hubspot_list_companies',
    description: 'List companies from HubSpot CRM with pagination. Results are compacted by default (truncated at 500 chars, no metadata). Use maxPropertyLength:0 for full field values when you need complete data.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (1-100)', default: 20 },
        after: { type: 'string', description: 'Pagination cursor' },
        properties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Properties to return (e.g., name, domain, industry)',
        },
        maxPropertyLength: { type: 'number', description: 'Max chars per property value before truncation (default: 500, use 0 for no truncation)', default: 500 },
        includeMetadata: { type: 'boolean', description: 'Include createdAt, updatedAt, archived, url fields (default: false)', default: false },
      },
    },
  },
  {
    name: 'hubspot_get_company',
    description: 'Get a single company by ID',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Company ID' },
        properties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Properties to return',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'hubspot_create_company',
    description: 'Create a new company',
    inputSchema: {
      type: 'object',
      properties: {
        properties: {
          type: 'object',
          description: 'Company properties (name, domain, industry, etc.)',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['properties'],
    },
  },
  {
    name: 'hubspot_update_company',
    description: 'Update an existing company',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Company ID' },
        properties: {
          type: 'object',
          description: 'Properties to update',
          additionalProperties: { type: 'string' },
        },
      },
      required: ['id', 'properties'],
    },
  },
  {
    name: 'hubspot_delete_company',
    description: 'Delete a company',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Company ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'hubspot_search_companies',
    description: 'Search companies with filters. Filters within a group are ANDed, groups are ORed. Results are compacted by default (truncated at 500 chars, no metadata). Use maxPropertyLength:0 for full field values when you need complete data for a few specific companies.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search query' },
        filterGroups: {
          type: 'array',
          description: 'Filter groups for advanced search',
          items: {
            type: 'object',
            properties: {
              filters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    propertyName: { type: 'string' },
                    operator: {
                      type: 'string',
                      enum: ['EQ', 'NEQ', 'LT', 'LTE', 'GT', 'GTE', 'CONTAINS_TOKEN', 'NOT_CONTAINS_TOKEN', 'HAS_PROPERTY', 'NOT_HAS_PROPERTY'],
                    },
                    value: { type: 'string' },
                  },
                  required: ['propertyName', 'operator'],
                },
              },
            },
          },
        },
        properties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Properties to return',
        },
        sorts: {
          type: 'array',
          description: 'Sort results by property. Example: [{propertyName: "createdate", direction: "DESCENDING"}]',
          items: {
            type: 'object',
            properties: {
              propertyName: { type: 'string', description: 'Property to sort by' },
              direction: { type: 'string', enum: ['ASCENDING', 'DESCENDING'], description: 'Sort direction' },
            },
            required: ['propertyName', 'direction'],
          },
        },
        limit: { type: 'number', description: 'Max results (1-100)', default: 20 },
        maxPropertyLength: { type: 'number', description: 'Max chars per property value before truncation (default: 500, use 0 for no truncation)', default: 500 },
        includeMetadata: { type: 'boolean', description: 'Include createdAt, updatedAt, archived, url fields (default: false)', default: false },
      },
    },
  },
  // Properties (schema discovery)
  {
    name: 'hubspot_contact_properties',
    description: 'List all available contact properties. Use this to discover property names for searching/filtering.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'hubspot_company_properties',
    description: 'List all available company properties. Use this to discover property names for searching/filtering.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  // Owners
  {
    name: 'hubspot_list_owners',
    description: 'List all owners (users) in the HubSpot account. Returns owner IDs, emails, and names. Use this to map owner IDs to email addresses.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max results (default: 100)', default: 100 },
        after: { type: 'string', description: 'Pagination cursor' },
        archived: { type: 'boolean', description: 'Include archived owners (default: false)', default: false },
      },
    },
  },
  {
    name: 'hubspot_get_owner',
    description: 'Get a single owner by ID. Returns owner details including email, name, and teams.',
    inputSchema: {
      type: 'object',
      properties: {
        ownerId: { type: 'string', description: 'The owner ID to look up' },
      },
      required: ['ownerId'],
    },
  },
  // Engagements
  {
    name: 'hubspot_get_engagements',
    description: 'Fetch engagement history for a contact. Returns notes, emails, calls, meetings, and tasks associated with the contact. Use this to review communication history before reaching out, or to understand the relationship context with a contact.',
    inputSchema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The HubSpot contact ID to fetch engagements for' },
        types: {
          type: 'array',
          items: { type: 'string', enum: ['notes', 'emails', 'calls', 'meetings', 'tasks'] },
          description: 'Filter by engagement types. If not specified, returns all types. Example: ["emails", "calls"] to see only email and call history.',
        },
        limit: { type: 'number', description: 'Max results per engagement type (default: 20)', default: 20 },
      },
      required: ['contactId'],
    },
  },
  {
    name: 'hubspot_log_email',
    description: 'Log an email that was sent to a contact. Use this to record outbound emails in HubSpot CRM, maintaining a complete communication history. The email will appear in the contact timeline.',
    inputSchema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The HubSpot contact ID to associate the email with' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body content (HTML or plain text)' },
        direction: {
          type: 'string',
          enum: ['EMAIL', 'INCOMING_EMAIL', 'FORWARDED_EMAIL'],
          description: 'Email direction. EMAIL for sent/outbound emails, INCOMING_EMAIL for received emails (default: EMAIL)',
          default: 'EMAIL',
        },
        timestamp: {
          type: 'string',
          description: 'ISO 8601 timestamp of when the email was sent. Defaults to current time. Example: "2024-01-15T10:30:00Z"',
        },
      },
      required: ['contactId', 'subject', 'body'],
    },
  },
  {
    name: 'hubspot_create_note',
    description: 'Create a note on a contact record. Use this to log important information, meeting summaries, or any context about interactions with a contact. The note will appear in the contact timeline.',
    inputSchema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The HubSpot contact ID to attach the note to' },
        body: { type: 'string', description: 'Note content (supports plain text)' },
        timestamp: {
          type: 'string',
          description: 'ISO 8601 timestamp for the note. Defaults to current time. Example: "2024-01-15T10:30:00Z"',
        },
      },
      required: ['contactId', 'body'],
    },
  },
  // Tasks
  {
    name: 'hubspot_create_task',
    description: 'Create a task (follow-up reminder) linked to a contact. Use this to schedule follow-ups after calls, emails, or meetings.',
    inputSchema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The HubSpot contact ID to associate the task with' },
        subject: { type: 'string', description: 'Task subject/title (e.g., "Follow up on proposal")' },
        body: { type: 'string', description: 'Task notes/description (optional)' },
        dueDate: { type: 'string', description: 'ISO 8601 timestamp for when task is due. Example: "2024-01-20T09:00:00Z"' },
        ownerId: { type: 'string', description: 'Owner ID to assign the task to. Use hubspot_list_owners to get IDs. If not specified, task is unassigned.' },
        priority: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH'],
          description: 'Task priority (default: MEDIUM)',
        },
      },
      required: ['contactId', 'subject'],
    },
  },
  {
    name: 'hubspot_search_tasks',
    description: 'Search tasks with filters. Use this to find tasks by owner, status, or due date. Great for "show me my open tasks" or "what\'s overdue" queries.',
    inputSchema: {
      type: 'object',
      properties: {
        ownerId: { type: 'string', description: 'Filter by owner ID. Use hubspot_list_owners to get IDs.' },
        status: {
          type: 'string',
          enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DEFERRED'],
          description: 'Filter by task status',
        },
        dueBefore: { type: 'string', description: 'Filter tasks due before this ISO 8601 timestamp. Use for finding overdue tasks.' },
        dueAfter: { type: 'string', description: 'Filter tasks due after this ISO 8601 timestamp.' },
        limit: { type: 'number', description: 'Max results (1-100, default: 20)', default: 20 },
      },
    },
  },
  {
    name: 'hubspot_update_task',
    description: 'Update an existing task. Use this to mark tasks complete, change due date, reassign, or update priority.',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'The task ID to update' },
        status: {
          type: 'string',
          enum: ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'DEFERRED'],
          description: 'New task status. Use COMPLETED to mark done.',
        },
        subject: { type: 'string', description: 'New task subject' },
        body: { type: 'string', description: 'New task notes/description' },
        dueDate: { type: 'string', description: 'New due date (ISO 8601 timestamp)' },
        ownerId: { type: 'string', description: 'New owner ID to reassign the task' },
        priority: {
          type: 'string',
          enum: ['LOW', 'MEDIUM', 'HIGH'],
          description: 'New task priority',
        },
      },
      required: ['taskId'],
    },
  },
  // Deals
  {
    name: 'hubspot_get_deal',
    description: 'Get a single deal by ID. Returns full deal details including all properties.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Deal ID' },
        properties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Properties to return (e.g., dealname, amount, closedate, dealstage)',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'hubspot_create_deal',
    description: 'Create a new deal (sales opportunity). Can be associated with contacts and/or companies.',
    inputSchema: {
      type: 'object',
      properties: {
        dealname: { type: 'string', description: 'Name of the deal (required)' },
        amount: { type: 'string', description: 'Deal amount/value' },
        closedate: { type: 'string', description: 'Expected close date (ISO 8601 timestamp)' },
        pipeline: { type: 'string', description: 'Pipeline ID. Use hubspot_list_pipelines to get available pipelines.' },
        dealstage: { type: 'string', description: 'Stage ID within the pipeline. Use hubspot_list_pipelines to get stage IDs.' },
        ownerId: { type: 'string', description: 'Owner ID to assign the deal. Use hubspot_list_owners to get IDs.' },
        contactId: { type: 'string', description: 'Contact ID to associate with this deal' },
        companyId: { type: 'string', description: 'Company ID to associate with this deal' },
      },
      required: ['dealname'],
    },
  },
  {
    name: 'hubspot_update_deal',
    description: 'Update an existing deal. Use this to move deals through pipeline stages, update amounts, or change close dates.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Deal ID to update' },
        dealname: { type: 'string', description: 'New deal name' },
        amount: { type: 'string', description: 'New deal amount' },
        closedate: { type: 'string', description: 'New close date (ISO 8601 timestamp)' },
        dealstage: { type: 'string', description: 'New stage ID to move the deal to' },
        ownerId: { type: 'string', description: 'New owner ID' },
      },
      required: ['id'],
    },
  },
  {
    name: 'hubspot_search_deals',
    description: 'Search deals with filters. Use this to find deals by owner, stage, close date, or amount. Great for "deals closing this month" or "my open deals" queries.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text search query' },
        ownerId: { type: 'string', description: 'Filter by owner ID' },
        dealstage: { type: 'string', description: 'Filter by stage ID' },
        pipeline: { type: 'string', description: 'Filter by pipeline ID' },
        closeAfter: { type: 'string', description: 'Filter deals closing after this date (ISO 8601)' },
        closeBefore: { type: 'string', description: 'Filter deals closing before this date (ISO 8601)' },
        minAmount: { type: 'string', description: 'Filter deals with amount >= this value' },
        properties: {
          type: 'array',
          items: { type: 'string' },
          description: 'Properties to return',
        },
        limit: { type: 'number', description: 'Max results (1-100, default: 20)', default: 20 },
      },
    },
  },
  {
    name: 'hubspot_delete_deal',
    description: 'Delete a deal. This action is permanent and cannot be undone.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Deal ID to delete' },
      },
      required: ['id'],
    },
  },
  {
    name: 'hubspot_deal_properties',
    description: 'List all available deal properties. Use this to discover property names for searching/filtering deals.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'hubspot_list_pipelines',
    description: 'List all deal pipelines and their stages. Use this to get valid pipeline and stage IDs for creating/updating deals.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Tool handler
async function handleTool(name: string, args: Record<string, unknown>): Promise<{ content: { type: string; text: string }[] }> {
  const result = await (async () => {
    switch (name) {
      // Contacts
      case 'hubspot_list_contacts': {
        const params = new URLSearchParams();
        params.set('limit', String(Math.min(Number(args.limit) || DEFAULT_MAX_RESULTS, 100)));
        if (args.after) params.set('after', String(args.after));
        if (Array.isArray(args.properties)) {
          args.properties.forEach((p) => params.append('properties', String(p)));
        }
        const data = await hubspot(`/crm/v3/objects/contacts?${params}`) as { results: Record<string, unknown>[]; paging?: unknown };

        // Apply exclude filters
        const excludeCompanies = Array.isArray(args.excludeCompanies) ? args.excludeCompanies as string[] : [];
        const excludeJobTitles = Array.isArray(args.excludeJobTitles) ? args.excludeJobTitles as string[] : [];
        const { results: filteredResults, excluded } = filterResults(data.results, { excludeCompanies, excludeJobTitles });

        const maxLen = args.maxPropertyLength === 0 ? Infinity : (Number(args.maxPropertyLength) || DEFAULT_MAX_PROPERTY_LENGTH);
        const compacted = compactResults({ ...data, results: filteredResults }, { maxPropertyLength: maxLen, includeMetadata: Boolean(args.includeMetadata) });

        return {
          ...compacted,
          _meta: excluded > 0 ? { excluded, excludeCompanies, excludeJobTitles } : undefined,
        };
      }

      case 'hubspot_get_contact': {
        const params = new URLSearchParams();
        if (Array.isArray(args.properties)) {
          args.properties.forEach((p) => params.append('properties', String(p)));
        }
        return hubspot(`/crm/v3/objects/contacts/${args.id}?${params}`);
      }

      case 'hubspot_create_contact':
        return hubspot('/crm/v3/objects/contacts', 'POST', { properties: args.properties });

      case 'hubspot_update_contact':
        return hubspot(`/crm/v3/objects/contacts/${args.id}`, 'PATCH', { properties: args.properties });

      case 'hubspot_delete_contact':
        return hubspot(`/crm/v3/objects/contacts/${args.id}`, 'DELETE');

      case 'hubspot_search_contacts': {
        const body: Record<string, unknown> = { limit: Math.min(Number(args.limit) || DEFAULT_MAX_RESULTS, 100) };
        if (args.query) body.query = args.query;
        if (args.filterGroups) body.filterGroups = args.filterGroups;
        if (Array.isArray(args.properties)) body.properties = args.properties;
        if (Array.isArray(args.sorts)) body.sorts = args.sorts;
        const data = await hubspot('/crm/v3/objects/contacts/search', 'POST', body) as { results: Record<string, unknown>[]; total?: number; paging?: unknown };

        // Apply exclude filters
        const excludeCompanies = Array.isArray(args.excludeCompanies) ? args.excludeCompanies as string[] : [];
        const excludeJobTitles = Array.isArray(args.excludeJobTitles) ? args.excludeJobTitles as string[] : [];
        const { results: filteredResults, excluded } = filterResults(data.results, { excludeCompanies, excludeJobTitles });

        const maxLen = args.maxPropertyLength === 0 ? Infinity : (Number(args.maxPropertyLength) || DEFAULT_MAX_PROPERTY_LENGTH);
        const compacted = compactResults({ ...data, results: filteredResults }, { maxPropertyLength: maxLen, includeMetadata: Boolean(args.includeMetadata) });

        // Add exclusion info to response
        return {
          ...compacted,
          _meta: excluded > 0 ? { excluded, excludeCompanies, excludeJobTitles } : undefined,
        };
      }

      // Companies
      case 'hubspot_list_companies': {
        const params = new URLSearchParams();
        params.set('limit', String(Math.min(Number(args.limit) || DEFAULT_MAX_RESULTS, 100)));
        if (args.after) params.set('after', String(args.after));
        if (Array.isArray(args.properties)) {
          args.properties.forEach((p) => params.append('properties', String(p)));
        }
        const data = await hubspot(`/crm/v3/objects/companies?${params}`) as { results: Record<string, unknown>[]; paging?: unknown };
        const maxLen = args.maxPropertyLength === 0 ? Infinity : (Number(args.maxPropertyLength) || DEFAULT_MAX_PROPERTY_LENGTH);
        return compactResults(data, { maxPropertyLength: maxLen, includeMetadata: Boolean(args.includeMetadata) });
      }

      case 'hubspot_get_company': {
        const params = new URLSearchParams();
        if (Array.isArray(args.properties)) {
          args.properties.forEach((p) => params.append('properties', String(p)));
        }
        return hubspot(`/crm/v3/objects/companies/${args.id}?${params}`);
      }

      case 'hubspot_create_company':
        return hubspot('/crm/v3/objects/companies', 'POST', { properties: args.properties });

      case 'hubspot_update_company':
        return hubspot(`/crm/v3/objects/companies/${args.id}`, 'PATCH', { properties: args.properties });

      case 'hubspot_delete_company':
        return hubspot(`/crm/v3/objects/companies/${args.id}`, 'DELETE');

      case 'hubspot_search_companies': {
        const body: Record<string, unknown> = { limit: Math.min(Number(args.limit) || DEFAULT_MAX_RESULTS, 100) };
        if (args.query) body.query = args.query;
        if (args.filterGroups) body.filterGroups = args.filterGroups;
        if (Array.isArray(args.properties)) body.properties = args.properties;
        if (Array.isArray(args.sorts)) body.sorts = args.sorts;
        const data = await hubspot('/crm/v3/objects/companies/search', 'POST', body) as { results: Record<string, unknown>[]; total?: number; paging?: unknown };
        const maxLen = args.maxPropertyLength === 0 ? Infinity : (Number(args.maxPropertyLength) || DEFAULT_MAX_PROPERTY_LENGTH);
        return compactResults(data, { maxPropertyLength: maxLen, includeMetadata: Boolean(args.includeMetadata) });
      }

      // Properties
      case 'hubspot_contact_properties': {
        const data = await hubspot('/crm/v3/properties/contacts') as { results: Array<{ name: string; label: string; type: string; description: string }> };
        return data.results.map((p) => ({ name: p.name, label: p.label, type: p.type, description: p.description }));
      }

      case 'hubspot_company_properties': {
        const data = await hubspot('/crm/v3/properties/companies') as { results: Array<{ name: string; label: string; type: string; description: string }> };
        return data.results.map((p) => ({ name: p.name, label: p.label, type: p.type, description: p.description }));
      }

      // Owners
      case 'hubspot_list_owners': {
        const params = new URLSearchParams();
        params.set('limit', String(Math.min(Number(args.limit) || 100, 500)));
        if (args.after) params.set('after', String(args.after));
        if (args.archived) params.set('archived', 'true');
        return hubspot(`/crm/v3/owners?${params}`);
      }

      case 'hubspot_get_owner': {
        return hubspot(`/crm/v3/owners/${args.ownerId}`);
      }

      // Engagements
      case 'hubspot_get_engagements': {
        const contactId = String(args.contactId);
        const limit = Math.min(Number(args.limit) || DEFAULT_MAX_RESULTS, 100);
        const allTypes = ['notes', 'emails', 'calls', 'meetings', 'tasks'];
        const requestedTypes = Array.isArray(args.types) ? args.types as string[] : allTypes;
        const typesToFetch = requestedTypes.filter(t => allTypes.includes(t));

        const engagements: Record<string, unknown[]> = {};

        // Fetch each engagement type in parallel
        await Promise.all(typesToFetch.map(async (type) => {
          try {
            // Get associations for this engagement type
            const associations = await hubspot(`/crm/v4/objects/contacts/${contactId}/associations/${type}`) as { results: Array<{ toObjectId: string }> };

            if (associations.results && associations.results.length > 0) {
              // Get the actual engagement objects (limited)
              const objectIds = associations.results.slice(0, limit).map(a => a.toObjectId);

              // Batch read the engagement objects
              const batchResponse = await hubspot(`/crm/v3/objects/${type}/batch/read`, 'POST', {
                inputs: objectIds.map(id => ({ id })),
                properties: type === 'notes' ? ['hs_note_body', 'hs_timestamp', 'hs_createdate']
                  : type === 'emails' ? ['hs_email_subject', 'hs_email_text', 'hs_email_direction', 'hs_timestamp', 'hs_createdate']
                  : type === 'calls' ? ['hs_call_title', 'hs_call_body', 'hs_call_duration', 'hs_call_direction', 'hs_timestamp', 'hs_createdate']
                  : type === 'meetings' ? ['hs_meeting_title', 'hs_meeting_body', 'hs_meeting_start_time', 'hs_meeting_end_time', 'hs_createdate']
                  : ['hs_task_subject', 'hs_task_body', 'hs_task_status', 'hs_timestamp', 'hs_createdate'],
              }) as { results: Array<{ id: string; properties: Record<string, unknown> }> };

              engagements[type] = batchResponse.results.map(e => ({
                id: e.id,
                properties: e.properties,
              }));
            } else {
              engagements[type] = [];
            }
          } catch (error) {
            // If fetching a type fails, return empty array for that type
            engagements[type] = [];
          }
        }));

        return {
          contactId,
          engagements,
          _meta: { typesRequested: typesToFetch },
        };
      }

      case 'hubspot_log_email': {
        const contactId = String(args.contactId);
        const timestamp = args.timestamp ? String(args.timestamp) : new Date().toISOString();

        // Create the email object
        const emailData = await hubspot('/crm/v3/objects/emails', 'POST', {
          properties: {
            hs_email_subject: String(args.subject),
            hs_email_text: String(args.body),
            hs_email_direction: String(args.direction || 'EMAIL'),
            hs_timestamp: timestamp,
          },
        }) as { id: string; properties: Record<string, unknown> };

        // Associate the email with the contact using v3 API (email_to_contact association type)
        await hubspot(`/crm/v3/objects/emails/${emailData.id}/associations/contacts/${contactId}/email_to_contact`, 'PUT');

        return {
          success: true,
          emailId: emailData.id,
          contactId,
          properties: emailData.properties,
        };
      }

      case 'hubspot_create_note': {
        const contactId = String(args.contactId);
        const timestamp = args.timestamp ? String(args.timestamp) : new Date().toISOString();

        // Create the note object
        const noteData = await hubspot('/crm/v3/objects/notes', 'POST', {
          properties: {
            hs_note_body: String(args.body),
            hs_timestamp: timestamp,
          },
        }) as { id: string; properties: Record<string, unknown> };

        // Associate the note with the contact using v3 API (note_to_contact association type)
        await hubspot(`/crm/v3/objects/notes/${noteData.id}/associations/contacts/${contactId}/note_to_contact`, 'PUT');

        return {
          success: true,
          noteId: noteData.id,
          contactId,
          properties: noteData.properties,
        };
      }

      // Tasks
      case 'hubspot_create_task': {
        const contactId = String(args.contactId);
        const dueDate = args.dueDate ? String(args.dueDate) : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Default: tomorrow

        const properties: Record<string, string> = {
          hs_task_subject: String(args.subject),
          hs_timestamp: dueDate,
          hs_task_status: 'NOT_STARTED',
        };
        if (args.body) properties.hs_task_body = String(args.body);
        if (args.ownerId) properties.hubspot_owner_id = String(args.ownerId);
        if (args.priority) properties.hs_task_priority = String(args.priority);

        const taskData = await hubspot('/crm/v3/objects/tasks', 'POST', { properties }) as { id: string; properties: Record<string, unknown> };

        // Associate with contact
        await hubspot(`/crm/v3/objects/tasks/${taskData.id}/associations/contacts/${contactId}/task_to_contact`, 'PUT');

        return {
          success: true,
          taskId: taskData.id,
          contactId,
          properties: taskData.properties,
        };
      }

      case 'hubspot_search_tasks': {
        const filters: Array<{ propertyName: string; operator: string; value: string }> = [];

        if (args.ownerId) {
          filters.push({ propertyName: 'hubspot_owner_id', operator: 'EQ', value: String(args.ownerId) });
        }
        if (args.status) {
          filters.push({ propertyName: 'hs_task_status', operator: 'EQ', value: String(args.status) });
        }
        if (args.dueBefore) {
          filters.push({ propertyName: 'hs_timestamp', operator: 'LT', value: String(args.dueBefore) });
        }
        if (args.dueAfter) {
          filters.push({ propertyName: 'hs_timestamp', operator: 'GT', value: String(args.dueAfter) });
        }

        const body: Record<string, unknown> = {
          limit: Math.min(Number(args.limit) || DEFAULT_MAX_RESULTS, 100),
          properties: ['hs_task_subject', 'hs_task_body', 'hs_task_status', 'hs_timestamp', 'hubspot_owner_id', 'hs_task_priority'],
          sorts: [{ propertyName: 'hs_timestamp', direction: 'ASCENDING' }],
        };
        if (filters.length > 0) {
          body.filterGroups = [{ filters }];
        }

        const data = await hubspot('/crm/v3/objects/tasks/search', 'POST', body) as { results: Record<string, unknown>[]; total?: number; paging?: unknown };
        return {
          total: data.total,
          results: data.results.map(t => ({ id: (t as { id: string }).id, properties: (t as { properties: unknown }).properties })),
          paging: data.paging,
        };
      }

      case 'hubspot_update_task': {
        const taskId = String(args.taskId);
        const properties: Record<string, string> = {};

        if (args.status) properties.hs_task_status = String(args.status);
        if (args.subject) properties.hs_task_subject = String(args.subject);
        if (args.body) properties.hs_task_body = String(args.body);
        if (args.dueDate) properties.hs_timestamp = String(args.dueDate);
        if (args.ownerId) properties.hubspot_owner_id = String(args.ownerId);
        if (args.priority) properties.hs_task_priority = String(args.priority);

        if (Object.keys(properties).length === 0) {
          throw new Error('At least one property to update must be provided');
        }

        const taskData = await hubspot(`/crm/v3/objects/tasks/${taskId}`, 'PATCH', { properties }) as { id: string; properties: Record<string, unknown> };

        return {
          success: true,
          taskId: taskData.id,
          properties: taskData.properties,
        };
      }

      // Deals
      case 'hubspot_get_deal': {
        const params = new URLSearchParams();
        if (Array.isArray(args.properties)) {
          args.properties.forEach((p) => params.append('properties', String(p)));
        }
        return hubspot(`/crm/v3/objects/deals/${args.id}?${params}`);
      }

      case 'hubspot_create_deal': {
        const properties: Record<string, string> = {
          dealname: String(args.dealname),
        };
        if (args.amount) properties.amount = String(args.amount);
        if (args.closedate) properties.closedate = String(args.closedate);
        if (args.pipeline) properties.pipeline = String(args.pipeline);
        if (args.dealstage) properties.dealstage = String(args.dealstage);
        if (args.ownerId) properties.hubspot_owner_id = String(args.ownerId);

        const dealData = await hubspot('/crm/v3/objects/deals', 'POST', { properties }) as { id: string; properties: Record<string, unknown> };

        // Associate with contact if provided
        if (args.contactId) {
          await hubspot(`/crm/v3/objects/deals/${dealData.id}/associations/contacts/${args.contactId}/deal_to_contact`, 'PUT');
        }

        // Associate with company if provided
        if (args.companyId) {
          await hubspot(`/crm/v3/objects/deals/${dealData.id}/associations/companies/${args.companyId}/deal_to_company`, 'PUT');
        }

        return {
          success: true,
          dealId: dealData.id,
          properties: dealData.properties,
          associations: {
            contactId: args.contactId || null,
            companyId: args.companyId || null,
          },
        };
      }

      case 'hubspot_update_deal': {
        const dealId = String(args.id);
        const properties: Record<string, string> = {};

        if (args.dealname) properties.dealname = String(args.dealname);
        if (args.amount) properties.amount = String(args.amount);
        if (args.closedate) properties.closedate = String(args.closedate);
        if (args.dealstage) properties.dealstage = String(args.dealstage);
        if (args.ownerId) properties.hubspot_owner_id = String(args.ownerId);

        if (Object.keys(properties).length === 0) {
          throw new Error('At least one property to update must be provided');
        }

        const dealData = await hubspot(`/crm/v3/objects/deals/${dealId}`, 'PATCH', { properties }) as { id: string; properties: Record<string, unknown> };

        return {
          success: true,
          dealId: dealData.id,
          properties: dealData.properties,
        };
      }

      case 'hubspot_search_deals': {
        const filters: Array<{ propertyName: string; operator: string; value: string }> = [];

        if (args.ownerId) {
          filters.push({ propertyName: 'hubspot_owner_id', operator: 'EQ', value: String(args.ownerId) });
        }
        if (args.dealstage) {
          filters.push({ propertyName: 'dealstage', operator: 'EQ', value: String(args.dealstage) });
        }
        if (args.pipeline) {
          filters.push({ propertyName: 'pipeline', operator: 'EQ', value: String(args.pipeline) });
        }
        if (args.closeAfter) {
          filters.push({ propertyName: 'closedate', operator: 'GTE', value: String(args.closeAfter) });
        }
        if (args.closeBefore) {
          filters.push({ propertyName: 'closedate', operator: 'LTE', value: String(args.closeBefore) });
        }
        if (args.minAmount) {
          filters.push({ propertyName: 'amount', operator: 'GTE', value: String(args.minAmount) });
        }

        const body: Record<string, unknown> = {
          limit: Math.min(Number(args.limit) || DEFAULT_MAX_RESULTS, 100),
          properties: Array.isArray(args.properties) ? args.properties : ['dealname', 'amount', 'closedate', 'dealstage', 'pipeline', 'hubspot_owner_id'],
          sorts: [{ propertyName: 'closedate', direction: 'ASCENDING' }],
        };
        if (args.query) body.query = args.query;
        if (filters.length > 0) {
          body.filterGroups = [{ filters }];
        }

        const data = await hubspot('/crm/v3/objects/deals/search', 'POST', body) as { results: Record<string, unknown>[]; total?: number; paging?: unknown };
        return {
          total: data.total,
          results: data.results.map(d => ({ id: (d as { id: string }).id, properties: (d as { properties: unknown }).properties })),
          paging: data.paging,
        };
      }

      case 'hubspot_delete_deal':
        await hubspot(`/crm/v3/objects/deals/${args.id}`, 'DELETE');
        return { success: true, deleted: args.id };

      case 'hubspot_deal_properties': {
        const data = await hubspot('/crm/v3/properties/deals') as { results: Array<{ name: string; label: string; type: string; description: string }> };
        return data.results.map((p) => ({ name: p.name, label: p.label, type: p.type, description: p.description }));
      }

      case 'hubspot_list_pipelines': {
        const data = await hubspot('/crm/v3/pipelines/deals') as { results: Array<{ id: string; label: string; stages: Array<{ id: string; label: string; displayOrder: number }> }> };
        return data.results.map((p) => ({
          id: p.id,
          label: p.label,
          stages: p.stages.map(s => ({ id: s.id, label: s.label, displayOrder: s.displayOrder })),
        }));
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  })();

  return {
    content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
  };
}

// Vercel handler
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { method, params, id } = req.body;

    let result;
    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: MCP_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        };
        break;

      case 'tools/list':
        result = { tools: TOOLS };
        break;

      case 'tools/call':
        result = await handleTool(params.name, params.arguments || {});
        break;

      default:
        return res.status(200).json({
          jsonrpc: '2.0',
          error: { code: -32601, message: `Method not found: ${method}` },
          id,
        });
    }

    return res.status(200).json({ jsonrpc: '2.0', result, id });
  } catch (error) {
    console.error('MCP error:', error);
    return res.status(200).json({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : 'Internal error',
      },
      id: req.body?.id,
    });
  }
}
