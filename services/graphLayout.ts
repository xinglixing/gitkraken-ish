import { Commit } from '../types';

const COLORS = ['#00cc74', '#4d95ec', '#fbc02d', '#af7bf0', '#ff5252', '#2dd4bf', '#f472b6'];

export const processGraphLayout = (commits: Commit[]): Commit[] => {
  // Map of LaneIndex -> Color
  const laneColors = new Map<number, string>();

  // Tracks the 'next expected commit' for each lane
  // null means the lane is currently empty/available
  const lanes: (string | null)[] = [];

  // O(1) lookup map: commitId -> Set of lane indices expecting this commit
  // Using Set because a commit can be expected in multiple lanes (merge scenarios)
  const commitIdToLanes = new Map<string, Set<number>>();

  // Helper to set lane expectation
  const setLaneExpectation = (laneIdx: number, commitId: string | null) => {
    // Remove old expectation
    const oldCommitId = lanes[laneIdx];
    if (oldCommitId !== null) {
      const laneSet = commitIdToLanes.get(oldCommitId);
      if (laneSet) {
        laneSet.delete(laneIdx);
        if (laneSet.size === 0) commitIdToLanes.delete(oldCommitId);
      }
    }
    // Set new expectation
    lanes[laneIdx] = commitId;
    if (commitId !== null) {
      if (!commitIdToLanes.has(commitId)) {
        commitIdToLanes.set(commitId, new Set());
      }
      commitIdToLanes.get(commitId)!.add(laneIdx);
    }
  };

  // Helper to find first free lane
  const findFreeLane = (): number => {
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === null) return i;
    }
    return lanes.length;
  };

  const processedCommits = commits.map(commit => {
    // 1. Determine Lane
    // Use O(1) lookup to find lanes expecting this commit
    let laneIndex = -1;
    const expectingLanes = commitIdToLanes.get(commit.id);

    if (expectingLanes && expectingLanes.size > 0) {
      // Get the first (lowest index) lane expecting this commit
      laneIndex = Math.min(...expectingLanes);
      // Clear all lanes expecting this commit
      for (const lane of expectingLanes) {
        setLaneExpectation(lane, null);
      }
    }

    // If not found in any lane, find a free one
    if (laneIndex === -1) {
      laneIndex = findFreeLane();
      if (laneIndex === lanes.length) {
        lanes.push(null); // Extend lanes array
      }
    }

    // Assign Color
    if (!laneColors.has(laneIndex)) {
      laneColors.set(laneIndex, COLORS[laneIndex % COLORS.length]);
    }
    const color = laneColors.get(laneIndex)!;

    // 2. Manage Parent Lanes
    commit.parents.forEach((parentId, idx) => {
      // First parent tries to stay in the current lane (continuity)
      if (idx === 0) {
        if (lanes[laneIndex] === null) {
          // Check if parent is already active in another lane (merge base scenario)
          const existingLanes = commitIdToLanes.get(parentId);
          if (!existingLanes || existingLanes.size === 0) {
            setLaneExpectation(laneIndex, parentId);
          }
          // If parent already has a lane, leave this lane free
        } else {
          // Lane occupied - find a free lane for parent
          const existingLanes = commitIdToLanes.get(parentId);
          if (!existingLanes || existingLanes.size === 0) {
            let free = findFreeLane();
            if (free === lanes.length) lanes.push(null);
            setLaneExpectation(free, parentId);
            laneColors.set(free, color);
          }
        }
      } else {
        // Merge parents
        const existingLanes = commitIdToLanes.get(parentId);
        if (!existingLanes || existingLanes.size === 0) {
          let free = findFreeLane();
          if (free === lanes.length) lanes.push(null);
          setLaneExpectation(free, parentId);
          laneColors.set(free, COLORS[free % COLORS.length]);
        }
      }
    });

    // Compact trailing null lanes to prevent unbounded horizontal growth
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) {
      lanes.pop();
    }

    return {
      ...commit,
      lane: laneIndex,
      color: color
    };
  });

  return processedCommits;
};