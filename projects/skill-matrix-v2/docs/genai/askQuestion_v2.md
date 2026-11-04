# askQuestion_v2 Function Documentation

## Overview

Google Cloud Function that provides a natural language to SQL interface for querying the Skill Matrix database. Uses OpenAI's GPT-4 model to convert natural language questions into safe, validated PostgreSQL queries. Supports conversational follow-up questions through session management.

**Location**: `backend/genai/askQuestion_v2/main.py`

**Trigger**: HTTP POST request

**Port (Local Development)**: 8000

**Database Library**: SQLAlchemy ORM with NullPool (serverless-optimized)

**LLM Provider**: OpenAI (GPT-4.1)

---

## Purpose

This function enables users to query the Skill Matrix database using natural language instead of writing SQL:

1. **Natural Language Interface**: Users can ask questions in plain English
2. **Safe SQL Generation**: LLM generates SQL queries with strict validation and safety checks
3. **Session Management**: Supports follow-up questions in a conversation context
4. **Read-Only Access**: Only SELECT queries are allowed, with mandatory LIMIT clauses
5. **Schema-Aware**: LLM is provided with complete database schema and business rules

---

## Function Flow

### Entry Point: `ask_question_v2(request: Request)`

The main Cloud Function handler that processes HTTP requests.

#### 1. CORS Handling
- Handles OPTIONS preflight requests
- Sets CORS headers for all origins (`*`)
- Allows `POST` and `OPTIONS` methods
- Includes `Authorization` header in allowed headers
- Sets `Access-Control-Max-Age` to 3600 seconds

#### 2. Request Validation
- Validates that the request method is POST
- Extracts `question` and optional `session_id` from JSON body
- Validates that `question` is provided

#### 3. SQL Pipeline Execution
- Calls `run_sql_pipeline()` which:
  - Loads session if `session_id` is provided
  - Determines if this is a follow-up question or new query
  - Generates or rewrites SQL using LLM
  - Validates SQL for safety
  - Executes SQL query
  - Updates session with new question and SQL
  - Returns results with session ID

#### 4. Response
- Returns query results with columns and rows
- Includes `session_id` for follow-up questions
- Returns appropriate error messages with status codes for failures

---

## API

### Endpoint

```
POST /query
```

### Request

**Method:** `POST`

**Headers:**
- `Content-Type`: `application/json`
- `Authorization`: (optional, for authenticated requests)

**Request Body:**
```json
{
  "question": "Show me all employees with Python skills at L3 level",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"  // optional
}
```

**Parameters:**
- `question` (required, string): Natural language question about the Skill Matrix data
- `session_id` (optional, string): UUID of an existing session for follow-up questions

### Response

**Success (200):**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "columns": ["id", "name", "email", "framework_name", "level_selected"],
  "rows": [
    {
      "id": 123,
      "name": "John Doe",
      "email": "john.doe@company.com",
      "framework_name": "Python",
      "level_selected": "L3"
    },
    {
      "id": 456,
      "name": "Jane Smith",
      "email": "jane.smith@company.com",
      "framework_name": "Python",
      "level_selected": "L3"
    }
  ]
}
```

**Count Query Response Example:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "columns": ["count"],
  "rows": [
    {
      "count": 15
    }
  ],
  "text": "15 People found"
}
```

**Response Fields:**
- `session_id` (string): UUID of the session (new or existing)
- `columns` (array): List of column names from the query result
- `rows` (array): Array of objects, each representing a row with column values
- `text` (string, optional): Human-readable text summary when the result is a single COUNT query. Includes the count value and "Person found" (singular) or "People found" (plural)

**Error Responses:**

All error responses return user-friendly messages. Technical details (SQL queries, stack traces, etc.) are logged for debugging but not exposed to users.

**Missing JSON Body (400):**
```json
{
  "error": "Missing JSON body"
}
```

**Missing Question Field (400):**
```json
{
  "error": "Missing 'question' field"
}
```

**SQL Validation Error (400):**
```json
{
  "error": "Only SELECT queries are allowed"
}
```

or

```json
{
  "error": "LIMIT clause is required"
}
```

or

```json
{
  "error": "Forbidden SQL keyword detected"
}
```

**SQL Syntax Error (400):**
```json
{
  "error": "The generated SQL query has a syntax error. Please try rephrasing your question."
}
```

