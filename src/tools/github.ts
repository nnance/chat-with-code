import { Octokit } from 'octokit';

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  clone_url: string;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  size: number;
  created_at: string;
  updated_at: string;
}

export interface FileContent {
  name: string;
  path: string;
  content: string;
  encoding: string;
  size: number;
  sha: string;
}

export interface GitHubError extends Error {
  status?: number;
  response?: {
    data?: {
      message?: string;
      documentation_url?: string;
    };
  };
}

export class GitHubTool {
  private octokit: Octokit;

  constructor(token?: string) {
    if (!token) {
      throw new Error('GitHub token is required. Set GITHUB_TOKEN environment variable.');
    }

    this.octokit = new Octokit({
      auth: token,
    });
  }

  async getRepository(owner: string, repo: string): Promise<Repository> {
    try {
      const { data } = await this.octokit.rest.repos.get({
        owner,
        repo,
      });

      return {
        id: data.id,
        name: data.name,
        full_name: data.full_name,
        description: data.description,
        private: data.private,
        html_url: data.html_url,
        clone_url: data.clone_url,
        default_branch: data.default_branch,
        language: data.language,
        stargazers_count: data.stargazers_count,
        forks_count: data.forks_count,
        size: data.size,
        created_at: data.created_at,
        updated_at: data.updated_at,
      };
    } catch (error) {
      throw this.handleError(error as GitHubError);
    }
  }

  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<FileContent> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      if (Array.isArray(data)) {
        throw new Error(`Path "${path}" is a directory, not a file`);
      }

      if (data.type !== 'file') {
        throw new Error(`Path "${path}" is not a file`);
      }

      const content = data.encoding === 'base64' 
        ? Buffer.from(data.content, 'base64').toString('utf-8')
        : data.content;

      return {
        name: data.name,
        path: data.path,
        content,
        encoding: data.encoding,
        size: data.size,
        sha: data.sha,
      };
    } catch (error) {
      throw this.handleError(error as GitHubError);
    }
  }

  private handleError(error: GitHubError): Error {
    if (error.status === 404) {
      return new Error(`Resource not found: ${error.response?.data?.message || 'Not found'}`);
    }
    
    if (error.status === 401) {
      return new Error('Authentication failed. Check your GitHub token.');
    }
    
    if (error.status === 403) {
      return new Error(`Access forbidden: ${error.response?.data?.message || 'Forbidden'}`);
    }
    
    if (error.status === 422) {
      return new Error(`Invalid request: ${error.response?.data?.message || 'Unprocessable entity'}`);
    }

    return new Error(`GitHub API error: ${error.message}`);
  }
}