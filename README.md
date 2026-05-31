# Eccentric Agent CLI: Your Intelligent Command-Line Assistant

`eccentric-agent` is a smart assistant that lives in your computer's command-line. Think of it as a helpful digital
colleague that can understand your requests and use various artificial intelligence (AI) tools to get things done. It's
designed to make complex tasks simpler and faster, right from your keyboard.

## What can Eccentric Agent do for you?

This project helps bridge the gap between powerful AI technologies and everyday tasks. It's particularly useful for:

* **Tapping into Multiple AI Brains:** Instead of being limited to one AI, `eccentric-agent` can work with different
  popular AI services like Google Vertex AI, OpenAI, and Ollama. This means it can choose the best AI for your specific
  task, giving you more accurate and diverse results.
* **Easy-to-Use Interface:** Even though it's a command-line tool, we've made it interactive and user-friendly. You
  won't just be typing commands; you'll have a helpful back-and-forth conversation with the agent, making it easy to
  guide and get feedback.
* **Smart Web Research:** Need to find information online? `eccentric-agent` can intelligently browse and extract
  information from websites, saving you time and effort. It's like having a research assistant that can quickly pull out
  the key details you need.
* **Flexible and Customizable:** Everyone has different needs. This agent is built to be easily adapted and expanded. If
  you have a unique task or want to connect it to other tools, it's designed to be flexible enough to grow with you.

## How to Get Started (for the curious)

While `eccentric-agent` is designed to be user-friendly, setting it up does involve some basic computer steps. If you're
comfortable with following instructions, you can get it running.

### What you'll need:

* **Node.js:** A program that helps run JavaScript applications. (Version 18 or newer is best)
* **pnpm:** A tool to quickly install and manage the agent's necessary components.

### Installation Steps:

1. **Get the Agent's Code:** Open your computer's terminal (like Command Prompt on Windows or Terminal on Mac) and type:

   ```bash
   git clone https://github.com/your-username/eccentric-agent.git
   cd eccentric-agent
   ```

   This downloads the agent's "brain" to your computer.

2. **Install its Tools:**

   ```bash
   pnpm install
   ```

   This command tells `pnpm` to gather all the necessary software and tools the agent needs to operate.

### Setting Up Your AI Connections:

`eccentric-agent` needs to know how to talk to the AI services. You'll create a simple file called `.env` in the agent's
folder and add your special "API keys" for the AI services you want to use. Think of these as unique passwords that let
the agent access the AI's capabilities.

```
GOOGLE_VERTEX_PROJECT="your project"
GOOGLE_VERTEX_LOCATION="location of project, e.g., europe-west4"
GEMINI_API_KEY="the API key"
OPENAI_API_KEY="your OpenAI API key"
```

### Using the Agent:

Once set up, you can start `eccentric-agent` by typing:

```bash
pnpm start
```

Then, you can begin interacting with it right in your command-line!

## Want to Contribute?

If you're a developer and interested in making `eccentric-agent` even better, we welcome your contributions! Please see
our [CONTRIBUTING.md](CONTRIBUTING.md) guide for how to help out.

## License

This project operates under the MIT License, which means it's open for anyone to use, modify, and distribute. You can
find the full details in the [LICENSE](LICENSE) file.
