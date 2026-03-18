# Model Context Protocol (MCP) Server

`mq-bridge-mcp` is a separate binary that implements the **Model Context Protocol (MCP)**, allowing AI assistants (like **Claude Desktop** or other MCP clients) to interact directly with your messaging infrastructure.

By running the MCP server, you can expose message brokers, databases, and APIs as **Tools** and **Resources** to an LLM.

- **Tools (Publishers)**: Allow the AI to send messages to systems (e.g., "Send an order to Kafka", "Post to Slack").
- **Resources (Consumers)**: Allow the AI to read data from systems (e.g., "Read the last 10 logs from the file", "Get messages from SQS").

## Configuration

The MCP server uses a distinct configuration format focused on `publishers` and `consumers` exposed to the AI.

**Example `mcp-config.yml`**:

```yaml
mcp:
  enabled: true
  transport: "stdio" # Options: "stdio" (for desktop apps), "streamable_http" (for Docker/remote)
  # bind: "0.0.0.0:3000" # Required if transport is "streamable_http"

# These become "Tools" that the AI can invoke
publishers:
  notify_slack:
    http:
      url: "https://hooks.slack.com/services/XXX/YYY"
    description: "Sends a notification message to the operations Slack channel."

  produce_kafka:
    kafka:
      url: "kafka:9092"
      topic: "ai-commands"
    description: "Publishes a command to the Kafka command topic."

# These become "Resources" that the AI can read
consumers:
  app_logs:
    file:
      path: "/var/log/app.log"
      mode: "subscribe" # Tail the file
    description: "Live application logs."
```

## Usage

### Claude Desktop (Stdio Mode)

To use the MCP server with Claude Desktop, configure it to run the `mq-bridge-mcp` binary in `stdio` mode.

```json
// claude_desktop_config.json
{
  "mcpServers": {
    "mq-bridge": {
      "command": "/path/to/mq-bridge-mcp",
      "args": ["--config", "/path/to/mcp-config.yml"]
    }
  }
}
```