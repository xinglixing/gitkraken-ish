import React, { useEffect, useState, useRef } from 'react';
import {
  PlayCircle, CheckCircle, XCircle, Loader2, Clock,
  GitBranch, User, Calendar, Terminal, ChevronRight, AlertCircle, StopCircle, RefreshCw
} from 'lucide-react';
import { WorkflowRun, WorkflowJob, Repository, GitOperationError } from '../types';
import { fetchWorkflowJobs, fetchWorkflowRun, fetchJobLogs } from '../services/githubService';

interface ActionDetailsProps {
  run: WorkflowRun;
  repo: Repository;
  token?: string;
  onClose?: () => void;
}

const POLL_INTERVAL_MS = 3000;

const ActionDetails: React.FC<ActionDetailsProps> = ({ run: initialRun, repo, token, onClose }) => {
  const [currentRun, setCurrentRun] = useState<WorkflowRun>(initialRun);
  const [jobs, setJobs] = useState<WorkflowJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<WorkflowJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [jobLogs, setJobLogs] = useState<string | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Use a ref to keep track of the selected job ID to restore selection after polling
  const selectedJobIdRef = useRef<number | null>(null);

  const fetchData = async (isPolling = false) => {
    if (!token || !repo.owner) return;
    if (!isPolling) setLoading(true);

    try {
        // Fetch run details AND jobs in parallel; use allSettled so one failure doesn't block the other
        const [runResult, jobsResult] = await Promise.allSettled([
            fetchWorkflowRun(token, repo.owner.login, repo.name, currentRun.id),
            fetchWorkflowJobs(token, repo.owner.login, repo.name, currentRun.id)
        ]);

        if (runResult.status === 'fulfilled') {
            setCurrentRun(runResult.value);
        }

        const jobsData = jobsResult.status === 'fulfilled' ? jobsResult.value : [];
        if (jobsResult.status === 'fulfilled') {
            setJobs(jobsData);
        }

        // Report errors
        const errors: string[] = [];
        if (runResult.status === 'rejected') errors.push('Failed to fetch run details');
        if (jobsResult.status === 'rejected') errors.push('Failed to fetch jobs');
        setFetchError(errors.length > 0 ? errors.join('; ') : null);

        // Restore selection or default to first
        if (selectedJobIdRef.current) {
            const found = jobsData.find(j => j.id === selectedJobIdRef.current);
            setSelectedJob(found || jobsData[0] || null);
        } else if (!selectedJob && jobsData.length > 0) {
            setSelectedJob(jobsData[0]);
            selectedJobIdRef.current = jobsData[0].id;
        } else if (selectedJob) {
             // Update the currently selected job object with new data
             const found = jobsData.find(j => j.id === selectedJob.id);
             if (found) setSelectedJob(found);
        }

    } catch (e) {
        console.error('Unexpected error in fetchData:', e);
        setFetchError('An unexpected error occurred');
    } finally {
        if (!isPolling) setLoading(false);
    }
  };

  // Fetch logs when a job is selected
  const loadJobLogs = async (job: WorkflowJob) => {
    if (!token || !repo.owner) return;
    // Only fetch logs for completed jobs
    if (job.status !== 'completed') {
        setJobLogs(null);
        setLogsError(null);
        return;
    }
    setLogsLoading(true);
    setLogsError(null);
    setJobLogs(null);
    try {
        const logs = await fetchJobLogs(token, repo.owner.login, repo.name, job.id);
        setJobLogs(logs);
    } catch (e) {
        const error = e as GitOperationError;
        setLogsError('Logs not available for this job.');
        console.warn('Failed to fetch job logs:', error.message || e);
    } finally {
        setLogsLoading(false);
    }
  };

  // Initial Fetch
  useEffect(() => {
    fetchData();
  }, [initialRun.id, repo, token]);

  // Polling Effect
  useEffect(() => {
      let interval: NodeJS.Timeout;
      const isActive = currentRun.status === 'in_progress' || currentRun.status === 'queued';

      if (isActive && token && repo.owner) {
          interval = setInterval(() => {
              fetchData(true);
          }, POLL_INTERVAL_MS);
      }
      return () => clearInterval(interval);
  }, [currentRun.status, repo, token]);

  // Fetch logs when selected job changes
  useEffect(() => {
      if (selectedJob) {
          loadJobLogs(selectedJob);
      }
  }, [selectedJob?.id, selectedJob?.status]);

  const handleJobSelect = (job: WorkflowJob) => {
      setSelectedJob(job);
      selectedJobIdRef.current = job.id;
  };

  const StatusIcon = ({ conclusion, status, size = "sm" }: { conclusion: string | null, status: string, size?: "sm" | "lg" }) => {
     const s = size === "lg" ? "w-6 h-6" : "w-4 h-4";
     if (status === 'in_progress' || status === 'queued') return <Loader2 className={`${s} text-gk-yellow animate-spin`} />;
     if (conclusion === 'success') return <CheckCircle className={`${s} text-gk-accent`} />;
     if (conclusion === 'failure') return <XCircle className={`${s} text-gk-red`} />;
     if (conclusion === 'cancelled') return <StopCircle className={`${s} text-gray-500`} />;
     return <AlertCircle className={`${s} text-gray-400`} />;
  };

  const calculateDuration = (start: string | null, end: string | null) => {
      if (!start) return '-';
      const endTime = end ? new Date(end).getTime() : new Date().getTime();
      const diff = endTime - new Date(start).getTime();

      if (diff < 0) return '0s';

      const seconds = Math.floor(diff / 1000);
      if (seconds < 60) return `${seconds}s`;
      const minutes = Math.floor(seconds / 60);
      return `${minutes}m ${seconds % 60}s`;
  };

  // Parse log text into lines, limiting to avoid performance issues
  const MAX_LOG_LINES = 500;
  const renderLogLines = (logText: string) => {
      const allLines = logText.split('\n');
      const truncated = allLines.length > MAX_LOG_LINES;
      const lines = allLines.slice(0, MAX_LOG_LINES);
      return (
          <>
              {lines.map((line, i) => (
                  <div key={`log-${i}`} className="flex items-start">
                      <span className="text-gray-600 select-none w-10 text-right mr-3 flex-shrink-0">{i + 1}</span>
                      <span className={line.match(/error|fail|fatal/i) ? 'text-gk-red' : line.match(/warn/i) ? 'text-gk-yellow' : ''}>{line}</span>
                  </div>
              ))}
              {truncated && (
                  <div className="mt-2 px-2 py-1 bg-gk-yellow/10 border border-gk-yellow/20 rounded text-gk-yellow text-xs">
                      Showing first {MAX_LOG_LINES} of {allLines.length.toLocaleString()} lines. View full logs on GitHub for complete output.
                  </div>
              )}
          </>
      );
  };

  return (
    <div className="flex-1 bg-gk-bg flex flex-col overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="h-16 bg-gk-panel border-b border-black/20 px-6 flex items-center justify-between flex-shrink-0">
             <div className="flex items-center min-w-0">
                 <div className="mr-4">
                     <StatusIcon conclusion={currentRun.conclusion} status={currentRun.status} size="lg" />
                 </div>
                 <div>
                     <h2 className="text-lg font-bold text-gray-200 truncate leading-tight flex items-center">
                        {currentRun.display_title || currentRun.name}
                        {currentRun.status === 'in_progress' && <span className="ml-3 text-[10px] bg-gk-yellow/20 text-gk-yellow px-2 py-0.5 rounded animate-pulse">LIVE</span>}
                     </h2>
                     <div className="flex items-center text-xs text-gray-500 mt-1 space-x-4">
                         <div className="flex items-center">
                             <GitBranch className="w-3.5 h-3.5 mr-1" />
                             {currentRun.branch}
                         </div>
                         <div className="flex items-center">
                             <User className="w-3.5 h-3.5 mr-1" />
                             {currentRun.actor}
                         </div>
                         <div className="flex items-center">
                             <Calendar className="w-3.5 h-3.5 mr-1" />
                             {new Date(currentRun.created_at).toLocaleString()}
                         </div>
                     </div>
                 </div>
             </div>
             {onClose && (
                 <button onClick={onClose} className="text-sm text-gray-500 hover:text-white border border-white/10 px-3 py-1 rounded">
                     Close
                 </button>
             )}
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
            {/* Jobs Sidebar */}
            <div className="w-72 bg-gk-panel border-r border-black/20 flex flex-col">
                <div className="p-4 flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Jobs</span>
                    {(currentRun.status === 'in_progress' || loading) && <RefreshCw className="w-3 h-3 text-gray-600 animate-spin" />}
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {loading && jobs.length === 0 && <div className="p-4 text-sm text-gray-500 flex items-center"><Loader2 className="w-3 h-3 mr-2 animate-spin"/> Loading jobs...</div>}
                    {fetchError && <div className="p-4 text-sm text-gk-red italic">{fetchError}</div>}
                    {jobs.map(job => (
                        <div
                            key={job.id}
                            onClick={() => handleJobSelect(job)}
                            className={`px-4 py-3 flex items-center cursor-pointer border-l-2 transition-colors ${
                                selectedJob?.id === job.id
                                ? 'bg-white/5 border-gk-blue'
                                : 'border-transparent hover:bg-white/5'
                            }`}
                        >
                            <StatusIcon conclusion={job.conclusion} status={job.status} />
                            <div className="ml-3 flex-1 min-w-0">
                                <div className={`text-sm font-medium ${selectedJob?.id === job.id ? 'text-white' : 'text-gray-300'}`}>{job.name}</div>
                                <div className="text-xs text-gray-500 mt-0.5 flex items-center">
                                    <Clock className="w-3 h-3 mr-1" />
                                    {calculateDuration(job.started_at, job.completed_at)}
                                </div>
                            </div>
                            <ChevronRight className={`w-4 h-4 text-gray-600 ${selectedJob?.id === job.id ? 'opacity-100' : 'opacity-0'}`} />
                        </div>
                    ))}
                    {!loading && jobs.length === 0 && (
                        <div className="p-4 text-sm text-gray-500 italic">No jobs found for this run.</div>
                    )}
                </div>
            </div>

            {/* Steps & Logs Area */}
            <div className="flex-1 flex flex-col bg-gk-bg">
                {selectedJob ? (
                    <>
                        <div className="h-12 border-b border-black/20 flex items-center px-6 bg-gk-header/50">
                            <span className="font-bold text-gray-300 mr-2">Job:</span>
                            <span className="text-gray-400">{selectedJob.name}</span>
                            <div className="flex-1"></div>
                            <span className="text-xs text-gray-500 font-mono">ID: {selectedJob.id}</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                            <div className="bg-gk-panel border border-black/20 rounded-lg overflow-hidden shadow-lg">
                                {/* Steps list */}
                                {selectedJob.steps.map((step) => (
                                    <div key={step.number} className="border-b border-black/20 last:border-0">
                                        <div className="flex items-center px-4 py-3 bg-white/5">
                                            <StatusIcon conclusion={step.conclusion} status={step.status} />
                                            <span className="ml-3 text-sm font-bold text-gray-300 flex-1">{step.name}</span>
                                            <span className="text-xs text-gray-500 font-mono">{calculateDuration(step.started_at, step.completed_at)}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Real Logs Section */}
                            <div className="mt-4 bg-gk-panel border border-black/20 rounded-lg overflow-hidden shadow-lg">
                                <div className="px-4 py-3 bg-white/5 border-b border-black/20 flex items-center">
                                    <Terminal className="w-4 h-4 text-gray-400 mr-2" />
                                    <span className="text-sm font-bold text-gray-300">Job Logs</span>
                                </div>
                                <div className="bg-black/40 p-4 font-mono text-xs text-gray-400 overflow-x-auto max-h-96 overflow-y-auto custom-scrollbar">
                                    {logsLoading && (
                                        <div className="flex items-center text-gray-500">
                                            <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                            Loading logs...
                                        </div>
                                    )}
                                    {logsError && (
                                        <div className="text-gray-500 italic">{logsError}</div>
                                    )}
                                    {selectedJob.status !== 'completed' && !logsLoading && !logsError && (
                                        <div className="flex items-center text-gray-500">
                                            {selectedJob.status === 'in_progress' ? (
                                                <>
                                                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                                    Job is still running. Logs will be available when the job completes.
                                                </>
                                            ) : (
                                                'Job is queued. Logs will be available when the job completes.'
                                            )}
                                        </div>
                                    )}
                                    {jobLogs && renderLogLines(jobLogs)}
                                </div>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
                        <Terminal className="w-16 h-16 mb-4 opacity-20" />
                        <p>Select a job to view steps and logs.</p>
                    </div>
                )}
            </div>
        </div>
    </div>
  );
};

export default ActionDetails;
