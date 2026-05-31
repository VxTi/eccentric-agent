# Eccentric Agent CLI

`eccentric-agent` is a powerful and versatile AI agent framework designed to streamline the development and deployment of AI-powered applications. Leveraging various AI SDKs (Google Vertex AI, OpenAI, Ollama), it provides a robust foundation for building intelligent systems with rich command-line interfaces.

## What the project does: Clear project title and description

## Why the project is useful: Key features and benefits

*   **Multi-AI Provider Support:** Seamlessly integrate with Google Vertex AI, OpenAI, and Ollama for diverse AI capabilities.
*   **Rich CLI Experience:** Built with React and Ink, offering an interactive and engaging command-line user interface.
*   **Web Scraping Capabilities:** Utilize `cheerio` for efficient parsing and manipulation of web content.
*   **Modular and Extensible:** Designed for easy expansion and customization to fit various project needs.
*   **TypeScript-first:** Fully typed codebase for enhanced developer experience and maintainability.

## How users can get started: Installation/setup instructions with usage examples

To get started with `eccentric-agent`, follow these steps:

### Prerequisites

*   Node.js (version 18 or higher)
*   pnpm (performant package manager)

### Installation

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/your-username/eccentric-agent.git
    cd eccentric-agent
    ```

2.  **Install dependencies using pnpm:**

    ```bash
    pnpm install
    ```

### Configuration

This project uses `dotenv` for environment variable management. Create a `.env` file in the root directory of the project and add your API keys and other configurations:

```
GOOGLE_VERTEX_PROJECT="your project"
GOOGLE_VERTEX_LOCATION="location of project, e.g., europe-west4"
GEMINI_API_KEY="the API key"
```

### Usage

To run the agent, use the `start` script:

```bash
pnpm start
```

### Building the Project

To build the project for production, use the `build` script:

```bash
pnpm build
```

This will generate a bundled JavaScript file in the `dist` directory.

## Who maintains and contributes: Maintainer information and contribution guidelines

### Maintainers

*   [VxTi] - Initial development and primary maintenance.

### Contributing

We welcome contributions to `eccentric-agent`! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to submit pull requests, report bugs, and suggest new features.

## License

This project is licensed under the [Your License Here] - see the [LICENSE](LICENSE) file for details.