**SQL Execution Error (400):**
```json
{
  "error": "The generated SQL query has an error. Please try rephrasing your question."
}
```

or

```json
{
  "error": "The query references a column that doesn't exist. Please try rephrasing your question."
}
```

**Query Timeout (400):**
```json
{
  "error": "The query took too long to execute. Please try a simpler question."
}
```

**LLM Error (400):**
```json
{
  "error": "Unable to generate a valid query from your question. Please try rephrasing it."
}
```

or

```json
{
  "error": "Unable to process your question. Please check your API configuration or try again later."
}
```

**Database Connection Error (400):**
```json
{
  "error": "Unable to connect to the database. Please try again later."
}
```

**Unexpected Error (500):**
```json
{
  "error": "An error occurred while processing your question. Please try rephrasing it or try again later."
}
```

### CORS Headers

All responses include:
- `Access-Control-Allow-Origin`: `*`
- `Access-Control-Allow-Methods`: `POST, OPTIONS`
- `Access-Control-Allow-Headers`: `Content-Type, Authorization`
- `Access-Control-Max-Age`: `3600`

---

## Core Functions

### `run_sql_pipeline(question: str, session_id: Optional[str] = None)`

Main pipeline function that orchestrates the SQL generation and execution process.

**Process Flow:**

1. **Session Loading**: If `session_id` is provided, loads session data (last question and SQL)
2. **Query Type Detection**:
   - **Follow-up Query**: If session exists and has `last_sql`, uses `rewrite_sql()` to modify previous query
   - **New Query**: Otherwise, generates new SQL from scratch using `SQL_SYSTEM_PROMPT`
3. **SQL Generation**: Calls OpenAI LLM to generate or rewrite SQL
4. **SQL Extraction**: Extracts SQL from LLM response (removes markdown formatting)
5. **SQL Validation**: Validates SQL for safety (SELECT only, LIMIT required, no forbidden keywords)
6. **SQL Execution**: Executes query with 5-second timeout, fetches up to 100 rows
7. **Human-Readable Text**: For COUNT queries that return a single numeric result, generates a human-readable text summary (e.g., "15 People found" or "1 Person found")
8. **Session Update**: Updates or creates session with new question and SQL
9. **Response**: Returns results with session ID and optional human-readable text

**Returns**: Dictionary with `session_id`, `columns`, `rows`, and optional `text` (for COUNT queries)

**Error Handling:**
- **Session Errors**: Gracefully handles session loading/creation failures
- **LLM Errors**: Catches and handles OpenAI API errors with user-friendly messages
- **SQL Generation Errors**: Handles SQL extraction failures and provides helpful messages
- **SQL Validation Errors**: Re-raises validation errors (already user-friendly)
- **SQL Execution Errors**: Handled by `execute_sql()` with user-friendly messages
- **Unexpected Errors**: Wrapped in user-friendly error messages

**Raises**:
- `ValueError`: For all user-facing errors (validation, LLM, SQL execution, etc.)
  - All `ValueError` messages are user-friendly and don't expose technical details
  - Full technical details are logged for debugging

### `validate_sql(sql: str)`

Validates SQL query for safety and compliance.

