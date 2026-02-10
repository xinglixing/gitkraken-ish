import React from 'react';
import { Commit } from '../types';

interface GraphNodeProps {
  commit: Commit;
  columnWidth: number;
  showAvatars?: boolean;
}

const GraphNode: React.FC<GraphNodeProps> = ({ commit, columnWidth, showAvatars = true }) => {
  const cx = (commit.lane + 1) * columnWidth;
  const nodeSize = 20; // Total node size

  // Get initials matching the Author column style
  const initials = commit.author.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  const hasAvatar = showAvatars && !!commit.avatarUrl;

  return (
    <div
        className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center group z-10"
        style={{ left: cx - (nodeSize / 2) }} // Center the node on the line
    >
        {/* Glow / Hover Area */}
        <div className="absolute w-8 h-8 rounded-full bg-transparent group-hover:bg-white/10 -z-10 transition-colors pointer-events-auto" />

        {/* Inner Node / Avatar - solid background to cover the line */}
        <div
            className="rounded-full border-2 border-[#1b1d23] overflow-hidden flex items-center justify-center shadow-lg"
            style={{
                width: nodeSize,
                height: nodeSize,
                backgroundColor: hasAvatar ? '#1b1d23' : '#1e293b' // Solid dark blue-gray background
            }}
            title={commit.author}
        >
             {hasAvatar ? (
                <img src={commit.avatarUrl} className="w-full h-full object-cover opacity-90 group-hover:opacity-100" alt={initials} />
             ) : (
                <span className="text-gk-blue font-bold" style={{ fontSize: '8px', lineHeight: 1 }}>
                    {initials}
                </span>
             )}
        </div>

        {/* Tooltip on hover */}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-gk-header text-gray-200 text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-lg">
            {commit.author}
            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gk-header" />
        </div>
    </div>
  );
};

export default React.memo(GraphNode);