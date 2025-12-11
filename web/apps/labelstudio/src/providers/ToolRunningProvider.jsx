import React, { createContext, useContext, useState, useCallback } from 'react';

const ToolRunningContext = createContext();

export const useToolRunning = () => {
  const context = useContext(ToolRunningContext);
  if (!context) {
    throw new Error('useToolRunning must be used within ToolRunningProvider');
  }
  return context;
};

export const ToolRunningProvider = ({ children }) => {
  // State: { projectId: { toolId: true/false } }
  const [runningTools, setRunningTools] = useState({});

  const setToolRunning = useCallback((projectId, toolId, isRunning) => {
    setRunningTools(prev => ({
      ...prev,
      [projectId]: {
        ...(prev[projectId] || {}),
        [toolId]: isRunning
      }
    }));
  }, []);

  const isToolRunning = useCallback((projectId, toolId = null) => {
    if (!projectId) return false;
    
    const projectTools = runningTools[projectId];
    if (!projectTools) return false;
    
    // If toolId is provided, check specific tool
    if (toolId !== null) {
      return !!projectTools[toolId];
    }
    
    // Otherwise check if any tool is running for this project
    return Object.values(projectTools).some(running => running);
  }, [runningTools]);

  const getRunningToolsCount = useCallback((projectId) => {
    if (!projectId) return 0;
    const projectTools = runningTools[projectId];
    if (!projectTools) return 0;
    return Object.values(projectTools).filter(running => running).length;
  }, [runningTools]);

  const value = {
    runningTools,
    setToolRunning,
    isToolRunning,
    getRunningToolsCount,
  };

  return (
    <ToolRunningContext.Provider value={value}>
      {children}
    </ToolRunningContext.Provider>
  );
};
