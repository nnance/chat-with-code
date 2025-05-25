import type { AgentContext, AgentRequest, AgentResponse } from '@agentuity/sdk';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { GitHubTool } from '../../tools/github.js';

export const welcome = () => {
  return {
    welcome:
      "Welcome to the Vercel AI SDK with Anthropic Agent! I can help you build AI-powered applications using Vercel's AI SDK with Claude models.",
    prompts: [
      {
        data: 'How do I implement streaming responses with Claude models?',
        contentType: 'text/plain',
      },
      {
        data: 'What are the best practices for prompt engineering with Claude?',
        contentType: 'text/plain',
      },
    ],
  };
};

export default async function Agent(
  req: AgentRequest,
  resp: AgentResponse,
  ctx: AgentContext
) {
  try {
    const userMessage = (await req.data.text()) ?? 'Hello, Claude';
    
    // Initialize GitHub tool if token is available
    let githubTool: GitHubTool | null = null;
    if (process.env.GITHUB_TOKEN) {
      try {
        githubTool = new GitHubTool(process.env.GITHUB_TOKEN);
      } catch (error) {
        ctx.logger.warn('GitHub tool not available:', error);
      }
    }

    // Enhanced system prompt with GitHub capabilities
    const systemPrompt = `You are a helpful AI assistant with GitHub repository access capabilities.

${githubTool ? `You have access to a GitHub tool that can:
- Retrieve repository information and metadata
- Download individual files or entire directories  
- Search repositories and code across GitHub
- Get file history and commit diffs
- Download repository archives (zip/tarball)

When users ask about code repositories, GitHub projects, or want to analyze code, you can use these capabilities to help them.` : 'GitHub integration is not available (no GITHUB_TOKEN provided).'}

Provide concise and accurate information to help users with their requests.`;

    let tools = {};
    
    if (githubTool) {
      tools = {
        getRepository: tool({
          description: 'Get repository information and metadata',
          parameters: z.object({
            owner: z.string().describe('Repository owner/organization'),
            repo: z.string().describe('Repository name'),
          }),
          execute: async ({ owner, repo }) => {
            return await githubTool.getRepository(owner, repo);
          },
        }),
        downloadFile: tool({
          description: 'Download a single file from a repository',
          parameters: z.object({
            owner: z.string().describe('Repository owner/organization'),
            repo: z.string().describe('Repository name'),
            path: z.string().describe('File path in repository'),
            ref: z.string().optional().describe('Branch, tag, or commit SHA'),
          }),
          execute: async ({ owner, repo, path, ref }) => {
            return await githubTool.downloadFile(owner, repo, path, ref);
          },
        }),
        searchRepositories: tool({
          description: 'Search for repositories on GitHub',
          parameters: z.object({
            query: z.string().describe('Search query'),
            options: z.object({
              per_page: z.number().optional().describe('Results per page (1-100)'),
              page: z.number().optional().describe('Page number'),
              sort: z.enum(['updated', 'stars', 'forks']).optional().describe('Sort criteria'),
              order: z.enum(['asc', 'desc']).optional().describe('Sort order'),
            }).optional(),
          }),
          execute: async ({ query, options }) => {
            return await githubTool.searchRepositories(query, options);
          },
        }),
        searchCode: tool({
          description: 'Search for code within repositories',
          parameters: z.object({
            query: z.string().describe('Code search query'),
            owner: z.string().optional().describe('Repository owner'),
            repo: z.string().optional().describe('Repository name'),
          }),
          execute: async ({ query, owner, repo }) => {
            return await githubTool.searchCode(query, owner, repo);
          },
        }),
      };
    }

    const result = await generateText({
      model: anthropic('claude-3-7-sonnet-latest'),
      system: systemPrompt,
      prompt: userMessage,
      ...(githubTool && { tools, toolChoice: 'auto' as const }),
    });

    return resp.text(result.text);
  } catch (error) {
    ctx.logger.error('Error running agent:', error);

    return resp.text('Sorry, there was an error processing your request.');
  }
}
