import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { trainingAPI } from '../services/api';
import { toast } from 'react-hot-toast';
import { CloudArrowUpIcon, KeyIcon } from '@heroicons/react/24/outline';

export const HuggingFacePanel: React.FC = () => {
  const { huggingFace, setHuggingFaceToken, setHuggingFaceAuth } = useStore();
  const [trainedModels, setTrainedModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [repoName, setRepoName] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [tokenInput, setTokenInput] = useState('');

  useEffect(() => {
    // Load trained models
    trainingAPI.listTrainedModels()
      .then(models => setTrainedModels(models))
      .catch(err => console.error('Failed to load trained models:', err));
  }, []);

  const handleLogin = () => {
    if (!tokenInput) {
      toast.error('Please enter your Hugging Face token');
      return;
    }

    // In a real app, we'd validate the token with HF API
    setHuggingFaceToken(tokenInput);
    setHuggingFaceAuth(true, 'user'); // Would get username from API
    toast.success('Logged in to Hugging Face');
  };

  const handlePublish = async () => {
    if (!selectedModel || !repoName) {
      toast.error('Please select a model and enter a repository name');
      return;
    }

    if (!huggingFace.token) {
      toast.error('Please login to Hugging Face first');
      return;
    }

    setIsPublishing(true);
    try {
      await trainingAPI.publishToHuggingFace(
        selectedModel,
        repoName,
        huggingFace.token
      );
      toast.success(`Successfully published to huggingface.co/${huggingFace.username}/${repoName}`);
      setRepoName('');
      setSelectedModel('');
    } catch (err) {
      console.error('Failed to publish:', err);
      toast.error('Failed to publish to Hugging Face');
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-gray-100">Hugging Face Hub</h2>
        
        {!huggingFace.isAuthenticated ? (
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
            <div className="flex items-start">
              <KeyIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400 mr-3 mt-1" />
              <div className="flex-1">
                <h3 className="font-medium text-yellow-900 dark:text-yellow-100 mb-2">
                  Login to Hugging Face
                </h3>
                <p className="text-sm text-yellow-700 dark:text-yellow-300 mb-4">
                  Enter your Hugging Face token to publish models. Get your token from{' '}
                  <a
                    href="https://huggingface.co/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium"
                  >
                    huggingface.co/settings/tokens
                  </a>
                </p>
                <div className="flex space-x-2">
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="hf_..."
                    className="flex-1 input-field"
                  />
                  <button
                    onClick={handleLogin}
                    className="btn-primary"
                  >
                    Login
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-sm text-green-800 dark:text-green-300">
                ✓ Logged in as <span className="font-medium">{huggingFace.username}</span>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Select Trained Model
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="input-field"
                >
                  <option value="">Select a model...</option>
                  {trainedModels.map((model) => (
                    <option key={model} value={model}>
                      {model.split('/').pop()}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Repository Name
                </label>
                <input
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="my-awesome-lora"
                  className="input-field"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handlePublish}
                disabled={!selectedModel || !repoName || isPublishing}
                className="btn-primary flex items-center"
              >
                <CloudArrowUpIcon className="h-5 w-5 mr-2" />
                {isPublishing ? 'Publishing...' : 'Publish to Hub'}
              </button>
            </div>
          </div>
        )}
      </div>

      {trainedModels.length > 0 && (
        <div>
          <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-3">Your Trained Models</h3>
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
            <ul className="space-y-2">
              {trainedModels.map((model) => (
                <li key={model} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">{model.split('/').pop()}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{model}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};