import React, { useState } from 'react';
import { Github, ArrowRight, Lock } from 'lucide-react';
import { validateToken } from '../services/githubService';
import { User } from '../types';

interface LoginModalProps {
  onLogin: (user: User, token: string) => void;
  onSkip: () => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ onLogin, onSkip }) => {
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setLoading(true);
    setError('');
    
    try {
      const user = await validateToken(token);
      onLogin(user, token);
    } catch (err) {
      setError('Invalid Personal Access Token. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gk-bg">
      <div className="w-full max-w-md bg-gk-panel border border-gk-header p-8 rounded-xl shadow-2xl">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4 text-white">
            <Github className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-200">Connect to GitHub</h1>
          <p className="text-gray-500 text-sm mt-2 text-center max-w-xs">
            Enter your Personal Access Token (PAT). Your username and profile will be automatically detected.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Personal Access Token</label>
            <div className="relative">
              <Lock className="absolute left-3 top-2.5 w-4 h-4 text-gray-600" />
              <input 
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_..."
                className="w-full bg-gk-bg border border-white/10 rounded pl-9 pr-4 py-2 text-white focus:border-gk-accent focus:outline-none placeholder-gray-700"
                autoFocus
              />
            </div>
          </div>

          {error && (
            <div className="text-xs text-gk-red font-medium">{error}</div>
          )}

          <button 
            type="submit"
            disabled={loading || !token}
            className={`w-full py-2.5 rounded font-bold text-gk-bg flex items-center justify-center transition-all ${
              loading || !token ? 'bg-gray-600 cursor-not-allowed' : 'bg-gk-accent hover:bg-opacity-90'
            }`}
          >
            {loading ? 'Connecting...' : 'Connect Account'}
            {!loading && <ArrowRight className="w-4 h-4 ml-2" />}
          </button>
        </form>

        {/* Token Scope Notes */}
        <div className="mt-6 bg-gk-bg/50 border border-white/5 rounded-lg p-4">
          <div className="text-xs font-bold text-gray-400 mb-2">Required Token Scopes:</div>
          <div className="text-[11px] text-gray-500 space-y-1">
            <div className="flex items-start">
              <span className="text-gk-accent mr-2">•</span>
              <span><strong className="text-gray-400">repo</strong> - Full repository access (clone, push, pull)</span>
            </div>
            <div className="flex items-start">
              <span className="text-gk-accent mr-2">•</span>
              <span><strong className="text-gray-400">workflow</strong> - View and manage GitHub Actions</span>
            </div>
            <div className="flex items-start">
              <span className="text-gk-accent mr-2">•</span>
              <span><strong className="text-gray-400">read:user</strong> - Read your profile information</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const electronAPI = (window as any).electronAPI;
              const url = 'https://github.com/settings/tokens/new?scopes=repo,workflow,read:user&description=GitKraken-ish%20Desktop';
              if (electronAPI?.openExternal) {
                electronAPI.openExternal(url);
              } else {
                window.open(url, '_blank');
              }
            }}
            className="mt-3 text-xs text-gk-blue hover:text-gk-blue/80 hover:underline cursor-pointer bg-transparent border-none"
          >
            Generate token with correct scopes →
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;