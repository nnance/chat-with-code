import type { AgentContext, AgentRequest, AgentResponse } from '@agentuity/sdk';
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { GitHubTool } from '../../tools/github.js';

export default async function Agent(
  req: AgentRequest,
  resp: AgentResponse,
  ctx: AgentContext
) {
  try {
    const userMessage = await req.data.text();
    if (!userMessage) {
      return resp.text('Error: No text input provided in the request.');
    }
    
    // Initialize GitHub tool - require token
    if (!process.env.GITHUB_TOKEN) {
      return resp.text('Error: GITHUB_TOKEN environment variable is required.');
    }
    
    let githubTool: GitHubTool;
    try {
      githubTool = new GitHubTool(process.env.GITHUB_TOKEN);
    } catch (error) {
      ctx.logger.error('Failed to initialize GitHub tool:', error);
      return resp.text('Error: Failed to initialize GitHub integration.');
    }

    // Enhanced system prompt with GitHub capabilities
    const systemPrompt = `You are a helpful AI assistant with GitHub repository access capabilities.

You have access to a GitHub tool that can:
- Retrieve repository information and metadata
- Get file content and list directory contents
- Download individual files or entire directories recursively
- Search repositories and code across GitHub
- Get file history and commit diffs
- Compare commits and get diffs between them
- Download repository archives (zip/tarball)

When users ask about code repositories, GitHub projects, or want to analyze code, you can use these capabilities to help them.

Provide concise and accurate information to help users with their requests.`;

    const tools = {
        getRepository: tool({
          description: 'Get repository information and metadata',
          parameters: z.object({
            owner: z.string().describe('Repository owner/organization'),
            repo: z.string().describe('Repository name'),
          }),
          execute: async ({ owner, repo }) => {
            ctx.logger.info(`Calling getRepository: ${owner}/${repo}`);
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
            ctx.logger.info(`Calling downloadFile: ${owner}/${repo}/${path}${ref ? ` (ref: ${ref})` : ''}`);
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
            ctx.logger.info(`Calling searchRepositories: "${query}"`);
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
            ctx.logger.info(`Calling searchCode: "${query}"${owner && repo ? ` in ${owner}/${repo}` : ''}`);
            return await githubTool.searchCode(query, owner, repo);
          },
        }),
        getFileContent: tool({
          description: 'Get file content from a repository',
          parameters: z.object({
            owner: z.string().describe('Repository owner/organization'),
            repo: z.string().describe('Repository name'),
            path: z.string().describe('File path in repository'),
            ref: z.string().optional().describe('Branch, tag, or commit SHA'),
          }),
          execute: async ({ owner, repo, path, ref }) => {
            ctx.logger.info(`Calling getFileContent: ${owner}/${repo}/${path}${ref ? ` (ref: ${ref})` : ''}`);
            return await githubTool.getFileContent(owner, repo, path, ref);
          },
        }),
        getRepositoryContents: tool({
          description: 'List contents of a directory in a repository',
          parameters: z.object({
            owner: z.string().describe('Repository owner/organization'),
            repo: z.string().describe('Repository name'),
            path: z.string().optional().describe('Directory path (empty for root)'),
            ref: z.string().optional().describe('Branch, tag, or commit SHA'),
          }),
          execute: async ({ owner, repo, path, ref }) => {
            ctx.logger.info(`Calling getRepositoryContents: ${owner}/${repo}${path ? `/${path}` : ''}${ref ? ` (ref: ${ref})` : ''}`);
            return await githubTool.getRepositoryContents(owner, repo, path, ref);
          },
        }),
        downloadDirectory: tool({
          description: 'Download all files in a directory recursively',
          parameters: z.object({
            owner: z.string().describe('Repository owner/organization'),
            repo: z.string().describe('Repository name'),
            path: z.string().optional().describe('Directory path (empty for root)'),
            ref: z.string().optional().describe('Branch, tag, or commit SHA'),
          }),
          execute: async ({ owner, repo, path, ref }) => {
            ctx.logger.info(`Calling downloadDirectory: ${owner}/${repo}${path ? `/${path}` : ''}${ref ? ` (ref: ${ref})` : ''}`);
            return await githubTool.downloadDirectory(owner, repo, path, ref);
          },
        }),
        getRepositoryArchive: tool({
          description: 'Get download URL for repository archive',
          parameters: z.object({
            owner: z.string().describe('Repository owner/organization'),
            repo: z.string().describe('Repository name'),
            format: z.enum(['tarball', 'zipball']).optional().describe('Archive format'),
            ref: z.string().optional().describe('Branch, tag, or commit SHA'),
          }),
          execute: async ({ owner, repo, format, ref }) => {
            ctx.logger.info(`Calling getRepositoryArchive: ${owner}/${repo} (${format || 'tarball'})${ref ? ` (ref: ${ref})` : ''}`);
            return await githubTool.getRepositoryArchive(owner, repo, format, ref);
          },
        }),
        downloadRepositoryArchive: tool({
          description: 'Download repository archive as Buffer',
          parameters: z.object({
            owner: z.string().describe('Repository owner/organization'),
            repo: z.string().describe('Repository name'),
            format: z.enum(['tarball', 'zipball']).optional().describe('Archive format'),
            ref: z.string().optional().describe('Branch, tag, or commit SHA'),
          }),
          execute: async ({ owner, repo, format, ref }) => {
            ctx.logger.info(`Calling downloadRepositoryArchive: ${owner}/${repo} (${format || 'tarball'})${ref ? ` (ref: ${ref})` : ''}`);
            return await githubTool.downloadRepositoryArchive(owner, repo, format, ref);
          },
        }),
        getFileHistory: tool({
          description: 'Get commit history for a specific file',
          parameters: z.object({
            owner: z.string().describe('Repository owner/organization'),
            repo: z.string().describe('Repository name'),
            path: z.string().describe('File path in repository'),
            options: z.object({
              per_page: z.number().optional().describe('Results per page'),
              page: z.number().optional().describe('Page number'),
            }).optional(),
          }),
          execute: async ({ owner, repo, path, options }) => {
            ctx.logger.info(`Calling getFileHistory: ${owner}/${repo}/${path}`);
            return await githubTool.getFileHistory(owner, repo, path, options);
          },
        }),
        getCommitDiff: tool({
          description: 'Get diff for a specific commit',
          parameters: z.object({
            owner: z.string().describe('Repository owner/organization'),
            repo: z.string().describe('Repository name'),
            ref: z.string().describe('Commit SHA'),
          }),
          execute: async ({ owner, repo, ref }) => {
            ctx.logger.info(`Calling getCommitDiff: ${owner}/${repo} (${ref})`);
            return await githubTool.getCommitDiff(owner, repo, ref);
          },
        }),
        compareCommits: tool({
          description: 'Compare two commits and get diff',
          parameters: z.object({
            owner: z.string().describe('Repository owner/organization'),
            repo: z.string().describe('Repository name'),
            base: z.string().describe('Base commit SHA or branch'),
            head: z.string().describe('Head commit SHA or branch'),
          }),
          execute: async ({ owner, repo, base, head }) => {
            ctx.logger.info(`Calling compareCommits: ${owner}/${repo} (${base}...${head})`);
            return await githubTool.compareCommits(owner, repo, base, head);
          },
        }),
      };

    const result = await generateText({
      model: anthropic('claude-4-sonnet-20250514'),
      system: systemPrompt,
      prompt: userMessage,
      maxSteps: 30, // Allow multiple tool calls
      tools,
      toolChoice: 'auto' as const,
    });

    return resp.text(result.text);
  } catch (error) {
    ctx.logger.error('Error running agent:', error);

    return resp.text('Sorry, there was an error processing your request.');
  }
}
