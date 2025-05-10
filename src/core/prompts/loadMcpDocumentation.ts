import { McpHub } from "@services/mcp/McpHub"

export async function loadMcpDocumentation(mcpHub: McpHub) {
	return `## 创建MCP服务器

创建MCP服务器时，需要理解它们运行在非交互式环境中。服务器无法在运行时启动OAuth流程、打开浏览器窗口或提示用户输入。所有凭证和认证令牌必须通过MCP设置配置中的环境变量预先提供。例如，Spotify的API使用OAuth获取用户的刷新令牌，但MCP服务器无法启动此流程。虽然可以引导用户获取应用程序客户端ID和密钥，但可能需要创建一个单独的一次性设置脚本（如get-refresh-token.js），该脚本捕获并记录最终的关键部分：用户的刷新令牌（例如，可以使用execute_command运行脚本，打开浏览器进行认证，然后记录刷新令牌，以便在命令输出中查看并将其用于MCP设置配置）。

除非用户另有指定，新的MCP服务器应创建在：${await mcpHub.getMcpServersPath()}

### MCP服务器示例

例如，如果用户希望赋予你获取天气信息的能力，可以创建一个使用OpenWeather API的MCP服务器，将其添加到MCP设置配置文件中，然后注意到系统提示中现在可以使用新的工具和资源来展示新功能。

以下示例演示了如何构建一个提供天气数据功能的MCP服务器。虽然此示例展示了如何实现资源、资源模板和工具，但在实践中应优先使用工具，因为它们更灵活且能处理动态参数。资源和资源模板的实现主要用于展示MCP的不同功能，实际的天气服务器可能仅暴露获取天气数据的工具。（以下步骤适用于macOS）

1. 使用\`create-typescript-server\`工具在默认MCP服务器目录中初始化新项目：

\`\`\`bash
cd ${await mcpHub.getMcpServersPath()}
npx @modelcontextprotocol/create-server weather-server
cd weather-server
# 安装依赖
npm install axios
\`\`\`

这将创建一个具有以下结构的新项目：

\`\`\`
weather-server/
  ├── package.json
      {
        ...
        "type": "module", // 默认添加，使用ES模块语法（import/export）而非CommonJS（require/module.exports）（如果在此服务器仓库中创建额外脚本如get-refresh-token.js脚本，这一点很重要）
        "scripts": {
          "build": "tsc && node -e \"require('fs').chmodSync('build/index.js', '755')\"",
          ...
        }
        ...
      }
  ├── tsconfig.json
  └── src/
      └── weather-server/
          └── index.ts      # 主服务器实现
\`\`\`

2. 将\`src/index.ts\`替换为以下内容：

\`\`\`typescript
#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

const API_KEY = process.env.OPENWEATHER_API_KEY; // 由MCP配置提供
if (!API_KEY) {
  throw new Error('OPENWEATHER_API_KEY environment variable is required');
}

interface OpenWeatherResponse {
  main: {
    temp: number;
    humidity: number;
  };
  weather: [{ description: string }];
  wind: { speed: number };
  dt_txt?: string;
}

const isValidForecastArgs = (
  args: any
): args is { city: string; days?: number } =>
  typeof args === 'object' &&
  args !== null &&
  typeof args.city === 'string' &&
  (args.days === undefined || typeof args.days === 'number');

class WeatherServer {
  private server: Server;
  private axiosInstance;

  constructor() {
    this.server = new Server(
      {
        name: 'example-weather-server',
        version: '0.1.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    this.axiosInstance = axios.create({
      baseURL: 'http://api.openweathermap.org/data/2.5',
      params: {
        appid: API_KEY,
        units: 'metric',
      },
    });

    this.setupResourceHandlers();
    this.setupToolHandlers();
    
    // 错误处理
    this.server.onerror = (error) => console.error('[MCP Error]', error);
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  // MCP资源表示MCP服务器希望提供给客户端的任何UTF-8编码数据，如数据库记录、API响应、日志文件等。服务器可以通过静态URI定义直接资源，或通过遵循格式\`[protocol]://[host]/[path]\`的URI模板定义动态资源。
  private setupResourceHandlers() {
    // 对于静态资源，服务器可以暴露资源列表：
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        // 这是一个不太好的示例，因为可以使用资源模板获取相同信息，但这展示了如何定义静态资源
        {
          uri: \`weather://San Francisco/current\`, // 旧金山天气资源的唯一标识符
          name: \`Current weather in San Francisco\`, // 人类可读名称
          mimeType: 'application/json', // 可选的MIME类型
          // 可选描述
          description:
            'Real-time weather data for San Francisco including temperature, conditions, humidity, and wind speed',
        },
      ],
    }));

    // 对于动态资源，服务器可以暴露资源模板：
    this.server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async () => ({
        resourceTemplates: [
          {
            uriTemplate: 'weather://{city}/current', // URI模板（RFC 6570）
            name: 'Current weather for a given city', // 人类可读名称
            mimeType: 'application/json', // 可选的MIME类型
            description: 'Real-time weather data for a specified city', // 可选描述
          },
        ],
      })
    );

    // ReadResourceRequestSchema用于静态资源和动态资源模板
    this.server.setRequestHandler(
      ReadResourceRequestSchema,
      async (request) => {
        const match = request.params.uri.match(
          /^weather:\/\/([^/]+)\/current$/
        );
        if (!match) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            \`Invalid URI format: \${request.params.uri}\`
          );
        }
        const city = decodeURIComponent(match[1]);

        try {
          const response = await this.axiosInstance.get(
            'weather', // 当前天气
            {
              params: { q: city },
            }
          );

          return {
            contents: [
              {
                uri: request.params.uri,
                mimeType: 'application/json',
                text: JSON.stringify(
                  {
                    temperature: response.data.main.temp,
                    conditions: response.data.weather[0].description,
                    humidity: response.data.main.humidity,
                    wind_speed: response.data.wind.speed,
                    timestamp: new Date().toISOString(),
                  },
                  null,
                  2
                ),
              },
            ],
          };
        } catch (error) {
          if (axios.isAxiosError(error)) {
            throw new McpError(
              ErrorCode.InternalError,
              \`Weather API error: \${
                error.response?.data.message ?? error.message
              }\`
            );
          }
          throw error;
        }
      }
    );
  }

  /* MCP工具使服务器能够向系统暴露可执行功能。通过这些工具，可以与外部系统交互、执行计算并在现实世界中采取行动。
   * - 与资源类似，工具通过唯一名称标识，并可包含描述以指导使用。但与资源不同，工具表示可以修改状态或与外部系统交互的动态操作。
   * - 虽然资源和工具相似，但在可能的情况下应优先创建工具，因为它们提供更多灵活性。
   */
  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_forecast', // 唯一标识符
          description: 'Get weather forecast for a city', // 人类可读描述
          inputSchema: {
            // 参数的JSON Schema
            type: 'object',
            properties: {
              city: {
                type: 'string',
                description: 'City name',
              },
              days: {
                type: 'number',
                description: 'Number of days (1-5)',
                minimum: 1,
                maximum: 5,
              },
            },
            required: ['city'], // 必需属性名称数组
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (request.params.name !== 'get_forecast') {
        throw new McpError(
          ErrorCode.MethodNotFound,
          \`Unknown tool: \${request.params.name}\`
        );
      }

      if (!isValidForecastArgs(request.params.arguments)) {
        throw new McpError(
          ErrorCode.InvalidParams,
          'Invalid forecast arguments'
        );
      }

      const city = request.params.arguments.city;
      const days = Math.min(request.params.arguments.days || 3, 5);

      try {
        const response = await this.axiosInstance.get<{
          list: OpenWeatherResponse[];
        }>('forecast', {
          params: {
            q: city,
            cnt: days * 8,
          },
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data.list, null, 2),
            },
          ],
        };
      } catch (error) {
        if (axios.isAxiosError(error)) {
          return {
            content: [
              {
                type: 'text',
                text: \`Weather API error: \${
                  error.response?.data.message ?? error.message
                }\`,
              },
            ],
            isError: true,
          };
        }
        throw error;
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Weather MCP server running on stdio');
  }
}

const server = new WeatherServer();
server.run().catch(console.error);
\`\`\`

（记住：这只是一个示例——可以使用不同的依赖项，将实现拆分为多个文件等。）

3. 构建并编译可执行的JavaScript文件

\`\`\`bash
npm run build
\`\`\`

4. 当需要环境变量（如API密钥）来配置MCP服务器时，引导用户完成获取密钥的过程。例如，他们可能需要创建账户并前往开发者仪表板生成密钥。提供逐步说明和URL，使用户能轻松获取必要信息。然后使用ask_followup_question工具向用户询问密钥，本例中为OpenWeather API密钥。

5. 通过将MCP服务器配置添加到位于'${await mcpHub.getMcpSettingsFilePath()}'的设置文件中来安装MCP服务器。设置文件可能已配置其他MCP服务器，因此需要先读取文件，然后将新服务器添加到现有的\`mcpServers\`对象中。

重要提示：无论MCP设置文件中有什么内容，新创建的MCP服务器必须默认设置为disabled=false和autoApprove=[]。

\`\`\`json
{
  "mcpServers": {
    ...,
    "weather": {
      "command": "node",
      "args": ["/path/to/weather-server/build/index.js"],
      "env": {
        "OPENWEATHER_API_KEY": "user-provided-api-key"
      }
    },
  }
}
\`\`\`

（注意：用户也可能要求你将MCP服务器安装到Claude桌面应用程序中，例如在macOS上需要读取然后修改\`~/Library/Application Support/Claude/claude_desktop_config.json\`。其格式与顶层的\`mcpServers\`对象相同。）

6. 编辑MCP设置配置文件后，系统将自动运行所有服务器，并在"Connected MCP Servers"部分暴露可用工具和资源。（注意：如果测试新安装的MCP服务器时遇到"not connected"错误，常见原因是MCP设置配置中的构建路径不正确。由于编译后的JavaScript文件通常输出到'dist/'或'build/'目录，请仔细检查MCP设置中的构建路径是否与实际编译文件的位置匹配。例如，如果假设文件夹为'build'，请检查tsconfig.json是否使用了'dist'。）

7. 现在可以访问这些新工具和资源，可以建议用户如何命令你调用它们——例如，有了这个新的天气工具，可以邀请用户询问"旧金山的天气怎么样？"

## 编辑MCP服务器

用户可能要求添加工具或资源，这些可能适合添加到现有的MCP服务器（列在下面的"Connected MCP Servers"中：${
		mcpHub
			.getServers()
			.filter((server) => server.status === "connected")
			.map((server) => server.name)
			.join(", ") || "(None running currently)"
	}，例如如果使用相同的API。如果能通过查看服务器参数中的文件路径在用户系统上定位MCP服务器仓库，这是可能的。然后可以使用list_files和read_file探索仓库中的文件，并使用replace_in_file修改文件。

然而，某些MCP服务器可能是从安装的包而非本地仓库运行的，此时创建新的MCP服务器可能更合适。

# MCP服务器并非总是必要

用户可能不总是要求使用或创建MCP服务器。相反，他们可能提供可以使用现有工具完成的任务。虽然使用MCP SDK扩展能力很有用，但需要理解这只是可以完成的一种特殊任务类型。仅当用户明确请求时才应实现MCP服务器（例如，"添加一个工具来..."）。

记住：上述MCP文档和示例旨在帮助你理解和使用现有的MCP服务器，或在用户请求时创建新的MCP服务器。你已经可以访问用于完成广泛任务的工具和能力。`
}