**Validation Rules:**
1. Must start with `SELECT` (case-insensitive)
2. Must include `LIMIT` clause
3. Must not contain forbidden keywords: `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `CREATE`, `REPLACE`

**Raises**: `ValueError` if validation fails

### `extract_sql(text: str) -> str`

Extracts SQL query from LLM response text.

**Process:**
- Removes markdown code block markers (```sql, ```)
- Searches for first `SELECT ... LIMIT ...` pattern
- Returns cleaned SQL string

**Raises**: `ValueError` if no valid SELECT + LIMIT pattern found

### `rewrite_sql(previous_sql: str, follow_up_question: str) -> str`

Uses LLM to rewrite a previous SQL query to answer a follow-up question.

**Process:**
- Constructs prompt with `SQL_REWRITE_SYSTEM_PROMPT`, previous SQL, and follow-up question
- Calls LLM to generate modified SQL
- Extracts SQL from response

**Returns**: New SQL query string

**Raises**: `ValueError` if no valid SELECT + LIMIT found in LLM output

### `execute_sql(sql: str)`

Executes SQL query and returns results with comprehensive error handling.

**Process:**
- Executes query with 5-second timeout
- Fetches column names from result
- Fetches up to 100 rows
- Converts rows to list of dictionaries

**Error Handling:**
- **SQL Syntax Errors**: Catches `ProgrammingError` and returns user-friendly messages
- **Connection/Timeout Errors**: Catches `OperationalError` and returns appropriate messages
- **Other Database Errors**: Catches `SQLAlchemyError` and returns generic user-friendly message
- **Logging**: Logs full SQL query and error details for debugging

**Returns**: Tuple of `(rows, columns)` where:
- `rows`: List of dictionaries, each representing a row
- `columns`: List of column names

**Raises**: `ValueError` with user-friendly error messages (technical details logged)

### `generate_human_text(rows: List, columns: List, sql: str) -> Optional[str]`

Generates a human-readable text summary for COUNT queries that return a single numeric result.

**Process:**
- Checks if result is a single row with a single column
- Verifies the value is numeric (int or float)
- Detects if query is a COUNT query by:
  - Checking if column name contains "count" (case-insensitive)
  - OR checking if SQL starts with "SELECT COUNT(...)"
- Returns human-readable text with correct singular/plural form

**Returns**: String like "15 People found" or "1 Person found", or `None` if conditions not met

**Error Handling:** Silently returns `None` if any exception occurs during processing

::Note::
- Added to response only when applicable
- Provides better UX for common COUNT queries
- Does not interfere with other query types

### Session Management Functions

#### `create_session(schema: str) -> str`

Creates a new SQL agent session in the database.

**Returns**: Session ID (UUID string)

#### `load_session(session_id: str) -> Optional[Dict]`

Loads session data if it exists and is not expired (30 minutes).

**Returns**: Dictionary with `last_question`, `last_sql`, `schema_name` or `None` if not found/expired

#### `update_session(session_id: str, question: str, sql: str)`

Updates session with new question and SQL, and updates `updated_at` timestamp.

---

## Database Schema

### Tables Used

#### `sql_agent_session`
Stores conversation sessions for follow-up question support.

**Columns:**
- `session_id` (UUID, PRIMARY KEY): Unique session identifier
- `last_question` (TEXT): Most recent question asked
- `last_sql` (TEXT): SQL query generated for last question
- `schema_name` (TEXT): Database schema name
- `updated_at` (TIMESTAMPTZ): Last update timestamp (used for expiration)

**Session Expiration**: Sessions expire after 30 minutes of inactivity

---

## SQL Safety & Validation

### Security Measures

1. **Read-Only Enforcement**: Only `SELECT` queries are allowed
2. **Mandatory LIMIT**: All queries must include a `LIMIT` clause to prevent large result sets
3. **Forbidden Keywords**: Blocks all write operations:
   - `INSERT`, `UPDATE`, `DELETE`
   - `DROP`, `ALTER`, `TRUNCATE`
   - `CREATE`, `REPLACE`
4. **Query Timeout**: 5-second timeout on all SQL executions
5. **Result Limit**: Maximum 100 rows returned per query
6. **SQL Parsing**: Uses `sqlparse` library to validate SQL structure

### Validation Process

```python
def validate_sql(sql: str):
    # 1. Check starts with SELECT
    if not sql.lower().startswith("select"):
        raise ValueError("Only SELECT queries are allowed")
    
    # 2. Check has LIMIT clause
    if "limit" not in sql.lower():
        raise ValueError("LIMIT clause is required")
    
    # 3. Parse and check for forbidden keywords
    parsed = sqlparse.parse(sql)
    for stmt in parsed:
        for token in stmt.tokens:
            if token.value.lower() in FORBIDDEN:
                raise ValueError("Forbidden SQL keyword detected")
