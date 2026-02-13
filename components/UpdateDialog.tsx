import React, { useState } from 'react';
import { Download, X, ExternalLink, Clock, Sparkles, Bug, Wrench, Zap, ArrowRight, CheckCircle } from 'lucide-react';
import { ReleaseInfo, skipVersion, getDownloadUrl } from '../services/updateService';

interface UpdateDialogProps {
  isOpen: boolean;
  onClose: () => void;
  releaseInfo: ReleaseInfo;
  currentVersion: string;
}

const UpdateDialog: React.FC<UpdateDialogProps> = ({
  isOpen,
  onClose,
  releaseInfo,
  currentVersion
}) => {
  const [isClosing, setIsClosing] = useState(false);

  if (!isOpen) return null;

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  const handleUpdateNow = () => {
    const downloadUrl = getDownloadUrl(releaseInfo);
    if (downloadUrl) {
      window.open(downloadUrl, '_blank');
    }
    handleClose();
  };

  const handleSkipVersion = () => {
    skipVersion(releaseInfo.version);
    handleClose();
  };

  const handleRemindLater = () => {
    handleClose();
  };

  // Parse release notes into categories
  const parseReleaseNotes = (body: string) => {
    const sections: { type: string; icon: React.ReactNode; items: string[] }[] = [];
    const lines = body.split('\n').filter(l => l.trim());

    let currentSection: { type: string; icon: React.ReactNode; items: string[] } | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Check for section headers
      if (trimmed.toLowerCase().includes('feature') || trimmed.toLowerCase().includes('new')) {
        currentSection = { type: 'New Features', icon: <Sparkles className="w-4 h-4 text-purple-400" />, items: [] };
        sections.push(currentSection);
      } else if (trimmed.toLowerCase().includes('fix') || trimmed.toLowerCase().includes('bug')) {
        currentSection = { type: 'Bug Fixes', icon: <Bug className="w-4 h-4 text-red-400" />, items: [] };
        sections.push(currentSection);
      } else if (trimmed.toLowerCase().includes('improve') || trimmed.toLowerCase().includes('enhance')) {
        currentSection = { type: 'Improvements', icon: <Zap className="w-4 h-4 text-yellow-400" />, items: [] };
        sections.push(currentSection);
      } else if (trimmed.toLowerCase().includes('change') || trimmed.toLowerCase().includes('update')) {
        currentSection = { type: 'Changes', icon: <Wrench className="w-4 h-4 text-blue-400" />, items: [] };
        sections.push(currentSection);
      } else if (trimmed.startsWith('-') || trimmed.startsWith('*') || trimmed.startsWith('•')) {
        // List item
        const item = trimmed.replace(/^[-*•]\s*/, '').trim();
        if (item && currentSection) {
          currentSection.items.push(item);
        } else if (item) {
          // No section yet, create a default one
          if (!currentSection) {
            currentSection = { type: 'Updates', icon: <CheckCircle className="w-4 h-4 text-green-400" />, items: [] };
            sections.push(currentSection);
          }
          currentSection.items.push(item);
        }
      }
    }

    // If no sections found, create a single section with all content
    if (sections.length === 0 && body.trim()) {
      sections.push({
        type: 'What\'s New',
        icon: <Sparkles className="w-4 h-4 text-purple-400" />,
        items: body.split('\n').filter(l => l.trim()).map(l => l.replace(/^[-*•#]\s*/, '').trim()).filter(l => l)
      });
    }

    return sections;
  };

  const sections = parseReleaseNotes(releaseInfo.body);
  const publishDate = new Date(releaseInfo.published_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4`}>
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200 ${
          isClosing ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={handleClose}
      />

      {/* Dialog */}
      <div
        className={`relative w-full max-w-lg transform transition-all duration-200 ${
          isClosing ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
        }`}
      >
        <div className="bg-[#1e2028] rounded-xl shadow-2xl shadow-black/50 overflow-hidden border border-white/[0.06]">
          {/* Header with gradient */}
          <div className="relative bg-gradient-to-r from-purple-600/20 via-blue-600/20 to-cyan-600/20 p-6 pb-8">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#1e2028]" />

            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
                <Download className="w-7 h-7 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Update Available</h2>
                <p className="text-sm text-gray-400 mt-1">
                  A new version of GitKraken is ready
                </p>
              </div>
            </div>

            {/* Version badge */}
            <div className="relative mt-4 flex items-center gap-2">
              <span className="px-2.5 py-1 bg-white/10 rounded-full text-xs font-medium text-gray-300">
                v{currentVersion}
              </span>
              <ArrowRight className="w-4 h-4 text-gray-500" />
              <span className="px-2.5 py-1 bg-purple-500/20 rounded-full text-xs font-medium text-purple-300 border border-purple-500/30">
                v{releaseInfo.version}
              </span>
              <span className="ml-2 text-xs text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {publishDate}
              </span>
            </div>
          </div>

          {/* Release Notes */}
          <div className="p-6 pt-0 -mt-2">
            <div className="bg-black/20 rounded-xl border border-white/5 max-h-64 overflow-y-auto">
              <div className="p-4 space-y-4">
                {sections.length > 0 ? (
                  sections.map((section, idx) => (
                    <div key={idx}>
                      <div className="flex items-center gap-2 mb-2">
                        {section.icon}
                        <h3 className="text-sm font-semibold text-white">{section.type}</h3>
                      </div>
                      <ul className="space-y-1.5 ml-6">
                        {section.items.map((item, itemIdx) => (
                          <li key={itemIdx} className="text-sm text-gray-400 flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-600 mt-1.5 flex-shrink-0" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-400">
                    Check out the latest improvements and bug fixes in this release.
                  </p>
                )}
              </div>
            </div>

            {/* View full release notes link */}
            <a
              href={releaseInfo.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-3 text-xs text-purple-400 hover:text-purple-300 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View full release notes on GitHub
            </a>
          </div>

          {/* Actions */}
          <div className="p-6 pt-0 flex flex-col gap-2">
            <button
              onClick={handleUpdateNow}
              className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold rounded-lg transition-all shadow-lg shadow-purple-500/20 flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Update Now
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleRemindLater}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-300 font-medium rounded-lg transition-colors text-sm"
              >
                Remind Me Later
              </button>
              <button
                onClick={handleSkipVersion}
                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-gray-500 font-medium rounded-lg transition-colors text-sm"
              >
                Skip This Version
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UpdateDialog;
