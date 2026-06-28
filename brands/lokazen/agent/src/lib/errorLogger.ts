// In-memory error logger for status monitoring
// In production, this could be replaced with a database or external logging service

interface ErrorLog {
  timestamp: string
  component: string
  message: string
  details?: string
}

class ErrorLogger {
  private logs: ErrorLog[] = []
  private maxLogs = 100 // Keep last 100 logs

  log(component: string, message: string, details?: string) {
    const log: ErrorLog = {
      timestamp: new Date().toISOString(),
      component,
      message,
      details,
    }
    
    this.logs.push(log)
    
    // Keep only the last maxLogs entries
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }
  }

  getLogs(component?: string, limit: number = 10): ErrorLog[] {
    let filtered = component 
      ? this.logs.filter(log => log.component === component)
      : this.logs
    
    // Sort by timestamp (newest first) and limit
    return filtered
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit)
  }

  getLastError(component: string): ErrorLog | null {
    const componentLogs = this.getLogs(component, 1)
    return componentLogs.length > 0 ? componentLogs[0] : null
  }

  clear() {
    this.logs = []
  }
}

// Singleton instance
export const errorLogger = new ErrorLogger()
