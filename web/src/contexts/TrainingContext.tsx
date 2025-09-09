import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

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
  const [loraName, setLoraName] = useState<string>(() => {
    try { return localStorage.getItem('kiko.loraName') || '' } catch { return '' }
  })
  const [classTokens, setClassTokens] = useState<string>(() => {
    try { return localStorage.getItem('kiko.classTokens') || '' } catch { return '' }
  })
  const [datasetFolder, setDatasetFolder] = useState<string>(() => {
    try { return localStorage.getItem('kiko.datasetFolder') || '' } catch { return '' }
  })

  useEffect(() => {
    try { localStorage.setItem('kiko.loraName', loraName) } catch {}
  }, [loraName])
  useEffect(() => {
    try { localStorage.setItem('kiko.classTokens', classTokens) } catch {}
  }, [classTokens])
  useEffect(() => {
    try { localStorage.setItem('kiko.datasetFolder', datasetFolder) } catch {}
  }, [datasetFolder])

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