```

---

## LLM Integration

### Model Configuration

- **Provider**: OpenAI
- **Model**: GPT-4.1
- **Temperature**: 0 (deterministic SQL generation)
- **API Key**: From `OPENAI_API_KEY` environment variable

### Prompts

#### `SQL_SYSTEM_PROMPT`
Comprehensive prompt that includes:
- Database schema (all tables, columns, relationships)
- Business rules and data model explanations
- Query generation guidelines
- Safety requirements
- Output format requirements

#### `SQL_REWRITE_SYSTEM_PROMPT`
Prompt for rewriting existing SQL queries to answer follow-up questions:
- Previous SQL context
- Follow-up question
- Instructions for modifying query

### LLM Response Processing

1. LLM generates SQL (may include markdown formatting)
2. `extract_sql()` removes markdown and extracts SQL
3. Validates extracted SQL
4. Executes if valid

---

## Environment Variables

Required environment variables:

### Database Configuration
- `DB_USER`: Database username
- `DB_PASS`: Database password
- `DB_NAME`: Database name
- `DB_HOST`: Database host
- `DB_PORT`: Database port (default: 5432)

### LLM Configuration
- `OPENAI_API_KEY`: OpenAI API key for GPT-4 access

### Local Development
For local development, these can be set in `backend/.env` file. The function will automatically load from `.env` if it exists, otherwise uses Cloud Functions environment variables.

---

## Deployment

Cloud deployment/IAM belongs in `skill-matrix-deploy`. The function is private and invoked by the frontend Cloud Run runtime service account with `roles/run.invoker`.

### Production Deployment (Gen2)

```bash
gcloud functions deploy ask_question_v2 \
  --gen2 \
  --runtime python310 \
  --trigger-http \
  --entry-point ask_question_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --region asia-south1 \
  --set-env-vars ENV=production,OPENAI_API_KEY=YOUR_KEY_HERE
```

### Development Deployment (Gen2)

```bash
gcloud functions deploy dev_ask_question_v2 \
  --gen2 \
  --runtime python310 \
  --trigger-http \
  --entry-point ask_question_v2 \
  --service-account training-project-419308@appspot.gserviceaccount.com \
  --region asia-south1 \
  --set-env-vars ENV=development,OPENAI_API_KEY=YOUR_KEY_HERE
```

**Note:** Gen2 functions run on Cloud Run and automatically handle the PORT environment variable. The functions-framework will listen on the port provided by Cloud Run (default 8080).

### Local Testing

```bash
cd backend/genai/askQuestion_v2
functions-framework --target=ask_question_v2 --source main.py --debug --port=8120
```

Or using Flask directly:

```bash
cd backend/genai/askQuestion_v2
python main.py
```

Then test with:

```bash
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "Show me all employees with Python skills"}'
```

---

## Example Queries

### New Query

**Request:**
```json
{
  "question": "Find all employees who have AWS certification"
}
```

**Response:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "columns": ["id", "name", "email", "cert_name"],
  "rows": [
    {
      "id": 123,
      "name": "John Doe",
      "email": "john.doe@company.com",
      "cert_name": "AWS Solutions Architect"
    }
  ]
}
```

### Follow-up Query

**Request:**
```json
{
  "question": "How many of them are at L3 level?",
  "session_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Response:**
```json
{
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "columns": ["count"],
  "rows": [
    {
      "count": 5
    }
  ]
}
```

---

## Error Handling

The function implements comprehensive error handling that provides user-friendly messages while logging full technical details for debugging.

### Error Handling Strategy

1. **User-Friendly Messages**: All errors return clear, actionable messages without technical details
2. **Comprehensive Logging**: Full error details (SQL queries, stack traces, etc.) are logged for debugging
3. **Error Classification**: Errors are categorized and handled appropriately:
   - **Validation Errors (400)**: User input or SQL validation issues
   - **Server Errors (500)**: Unexpected system errors

### Validation Errors (400)

- **Missing Question**: Returns 400 with "Missing 'question' field"
- **SQL Validation Failures**: Returns 400 with specific validation error:
  - "Only SELECT queries are allowed"
  - "LIMIT clause is required"
  - "Forbidden SQL keyword detected"
- **SQL Syntax Errors**: Returns 400 with "The generated SQL query has a syntax error. Please try rephrasing your question."
- **SQL Execution Errors**: Returns 400 with user-friendly messages:
  - "The generated SQL query has an error. Please try rephrasing your question."
  - "The query references a column that doesn't exist. Please try rephrasing your question."
  - "The query references a table that doesn't exist. Please try rephrasing your question."
- **LLM Output Parsing**: Returns 400 with "Unable to generate a valid query from your question. Please try rephrasing it."

### Database Errors (400)

- **Connection Failures**: Returns 400 with "Unable to connect to the database. Please try again later."
- **Query Timeout**: Returns 400 with "The query took too long to execute. Please try a simpler question."
- **SQL Execution Errors**: Returns 400 with user-friendly messages (see above)

### LLM Errors (400)

- **API Failures**: Returns 400 with specific messages:
  - "API authentication failed. Please check your API configuration."
  - "API rate limit exceeded. Please try again in a moment."
  - "The AI service took too long to respond. Please try again."
  - "Unable to process your question. Please check your API configuration or try again later."
- **Invalid Response**: Returns 400 with "Unable to generate a valid query from your question. Please try rephrasing it."
- **Empty Response**: Returns 400 with "The AI service returned an empty response. Please try again."

### Unexpected Errors (500)

- **System Errors**: Returns 500 with "An error occurred while processing your question. Please try rephrasing it or try again later."

### Error Logging

All errors are logged with full technical details for debugging:

**What Gets Logged:**
- Complete SQL queries (including malformed ones)
- Full error stack traces
- Database error messages with full details
- LLM API responses and errors
- Session information
- Request details (method, path, body)

**What Users See:**
- Clear, actionable error messages
- No SQL queries or technical details
- No stack traces or internal error codes
- Helpful suggestions for resolution

### Example Error Flow

```
User Question → LLM Generates SQL → SQL Validation → SQL Execution
                                                          ↓
                                    Database Error (syntax error)
                                                          ↓
                                    Log: Full SQL + Stack Trace
                                                          ↓
                                    User: "The generated SQL query has a syntax error. 
                                          Please try rephrasing your question."
