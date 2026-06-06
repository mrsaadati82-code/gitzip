import { Octokit } from 'octokit';
import { ExtractedFile } from './zip';

export const validateTokenAndGetUser = async (token: string) => {
  const octokit = new Octokit({ auth: token });
  try {
    const { data } = await octokit.rest.users.getAuthenticated();
    return { success: true, user: data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const fetchRepositories = async (token: string) => {
  const octokit = new Octokit({ auth: token });
  try {
    // Fetch up to 100 recent repos
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      sort: 'updated',
      per_page: 100,
    });
    return { success: true, repos: data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export const fetchBranches = async (token: string, owner: string, repo: string) => {
  const octokit = new Octokit({ auth: token });
  try {
    const { data } = await octokit.rest.repos.listBranches({
      owner,
      repo,
      per_page: 100,
    });
    return { success: true, branches: data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};

export interface UploadProgress {
  status: string;
  progress: number;
}

export const uploadToGitHub = async (
  token: string,
  owner: string,
  repo: string,
  branch: string,
  message: string,
  files: ExtractedFile[],
  basePath: string,
  committerName: string,
  committerEmail: string,
  onProgress: (progress: UploadProgress) => void
) => {
  const octokit = new Octokit({ auth: token });

  try {
    onProgress({ status: 'Fetching repository details...', progress: 10 });
    
    // 1. Get branch reference
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });
    const commitSha = refData.object.sha;

    // 2. Get commit tree
    const { data: commitData } = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: commitSha,
    });
    const baseTreeSha = commitData.tree.sha;

    onProgress({ status: 'Preparing files for upload...', progress: 20 });

    // 3. Create Blobs (Process in chunks to avoid overwhelming the browser/API)
    const tree: any[] = [];
    const chunkSize = 10;
    
    for (let i = 0; i < files.length; i += chunkSize) {
      const chunk = files.slice(i, i + chunkSize);
      
      onProgress({ 
        status: `Uploading files (${i + 1} to ${Math.min(i + chunkSize, files.length)} of ${files.length})...`, 
        progress: 20 + Math.floor((i / files.length) * 50) 
      });

      const chunkResults = await Promise.all(
        chunk.map(async (file) => {
          const { data: blobData } = await octokit.rest.git.createBlob({
            owner,
            repo,
            content: file.content,
            encoding: 'base64',
          });
          
          let filePath = file.path;
          if (basePath) {
            // Clean up basePath and filePath to combine them properly
            const cleanBasePath = basePath.replace(/^\/+/, '').replace(/\/+$/, '');
            filePath = cleanBasePath ? `${cleanBasePath}/${file.path}` : file.path;
          }

          return {
            path: filePath,
            mode: '100644',
            type: 'blob',
            sha: blobData.sha,
          };
        })
      );
      
      tree.push(...chunkResults);
    }

    onProgress({ status: 'Creating repository tree...', progress: 80 });

    // 4. Create new Tree
    const { data: newTree } = await octokit.rest.git.createTree({
      owner,
      repo,
      tree,
      base_tree: baseTreeSha,
    });

    onProgress({ status: 'Creating commit...', progress: 90 });

    // 5. Create new Commit
    const commitPayload: any = {
      owner,
      repo,
      message,
      tree: newTree.sha,
      parents: [commitSha],
    };
    
    if (committerName && committerEmail) {
      commitPayload.author = {
        name: committerName,
        email: committerEmail,
      };
      commitPayload.committer = {
        name: committerName,
        email: committerEmail,
      };
    }

    const { data: newCommit } = await octokit.rest.git.createCommit(commitPayload);

    onProgress({ status: 'Updating branch reference...', progress: 95 });

    // 6. Update Branch Reference
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${branch}`,
      sha: newCommit.sha,
    });

    onProgress({ status: 'Upload complete!', progress: 100 });
    
    return { success: true, url: newCommit.html_url };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
};
