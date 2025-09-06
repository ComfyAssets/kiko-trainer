import React, { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { PlayIcon, StopIcon } from '@heroicons/react/24/solid';

export const TrainingProgress: React.FC = () => {
  const { trainingStatus } = useStore();
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [trainingStatus.logs]);

  const progressPercentage = trainingStatus.totalSteps > 0
    ? (trainingStatus.currentStep / trainingStatus.totalSteps) * 100
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Training Progress</h3>
        <div className="flex items-center space-x-2">
          {trainingStatus.isTraining ? (
            <StopIcon className="h-5 w-5 text-red-500 dark:text-red-400" />
          ) : (
            <PlayIcon className="h-5 w-5 text-green-500 dark:text-green-400" />
          )}
          <span className={`text-sm font-medium ${
            trainingStatus.isTraining ? 'text-red-500 dark:text-red-400' : 'text-green-500 dark:text-green-400'
          }`}>
            {trainingStatus.status}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="relative">
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
          <span>Step {trainingStatus.currentStep} / {trainingStatus.totalSteps}</span>
          <span>{progressPercentage.toFixed(1)}%</span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-primary-600 dark:bg-primary-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Logs */}
      <div className="bg-gray-900 dark:bg-black text-gray-100 dark:text-gray-300 rounded-lg p-4 h-64 overflow-y-auto font-mono text-xs">
        {trainingStatus.logs.length === 0 ? (
          <div className="text-gray-500 dark:text-gray-600">No logs yet...</div>
        ) : (
          <>
            {trainingStatus.logs.map((log, index) => (
              <div key={index} className="whitespace-pre-wrap">
                {log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </>
        )}
      </div>
    </div>
  );
};