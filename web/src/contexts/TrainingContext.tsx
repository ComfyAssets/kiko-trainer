import React, { createContext, useContext, useState, ReactNode } from 'react'

interface TrainingContextType {
  loraName: string
  setLoraName: (name: string) => void
  classTokens: string
  setClassTokens: (tokens: string) => void
  datasetFolder: string
  setDatasetFolder: (folder: string) => void
}

const TrainingContext = createContext<TrainingContextType | undefined>(undefined)

export function TrainingProvider({ children }: { children: ReactNode }) {
  const [loraName, setLoraName] = useState('')
  const [classTokens, setClassTokens] = useState('')
  const [datasetFolder, setDatasetFolder] = useState('')

  return (
    <TrainingContext.Provider
      value={{
        loraName,
        setLoraName,
        classTokens,
        setClassTokens,
        datasetFolder,
        setDatasetFolder,
      }}
    >
      {children}
    </TrainingContext.Provider>
  )
}

export function useTraining() {
  const context = useContext(TrainingContext)
  if (context === undefined) {
    throw new Error('useTraining must be used within a TrainingProvider')
  }
  return context
}