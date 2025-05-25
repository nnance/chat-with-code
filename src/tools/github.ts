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

export interface DirectoryContent {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  size?: number;
  sha: string;
  url: string;
  html_url: string | null;
  download_url?: string | null;
}

export interface SearchOptions {
  per_page?: number;
  page?: number;
  sort?: 'updated' | 'stars' | 'forks';
  order?: 'asc' | 'desc';
}

export interface CodeSearchResult {
  name: string;
  path: string;
  sha: string;
  url: string;
  html_url: string;
  repository: {
    id: number;
    name: string;
    full_name: string;
    html_url: string;
  };
  score: number;
}

export interface Commit {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
    date: string;
  };
  committer: {
    name: string;
    email: string;
    date: string;
  };
  url: string;
  html_url: string;
}

export interface RepositoryArchive {
  downloadUrl: string;
  filename: string;
  ref: string;
  format: 'tarball' | 'zipball';
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
      throw new Error(
        'GitHub token is required. Set GITHUB_TOKEN environment variable.'
      );
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

  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<FileContent> {
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

      const content =
        data.encoding === 'base64'
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

  async downloadFile(
    owner: string,
    repo: string,
    path: string,
    ref?: string
  ): Promise<FileContent> {
    return this.getFileContent(owner, repo, path, ref);
  }

  async getRepositoryContents(
    owner: string,
    repo: string,
    path = '',
    ref?: string
  ): Promise<DirectoryContent[]> {
    try {
      const { data } = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      if (!Array.isArray(data)) {
        throw new Error(`Path "${path}" is a file, not a directory`);
      }

      return data.map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type as 'file' | 'dir' | 'symlink' | 'submodule',
        size: item.size,
        sha: item.sha,
        url: item.url,
        html_url: item.html_url,
        download_url: item.download_url,
      }));
    } catch (error) {
      throw this.handleError(error as GitHubError);
    }
  }

  async downloadDirectory(
    owner: string,
    repo: string,
    path = '',
    ref?: string
  ): Promise<FileContent[]> {
    try {
      const contents = await this.getRepositoryContents(owner, repo, path, ref);
      const files: FileContent[] = [];

      for (const item of contents) {
        if (item.type === 'file') {
          const fileContent = await this.downloadFile(
            owner,
            repo,
            item.path,
            ref
          );
          files.push(fileContent);
        } else if (item.type === 'dir') {
          const dirFiles = await this.downloadDirectory(
            owner,
            repo,
            item.path,
            ref
          );
          files.push(...dirFiles);
        }
      }

      return files;
    } catch (error) {
      throw this.handleError(error as GitHubError);
    }
  }

  async searchRepositories(
    query: string,
    options: SearchOptions = {}
  ): Promise<Repository[]> {
    try {
      const { data } = await this.octokit.rest.search.repos({
        q: query,
        per_page: options.per_page || 30,
        page: options.page || 1,
        sort: options.sort,
        order: options.order,
      });

      return data.items.map((item) => ({
        id: item.id,
        name: item.name,
        full_name: item.full_name,
        description: item.description,
        private: item.private,
        html_url: item.html_url,
        clone_url: item.clone_url,
        default_branch: item.default_branch,
        language: item.language,
        stargazers_count: item.stargazers_count,
        forks_count: item.forks_count,
        size: item.size,
        created_at: item.created_at,
        updated_at: item.updated_at,
      }));
    } catch (error) {
      throw this.handleError(error as GitHubError);
    }
  }

  async searchCode(
    query: string,
    owner?: string,
    repo?: string
  ): Promise<CodeSearchResult[]> {
    try {
      let searchQuery = query;
      if (owner && repo) {
        searchQuery += ` repo:${owner}/${repo}`;
      } else if (owner) {
        searchQuery += ` user:${owner}`;
      }

      const { data } = await this.octokit.rest.search.code({
        q: searchQuery,
        per_page: 30,
      });

      return data.items.map((item) => ({
        name: item.name,
        path: item.path,
        sha: item.sha,
        url: item.url,
        html_url: item.html_url,
        repository: {
          id: item.repository.id,
          name: item.repository.name,
          full_name: item.repository.full_name,
          html_url: item.repository.html_url,
        },
        score: item.score,
      }));
    } catch (error) {
      throw this.handleError(error as GitHubError);
    }
  }

  async getRepositoryArchive(
    owner: string,
    repo: string,
    format: 'tarball' | 'zipball' = 'zipball',
    ref?: string
  ): Promise<RepositoryArchive> {
    try {
      const response = await this.octokit.rest.repos.downloadArchive({
        owner,
        repo,
        archive_format: format,
        ref: ref || 'HEAD',
      });

      const downloadUrl = response.url;
      const filename = `${repo}-${ref || 'HEAD'}.${format === 'zipball' ? 'zip' : 'tar.gz'}`;

      return {
        downloadUrl,
        filename,
        ref: ref || 'HEAD',
        format,
      };
    } catch (error) {
      throw this.handleError(error as GitHubError);
    }
  }

  async downloadRepositoryArchive(
    owner: string,
    repo: string,
    format: 'tarball' | 'zipball' = 'zipball',
    ref?: string
  ): Promise<Buffer> {
    try {
      const archive = await this.getRepositoryArchive(owner, repo, format, ref);
      
      // Fetch the actual archive data
      const response = await fetch(archive.downloadUrl);
      if (!response.ok) {
        throw new Error(`Failed to download archive: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      throw this.handleError(error as GitHubError);
    }
  }

  async getFileHistory(
    owner: string,
    repo: string,
    path: string,
    options: { per_page?: number; page?: number } = {}
  ): Promise<Commit[]> {
    try {
      const { data } = await this.octokit.rest.repos.listCommits({
        owner,
        repo,
        path,
        per_page: options.per_page || 30,
        page: options.page || 1,
      });

      return data.map((commit) => ({
        sha: commit.sha,
        message: commit.commit.message,
        author: {
          name: commit.commit.author?.name || '',
          email: commit.commit.author?.email || '',
          date: commit.commit.author?.date || '',
        },
        committer: {
          name: commit.commit.committer?.name || '',
          email: commit.commit.committer?.email || '',
          date: commit.commit.committer?.date || '',
        },
        url: commit.url,
        html_url: commit.html_url,
      }));
    } catch (error) {
      throw this.handleError(error as GitHubError);
    }
  }

  async getCommitDiff(
    owner: string,
    repo: string,
    ref: string
  ): Promise<string> {
    try {
      const { data } = await this.octokit.rest.repos.getCommit({
        owner,
        repo,
        ref,
        mediaType: {
          format: 'diff',
        },
      });

      return data as unknown as string;
    } catch (error) {
      throw this.handleError(error as GitHubError);
    }
  }

  async compareCommits(
    owner: string,
    repo: string,
    base: string,
    head: string
  ): Promise<string> {
    try {
      const { data } = await this.octokit.rest.repos.compareCommits({
        owner,
        repo,
        base,
        head,
        mediaType: {
          format: 'diff',
        },
      });

      return data as unknown as string;
    } catch (error) {
      throw this.handleError(error as GitHubError);
    }
  }

  private handleError(error: GitHubError): Error {
    if (error.status === 404) {
      return new Error(
        `Resource not found: ${error.response?.data?.message || 'Not found'}`
      );
    }

    if (error.status === 401) {
      return new Error('Authentication failed. Check your GitHub token.');
    }

    if (error.status === 403) {
      return new Error(
        `Access forbidden: ${error.response?.data?.message || 'Forbidden'}`
      );
    }

    if (error.status === 422) {
      return new Error(
        `Invalid request: ${error.response?.data?.message || 'Unprocessable entity'}`
      );
    }

    return new Error(`GitHub API error: ${error.message}`);
  }
}
