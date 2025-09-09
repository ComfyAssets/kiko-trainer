import React, { useState } from 'react';
import MetricsChart from '../components/MetricsChart';
import MetricsChartEnhanced from '../components/MetricsChartEnhanced';

export default function TestMetrics() {
  const [outputName, setOutputName] = useState('');
  const [showEnhanced, setShowEnhanced] = useState(true);
  const [source, setSource] = useState<"tensorboard" | "csv" | "none">("none");
  
  return (
    <div className="min-h-screen bg-zinc-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">Metrics Chart Comparison</h1>
        
        <div className="mb-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              Output Name (e.g., your training folder name)
            </label>
            <input
              type="text"
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
              placeholder="Enter output folder name"
              className="w-full px-4 py-2 bg-black/40 border border-zinc-800 rounded"
            />
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowEnhanced(!showEnhanced)}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded"
            >
              Toggle: {showEnhanced ? 'Enhanced' : 'Original'} Version
            </button>
            
            <span className="text-sm text-zinc-400">
              Current source: <span className="font-mono text-white">{source}</span>
            </span>
          </div>
        </div>
        
        {outputName && (
          <div className="space-y-6">
            <div className="p-6 bg-black/40 border border-zinc-800 rounded">
              <h2 className="text-lg font-semibold mb-4">
                {showEnhanced ? 'Enhanced' : 'Original'} Metrics Chart
              </h2>
              
              {showEnhanced ? (
                <MetricsChartEnhanced 
                  outputName={outputName}
                  onSourceChange={setSource}
                />
              ) : (
                <MetricsChart 
                  outputName={outputName}
                  onSourceChange={setSource}
                />
              )}
            </div>
            
            <div className="p-4 bg-black/20 border border-zinc-800 rounded">
              <h3 className="font-semibold mb-2">Improvements in Enhanced Version:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm text-zinc-400">
                <li>Cleaner code structure with better separation of concerns</li>
                <li>Improved error handling and recovery</li>
                <li>Simplified data processing pipeline</li>
                <li>Better TypeScript typing</li>
                <li>Reduced complexity in SSE reconnection logic</li>
                <li>More maintainable state management</li>
                <li>Cleaner UI with better visual hierarchy</li>
                <li>Export functionality for data analysis</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}