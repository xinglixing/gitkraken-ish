import React, { useState, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { CommitTemplate } from '../types';
import {
  getAllTemplates, saveUserTemplate, deleteUserTemplate,
  CONVENTIONAL_TYPES, getScopeSuggestions, buildConventionalMessage
} from '../services/commitTemplateService';

interface CommitTemplatePanelProps {
  onApplyTemplate: (message: string) => void;
  recentMessages?: string[];
}

const CommitTemplatePanel: React.FC<CommitTemplatePanelProps> = ({ onApplyTemplate, recentMessages = [] }) => {
  const [templates, setTemplates] = useState<CommitTemplate[]>(getAllTemplates());
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Conventional commit state
  const [convType, setConvType] = useState('feat');
  const [convScope, setConvScope] = useState('');
  const [convDescription, setConvDescription] = useState('');
  const [convBody, setConvBody] = useState('');
  const [convBreaking, setConvBreaking] = useState(false);

  // Custom template state
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateContent, setNewTemplateContent] = useState('');

  const scopeSuggestions = useMemo(() => getScopeSuggestions(recentMessages), [recentMessages]);

  const handleSelectTemplate = (templateId: string) => {
    if (templateId === 'conventional') {
      // Show conventional commit helper
      setSelectedTemplate(templateId);
    } else {
      // Apply template directly and close
      const tmpl = templates.find(t => t.id === templateId);
      if (tmpl) {
        onApplyTemplate(tmpl.template);
      }
    }
  };

  const handleApplyConventional = () => {
    if (!convDescription.trim()) return;
    const msg = buildConventionalMessage(convType, convScope, convDescription, convBody || undefined, convBreaking);
    onApplyTemplate(msg);
    setSelectedTemplate(null);
    setConvType('feat');
    setConvScope('');
    setConvDescription('');
    setConvBody('');
    setConvBreaking(false);
  };

  const handleSaveTemplate = () => {
    if (!newTemplateName.trim() || !newTemplateContent.trim()) return;
    const template: CommitTemplate = {
      id: `custom_${Date.now()}`,
      name: newTemplateName,
      template: newTemplateContent,
    };
    saveUserTemplate(template);
    setTemplates(getAllTemplates());
    setShowNewTemplate(false);
    setNewTemplateName('');
    setNewTemplateContent('');
  };

  const handleDeleteTemplate = (id: string) => {
    deleteUserTemplate(id);
    setTemplates(getAllTemplates());
  };

  return (
    <div className="relative">
      {/* Template list - shown directly since parent controls visibility */}
      <div className="w-full bg-gk-bg border border-white/10 rounded-lg py-1 max-h-48 overflow-y-auto">
          <div className="px-3 py-1.5 text-[10px] font-bold text-gray-500 uppercase">Templates</div>
          {templates.map(tmpl => (
            <div
              key={tmpl.id}
              className={`flex items-center px-3 py-2 text-sm cursor-pointer hover:bg-white/5 ${
                selectedTemplate === tmpl.id ? 'bg-gk-accent/10 text-gk-accent' : 'text-gray-300'
              }`}
              onClick={() => handleSelectTemplate(tmpl.id)}
            >
              <span className="flex-1 text-xs">{tmpl.name}</span>
              {tmpl.isBuiltIn && <span className="text-[9px] text-gray-600 bg-white/5 px-1 rounded">built-in</span>}
              {!tmpl.isBuiltIn && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(tmpl.id); }}
                  className="text-gray-600 hover:text-gk-red ml-2"
                  aria-label={`Delete template ${tmpl.name}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          <div className="h-px bg-white/10 my-1" />
          <div
            className="flex items-center px-3 py-2 text-xs text-gray-400 cursor-pointer hover:bg-white/5 hover:text-white"
            onClick={() => setShowNewTemplate(true)}
          >
            <Plus className="w-3 h-3 mr-2" />
            Save Custom Template
          </div>
        </div>

      {/* Conventional Commit Helper */}
      {selectedTemplate === 'conventional' && (
        <div className="mt-2 bg-white/5 p-3 rounded-lg border border-white/5 space-y-2">
          <div className="text-[10px] font-bold text-gk-purple uppercase mb-1">Conventional Commit</div>
          <div className="flex space-x-2">
            <select
              value={convType}
              onChange={(e) => setConvType(e.target.value)}
              className="bg-gk-bg border border-white/10 rounded px-2 py-1 text-xs text-white outline-none flex-1"
            >
              {CONVENTIONAL_TYPES.map(t => (
                <option key={t.type} value={t.type}>{t.type} - {t.description}</option>
              ))}
            </select>
          </div>
          <div className="relative">
            <input
              type="text"
              value={convScope}
              onChange={(e) => setConvScope(e.target.value)}
              placeholder="scope (optional)"
              className="w-full bg-gk-bg border border-white/10 rounded px-2 py-1 text-xs text-white outline-none"
              list="scope-suggestions"
            />
            {scopeSuggestions.length > 0 && (
              <datalist id="scope-suggestions">
                {scopeSuggestions.map(s => <option key={s} value={s} />)}
              </datalist>
            )}
          </div>
          <input
            type="text"
            value={convDescription}
            onChange={(e) => setConvDescription(e.target.value)}
            placeholder="short description *"
            className="w-full bg-gk-bg border border-white/10 rounded px-2 py-1 text-xs text-white outline-none"
          />
          <textarea
            value={convBody}
            onChange={(e) => setConvBody(e.target.value)}
            placeholder="body (optional)"
            className="w-full bg-gk-bg border border-white/10 rounded px-2 py-1 text-xs text-white outline-none h-12 resize-none"
          />
          <label className="flex items-center text-xs text-gray-400">
            <input
              type="checkbox"
              checked={convBreaking}
              onChange={(e) => setConvBreaking(e.target.checked)}
              className="mr-2"
            />
            Breaking change
          </label>
          <button
            onClick={handleApplyConventional}
            disabled={!convDescription.trim()}
            className="w-full py-1.5 bg-gk-purple text-white text-xs font-bold rounded hover:bg-gk-purple/80 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Apply
          </button>
        </div>
      )}

      {/* New Template Form */}
      {showNewTemplate && (
        <div className="mt-2 bg-white/5 p-3 rounded-lg border border-white/5 space-y-2">
          <div className="text-[10px] font-bold text-gray-400 uppercase">Save New Template</div>
          <input
            type="text"
            value={newTemplateName}
            onChange={(e) => setNewTemplateName(e.target.value)}
            placeholder="Template name"
            className="w-full bg-gk-bg border border-white/10 rounded px-2 py-1 text-xs text-white outline-none"
          />
          <textarea
            value={newTemplateContent}
            onChange={(e) => setNewTemplateContent(e.target.value)}
            placeholder="Template content (use {description}, {scope}, etc.)"
            className="w-full bg-gk-bg border border-white/10 rounded px-2 py-1 text-xs text-white outline-none h-16 resize-none"
          />
          <div className="flex justify-end space-x-2">
            <button onClick={() => setShowNewTemplate(false)} className="text-xs text-gray-500 hover:text-white px-2 py-1">Cancel</button>
            <button
              onClick={handleSaveTemplate}
              className="text-xs bg-gk-accent text-gk-bg px-3 py-1 rounded font-bold"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommitTemplatePanel;
