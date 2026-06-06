import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Toaster, toast } from 'react-hot-toast';
import { 
  Key, FolderGit2, UploadCloud, CheckCircle2, 
  Settings2, Loader2, GitBranch, TerminalSquare, 
  FileArchive, FileText, Trash2, ArrowRight, ArrowLeft
} from 'lucide-react';
import { cn } from './lib/utils';
import { validateTokenAndGetUser, fetchRepositories, fetchBranches, uploadToGitHub, UploadProgress } from './lib/github';
import { extractZip, ExtractedFile } from './lib/zip';

type Step = 'AUTH' | 'TARGET' | 'UPLOAD' | 'PREVIEW' | 'PROCESS';

interface Config {
  token: string;
  owner: string;
  repo: string;
  branch: string;
  basePath: string;
  message: string;
  committerName: string;
  committerEmail: string;
}

const INIT_CONFIG: Config = {
  token: '',
  owner: '',
  repo: '',
  branch: '',
  basePath: '',
  message: 'Upload files via Zip to GitHub',
  committerName: '',
  committerEmail: '',
};

export default function App() {
  const [step, setStep] = useState<Step>('AUTH');
  const [config, setConfig] = useState<Config>(INIT_CONFIG);
  const [user, setUser] = useState<any>(null);
  
  const [repos, setRepos] = useState<any[]>([]);
  const [branches, setBranches] = useState<any[]>([]);
  
  const [files, setFiles] = useState<ExtractedFile[]>([]);
  const [zipName, setZipName] = useState('');
  
  const [progress, setProgress] = useState<UploadProgress>({ status: '', progress: 0 });
  const [resultUrl, setResultUrl] = useState('');

  const [isLoading, setIsLoading] = useState(false);

  // Load token from local storage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem('gh_uploader_token');
    if (savedToken) {
      setConfig(prev => ({ ...prev, token: savedToken }));
    }
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config.token) return toast.error('Please enter a GitHub Personal Access Token');
    
    setIsLoading(true);
    const res = await validateTokenAndGetUser(config.token);
    if (res.success && res.user) {
      setUser(res.user);
      setConfig(prev => ({ ...prev, owner: res.user!.login }));
      localStorage.setItem('gh_uploader_token', config.token);
      toast.success(`Welcome, ${res.user.name || res.user.login}!`);
      
      // Fetch repos
      const reposRes = await fetchRepositories(config.token);
      if (reposRes.success && reposRes.repos) {
        setRepos(reposRes.repos as any[]);
      }
      
      setStep('TARGET');
    } else {
      toast.error(res.error || 'Invalid token');
    }
    setIsLoading(false);
  };

  const handleRepoSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const repo = e.target.value;
    setConfig(prev => ({ ...prev, repo, branch: '' })); // reset branch
    if (repo) {
      const res = await fetchBranches(config.token, config.owner, repo);
      if (res.success && res.branches) {
        setBranches(res.branches as any[]);
        if (res.branches.length > 0) {
          // default to main or master if available, otherwise first branch
          const defaultBranch = res.branches.find((b: any) => b.name === 'main' || b.name === 'master');
          setConfig(prev => ({ ...prev, branch: defaultBranch ? defaultBranch.name : res.branches![0].name }));
        }
      }
    }
  };

  const handleTargetSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!config.repo) return toast.error('Please select a repository');
    if (!config.branch) return toast.error('Please select a branch');
    setStep('UPLOAD');
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    if (!file.name.endsWith('.zip')) {
      return toast.error('Please upload a ZIP file');
    }
    
    setIsLoading(true);
    try {
      const extracted = await extractZip(file);
      setFiles(extracted);
      setZipName(file.name);
      setStep('PREVIEW');
    } catch (err: any) {
      toast.error('Failed to extract ZIP: ' + err.message);
    }
    setIsLoading(false);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop, 
    accept: { 'application/zip': ['.zip', '.x-zip-compressed'] },
    maxFiles: 1 
  });

  const toggleFile = (path: string) => {
    setFiles(prev => prev.map(f => f.path === path ? { ...f, isSelected: !f.isSelected } : f));
  };

  const startUpload = async () => {
    const selectedFiles = files.filter(f => f.isSelected);
    if (selectedFiles.length === 0) return toast.error('No files selected');
    
    setStep('PROCESS');
    const res = await uploadToGitHub(
      config.token,
      config.owner,
      config.repo,
      config.branch,
      config.message,
      selectedFiles,
      config.basePath,
      config.committerName,
      config.committerEmail,
      setProgress
    );

    if (res.success) {
      toast.success('Upload completed successfully!');
      setResultUrl(res.url as string);
    } else {
      toast.error('Upload failed: ' + res.error);
      setStep('PREVIEW');
    }
  };

  const resetAll = () => {
    setStep('TARGET');
    setFiles([]);
    setZipName('');
    setProgress({ status: '', progress: 0 });
    setResultUrl('');
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      <Toaster position="top-center" />
      
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 text-indigo-600">
            <FolderGit2 className="w-6 h-6" />
            <h1 className="font-bold text-xl tracking-tight">GitZip Deploy</h1>
          </div>
          {user && (
            <div className="flex items-center gap-3 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
              <img src={user.avatar_url} alt="Avatar" className="w-6 h-6 rounded-full" />
              <span className="text-sm font-medium">{user.login}</span>
              <button 
                onClick={() => {
                  localStorage.removeItem('gh_uploader_token');
                  setConfig(INIT_CONFIG);
                  setUser(null);
                  setStep('AUTH');
                }}
                className="text-gray-400 hover:text-red-500 ml-2 transition-colors"
                title="Sign out"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-4 py-12">
        <AnimatePresence mode="wait">
          {step === 'AUTH' && (
            <motion.div 
              key="auth"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100"
            >
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-600">
                  <Key className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold mb-2">Connect to GitHub</h2>
                <p className="text-gray-500">Enter your Personal Access Token (PAT) with <code className="bg-gray-100 px-1 py-0.5 rounded text-sm">repo</code> scope.</p>
              </div>

              <form onSubmit={handleAuth} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Personal Access Token</label>
                  <input
                    type="password"
                    value={config.token}
                    onChange={(e) => setConfig(prev => ({ ...prev, token: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                    required
                  />
                  <p className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-green-500" /> Token is stored locally in your browser.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Authenticate'}
                </button>
              </form>
            </motion.div>
          )}

          {step === 'TARGET' && (
            <motion.div 
              key="target"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100"
            >
              <div className="flex items-center gap-3 mb-6">
                <Settings2 className="w-6 h-6 text-indigo-600" />
                <h2 className="text-2xl font-bold">Configure Target</h2>
              </div>

              <form onSubmit={handleTargetSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Repository</label>
                    <div className="relative">
                      <FolderGit2 className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                      <select
                        value={config.repo}
                        onChange={handleRepoSelect}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none appearance-none bg-white"
                        required
                      >
                        <option value="" disabled>Select a repository</option>
                        {repos.map(r => (
                          <option key={r.id} value={r.name}>{r.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                    <div className="relative">
                      <GitBranch className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                      <select
                        value={config.branch}
                        onChange={(e) => setConfig(prev => ({ ...prev, branch: e.target.value }))}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none appearance-none bg-white"
                        required
                        disabled={!config.repo}
                      >
                        <option value="" disabled>Select branch</option>
                        {branches.map(b => (
                          <option key={b.name} value={b.name}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Folder Path (Optional)</label>
                  <div className="relative">
                    <TerminalSquare className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={config.basePath}
                      onChange={(e) => setConfig(prev => ({ ...prev, basePath: e.target.value }))}
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="e.g., src/assets or leave blank for root"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Committer Name (Optional)</label>
                    <input
                      type="text"
                      value={config.committerName}
                      onChange={(e) => setConfig(prev => ({ ...prev, committerName: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Committer Email (Optional)</label>
                    <input
                      type="email"
                      value={config.committerEmail}
                      onChange={(e) => setConfig(prev => ({ ...prev, committerEmail: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Commit Message</label>
                  <input
                    type="text"
                    value={config.message}
                    onChange={(e) => setConfig(prev => ({ ...prev, message: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    required
                  />
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setStep('AUTH')}
                    className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                  <button
                    type="submit"
                    className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    Next Step <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {step === 'UPLOAD' && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100"
            >
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold mb-2">Upload ZIP File</h2>
                <p className="text-gray-500">We'll extract and prepare the files for upload.</p>
              </div>

              <div 
                {...getRootProps()} 
                className={cn(
                  "border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors duration-200",
                  isDragActive ? "border-indigo-500 bg-indigo-50" : "border-gray-300 hover:border-indigo-400 hover:bg-gray-50"
                )}
              >
                <input {...getInputProps()} />
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center">
                    <FileArchive className="w-8 h-8" />
                  </div>
                  {isLoading ? (
                    <div className="flex items-center gap-2 text-indigo-600 font-medium">
                      <Loader2 className="w-5 h-5 animate-spin" /> Extracting files...
                    </div>
                  ) : (
                    <div>
                      <p className="text-lg font-medium text-gray-700">Drag & drop your ZIP file here</p>
                      <p className="text-sm text-gray-400 mt-1">or click to browse files</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-6 flex justify-start">
                <button
                  type="button"
                  onClick={() => setStep('TARGET')}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-6 rounded-lg flex items-center gap-2 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
              </div>
            </motion.div>
          )}

          {step === 'PREVIEW' && (
            <motion.div 
              key="preview"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-2">
                    <FileArchive className="w-5 h-5 text-indigo-600" />
                    {zipName}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    {files.filter(f => f.isSelected).length} of {files.length} files selected
                  </p>
                </div>
                <div className="text-right text-sm text-gray-600">
                  Target: <span className="font-semibold text-gray-900">{config.repo}</span> / <span className="font-semibold text-gray-900">{config.branch}</span>
                  {config.basePath && <div>Path: <span className="font-semibold text-gray-900">{config.basePath}</span></div>}
                </div>
              </div>

              <div className="p-4 overflow-y-auto flex-1 bg-white" style={{ minHeight: '300px' }}>
                <div className="space-y-1">
                  {files.map((file, idx) => (
                    <label key={idx} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors group">
                      <input 
                        type="checkbox" 
                        checked={file.isSelected}
                        onChange={() => toggleFile(file.path)}
                        className="mt-1 w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                      />
                      <div className="flex-1 overflow-hidden">
                        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 group-hover:text-gray-900">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="truncate">{file.path}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5 ml-6">
                          {(file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="p-4 border-t border-gray-200 bg-gray-50 flex gap-3">
                <button
                  onClick={() => setStep('UPLOAD')}
                  className="px-6 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={startUpload}
                  disabled={files.filter(f => f.isSelected).length === 0}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                >
                  <UploadCloud className="w-5 h-5" /> Commit to GitHub
                </button>
              </div>
            </motion.div>
          )}

          {step === 'PROCESS' && (
            <motion.div 
              key="process"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-white p-10 rounded-2xl shadow-sm border border-gray-100 text-center"
            >
              {!resultUrl ? (
                <div>
                  <div className="relative w-24 h-24 mx-auto mb-6">
                    <svg className="animate-spin w-full h-full text-indigo-100" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <UploadCloud className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-10 h-10 text-indigo-600" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2 text-gray-800">Uploading Files</h2>
                  <p className="text-gray-500 mb-6 h-6">{progress.status}</p>
                  
                  <div className="w-full bg-gray-100 rounded-full h-2.5 mb-2 overflow-hidden">
                    <motion.div 
                      className="bg-indigo-600 h-2.5 rounded-full" 
                      initial={{ width: 0 }}
                      animate={{ width: `${progress.progress}%` }}
                      transition={{ duration: 0.3 }}
                    ></motion.div>
                  </div>
                  <div className="text-xs text-gray-400 text-right">{progress.progress}%</div>
                </div>
              ) : (
                <div className="py-6">
                  <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 className="w-10 h-10" />
                  </div>
                  <h2 className="text-3xl font-bold mb-3 text-gray-800">Upload Successful!</h2>
                  <p className="text-gray-500 mb-8">Your files have been committed to the repository.</p>
                  
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <a 
                      href={resultUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="bg-gray-900 hover:bg-black text-white font-medium py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                      <FolderGit2 className="w-5 h-5" /> View on GitHub
                    </a>
                    <button 
                      onClick={resetAll}
                      className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                      Upload Another
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
