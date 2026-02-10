import React, { useMemo } from 'react';
import { Commit } from '../types';

interface CommitGraphProps {
  commits: Commit[];
  rowHeight: number;
  columnWidth: number;
  topRowOffset?: number;
  scrollTop?: number;
  viewportHeight?: number;
}

const BUFFER_ROWS = 10; // Extra rows to render above/below viewport

const CommitGraph: React.FC<CommitGraphProps> = ({
  commits, rowHeight, columnWidth, topRowOffset = 1,
  scrollTop = 0, viewportHeight = 2000
}) => {
  const xOffset = 14; // Must match GRAPH_PADDING_LEFT in App.tsx
  const maxLane = commits.length > 0 ? commits.reduce((max, c) => Math.max(max, c.lane), 0) : 0;
  const width = (maxLane + 2) * columnWidth + xOffset + 20;
  const totalHeight = (commits.length + topRowOffset) * rowHeight;
  const cornerRadius = 8;

  // Pre-build lookup maps once when commits change
  const { commitIndexMap, childrenMap } = useMemo(() => {
    const indexMap = new Map<string, number>();
    const children = new Map<number, number[]>();
    commits.forEach((c, idx) => indexMap.set(c.id, idx));
    commits.forEach((c, idx) => {
      for (const parentId of c.parents) {
        const parentIdx = indexMap.get(parentId);
        if (parentIdx !== undefined) {
          const list = children.get(parentIdx);
          if (list) list.push(idx);
          else children.set(parentIdx, [idx]);
        }
      }
    });
    return { commitIndexMap: indexMap, childrenMap: children };
  }, [commits]);

  // Calculate visible range for virtualization
  const visibleRange = useMemo(() => {
    if (commits.length === 0) return { start: 0, end: 0 };

    const startRow = Math.max(0, Math.floor(scrollTop / rowHeight) - topRowOffset - BUFFER_ROWS);
    const endRow = Math.min(
      commits.length,
      Math.ceil((scrollTop + viewportHeight) / rowHeight) - topRowOffset + BUFFER_ROWS
    );

    return { start: Math.max(0, startRow), end: Math.min(commits.length, endRow) };
  }, [scrollTop, viewportHeight, rowHeight, commits.length, topRowOffset]);

  // Get the set of commits we need to render (visible + their parents AND children for edge connections)
  const visibleCommits = useMemo(() => {
    if (commits.length === 0) return [];

    const indices = new Set<number>();

    // Add visible range
    for (let i = visibleRange.start; i < visibleRange.end; i++) {
      indices.add(i);
    }

    // Add parents of visible commits
    for (let i = visibleRange.start; i < visibleRange.end; i++) {
      const commit = commits[i];
      for (const parentId of commit.parents) {
        const parentIdx = commitIndexMap.get(parentId);
        if (parentIdx !== undefined) {
          indices.add(parentIdx);
        }
      }
    }

    // Add children of visible commits via pre-built map (O(1) per visible commit)
    for (let i = visibleRange.start; i < visibleRange.end; i++) {
      const kids = childrenMap.get(i);
      if (kids) {
        for (const childIdx of kids) {
          indices.add(childIdx);
        }
      }
    }

    return Array.from(indices).sort((a, b) => a - b);
  }, [commits, visibleRange, commitIndexMap, childrenMap]);

  // Generates the Subway-style path
  const getPath = (start: {x: number, y: number}, end: {x: number, y: number}) => {
      let d = `M ${start.x} ${start.y}`;
      const midY = start.y + rowHeight / 2;
      const directionX = end.x > start.x ? 1 : -1;

      if (start.x === end.x) {
          // Straight down
          d += ` L ${end.x} ${end.y}`;
      } else {
          // 90-degree turn with radius
          d += ` L ${start.x} ${midY - cornerRadius}`;
          d += ` Q ${start.x} ${midY}, ${start.x + cornerRadius * directionX} ${midY}`;
          d += ` L ${end.x - cornerRadius * directionX} ${midY}`;
          d += ` Q ${end.x} ${midY}, ${end.x} ${midY + cornerRadius}`;
          d += ` L ${end.x} ${end.y}`;
      }
      return d;
  };

  // Build edges for all visible commits
  const edges = useMemo(() => {
    const result: { key: string; d: string; color: string }[] = [];
    const visibleSet = new Set(visibleCommits);

    // Use pre-built commitIndexMap from above instead of recreating it

    for (const index of visibleCommits) {
      const commit = commits[index];
      const cx = (commit.lane + 1) * columnWidth + xOffset;
      const cy = (index + topRowOffset) * rowHeight + rowHeight / 2;

      for (const parentId of commit.parents) {
        const parentIndex = commitIndexMap.get(parentId);
        if (parentIndex === undefined) continue;

        // Only draw edge if both ends are in visible set
        if (!visibleSet.has(parentIndex)) continue;

        const parent = commits[parentIndex];
        const px = (parent.lane + 1) * columnWidth + xOffset;
        const py = (parentIndex + topRowOffset) * rowHeight + rowHeight / 2;

        let lineColor = commit.color;
        const isMergeSource = commit.parents.length > 1 && parentId !== commit.parents[0];
        if (isMergeSource) {
          lineColor = parent.color;
        }

        result.push({
          key: `${commit.id}-${parentId}`,
          d: getPath({ x: cx, y: cy }, { x: px, y: py }),
          color: lineColor,
        });
      }
    }

    return result;
  }, [visibleCommits, commits, columnWidth, rowHeight, topRowOffset, commitIndexMap]);

  return (
    <svg
        className="absolute top-0 left-0 pointer-events-none z-0"
        width={width}
        height={totalHeight}
        style={{ overflow: 'visible' }}
    >
      {edges.map(edge => (
        <path
          key={edge.key}
          d={edge.d}
          stroke={edge.color}
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.8}
        />
      ))}
    </svg>
  );
};

export default React.memo(CommitGraph);