```

---

## Performance Considerations

### Optimizations

1. **Lazy Engine Initialization**: Database engine created only when needed
2. **NullPool**: No connection pooling (required for serverless)
3. **Query Timeout**: 5-second timeout prevents long-running queries
4. **Result Limiting**: Maximum 100 rows per query
5. **Session Caching**: Sessions cached for 30 minutes

### Potential Bottlenecks

1. **LLM API Latency**: OpenAI API calls can take 2-5 seconds
2. **Complex Queries**: Large joins may be slow
3. **Cold Starts**: First request after inactivity may be slower

### Scaling Recommendations

1. **Caching**: Cache common queries/results
2. **Async Processing**: Consider async LLM calls for better performance
3. **Query Optimization**: LLM could be instructed to generate more efficient SQL
4. **Connection Pooling**: Not applicable (serverless uses NullPool)

---

## Frontend Integration

### Usage Example

```javascript
const askQuestion = async (question, sessionId = null) => {
  const response = await axios.post(
    `${BASE_URL}ask_question_v2`,
    {
      question: question,
      session_id: sessionId
    },
    {
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
  
  return response.data;
};

// First question
const result1 = await askQuestion("Show me employees with Python skills");
const sessionId = result1.session_id;

// Follow-up question
const result2 = await askQuestion(
  "How many are at L3 level?",
  sessionId
);
```

### Session Management

- Store `session_id` from first response
- Include `session_id` in follow-up requests
- Sessions expire after 30 minutes of inactivity
- Create new session if expired (omit `session_id`)

---

## Security Considerations

### Current Security Measures

1. **Read-Only Queries**: Only SELECT statements allowed
2. **SQL Validation**: Multiple layers of validation
3. **Query Timeout**: Prevents long-running queries
4. **Result Limiting**: Maximum 100 rows
5. **Private Cloud Invocation**: Cloud IAM restricts invocation to the frontend runtime service account

### Recommended Enhancements

1. **User Authentication**: Enable proxy-level JWT validation with `REQUIRE_SSO_JWT=true` when required
2. **Rate Limiting**: Prevent abuse of LLM API
3. **Query Logging**: Audit all generated SQL queries
4. **User Permissions**: Restrict queries based on user role
5. **Input Sanitization**: Additional validation on user questions
6. **Cost Monitoring**: Track OpenAI API usage and costs

---

## Testing

For browser and normal cloud Postman testing, use `{{frontend_base_url}}/ask_question_v2` in both environments. Development remains unprefixed in the client; runtime `FUNCTIONS_BASE_URL` ending in `/dev_` selects `dev_ask_question_v2`. Send `Authorization: Bearer {{sso_token}}` from app `localStorage.authToken` when end-user identity is needed.

The proxy adds its Google identity token as `X-Serverless-Authorization` and preserves the SSO JWT in `Authorization`. Direct `*.cloudfunctions.net` diagnostics require a Google identity token whose audience is the exact function URL. Local functions-framework requests need no GCP identity token.

### Test Cases

1. **New Query**: Test natural language to SQL conversion
2. **Follow-up Query**: Test SQL rewriting with session
3. **SQL Validation**: Test forbidden keywords are blocked
4. **Missing LIMIT**: Test LIMIT requirement enforcement
5. **Session Expiration**: Test expired session handling
6. **Invalid SQL**: Test LLM error handling
7. **Database Errors**: Test connection failure handling

### Sample Test Requests

```bash
# New query
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{"question": "Show me all employees with Python skills"}'

# Follow-up query
curl -X POST http://localhost:8000/query \
  -H "Content-Type: application/json" \
  -d '{
    "question": "How many are managers?",
    "session_id": "550e8400-e29b-41d4-a716-446655440000"
  }'
```

---

## Related Documentation

- [Database Schema](../../database/ER_DIAGRAM.md) - Complete database schema
- [getCombinedHierarchy_v2](../aggregations/getCombinedHierarchy_v2.md) - Manager hierarchy aggregation
- [Backend Function Sequence](../../BACKEND_FUNCTION_SEQUENCE.md) - Function call order

---

## Changelog

### Version 1.1.0 (Current)
- **Enhanced Error Handling**: User-friendly error messages with comprehensive logging
- **SQL Error Handling**: Specific handling for syntax errors, execution errors, and timeouts
- **LLM Error Handling**: Improved handling of OpenAI API errors with clear messages
- **Database Error Handling**: Graceful handling of connection and query execution errors
- **Error Logging**: Full technical details logged while users see clean messages

### Version 1.0.0
- Initial implementation with OpenAI GPT-4 integration
- Session management for follow-up questions
- SQL validation and safety checks
- Serverless-optimized database connections
- CORS support for frontend integration

---

## Support & Troubleshooting

### Common Issues

#### "The generated SQL query has a syntax error. Please try rephrasing your question."
- **Cause**: LLM generated SQL with syntax errors (missing parentheses, invalid joins, etc.)
- **Solution**: 
  - Try rephrasing the question more clearly
  - Break complex questions into simpler parts
  - Check logs for the actual SQL to understand the issue
  - May need to adjust `SQL_SYSTEM_PROMPT` for better SQL generation

#### "Only SELECT queries are allowed"
- **Cause**: LLM generated non-SELECT query
- **Solution**: Check prompt engineering, may need to adjust `SQL_SYSTEM_PROMPT`

#### "LIMIT clause is required"
- **Cause**: Generated SQL missing LIMIT
- **Solution**: Ensure prompt emphasizes LIMIT requirement

#### "Unable to generate a valid query from your question. Please try rephrasing it."
- **Cause**: LLM response doesn't contain valid SQL or extraction failed
- **Solution**: 
  - Check LLM response format in logs
  - May need to adjust extraction logic
  - Try rephrasing the question

#### "The query took too long to execute. Please try a simpler question."
- **Cause**: Query exceeded 5-second timeout
- **Solution**: 
  - Simplify the question
  - Break into multiple smaller queries
  - Check database indexes for performance

#### "Unable to connect to the database. Please try again later."
- **Cause**: Database connection failure
- **Solution**: 
  - Check database status
  - Verify connection credentials
  - Check network connectivity

#### Session expired
- **Cause**: Session not used for 30+ minutes
- **Solution**: Create new session by omitting `session_id`

#### OpenAI API errors
- **Cause**: Invalid API key, rate limits, or API issues
- **Solution**: 
  - Verify `OPENAI_API_KEY` environment variable
  - Check API status and rate limits
  - Review error logs for specific API error details

### Debug Mode

Enable detailed logging in local development:

```bash
functions-framework --target=query --debug
```

Check logs for:
- LLM prompts and responses
- Generated SQL queries
- Validation results
- Database query execution
- Error stack traces

---

## Future Enhancements

### Planned Features

1. **Query History**: Store and retrieve past queries
2. **Query Suggestions**: Suggest similar queries
3. **Result Export**: Export query results to CSV/Excel
4. **Query Explanation**: Explain what the SQL query does
5. **Multi-turn Conversations**: Better context handling for complex questions
6. **Query Templates**: Pre-defined query templates for common questions
7. **Performance Analytics**: Track query performance and optimize

### LLM Improvements

1. **Fine-tuning**: Fine-tune model on Skill Matrix-specific queries
2. **Few-shot Examples**: Add example queries to prompts
3. **Schema Updates**: Automatic schema updates when database changes
4. **Query Optimization**: LLM generates optimized SQL queries

---

## Contact

For issues or questions, contact the backend development team or create an issue in the project repository.
