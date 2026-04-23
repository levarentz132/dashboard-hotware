/**
 * Centralized Logger Utility
 * Controls log visibility based on environment and log levels.
 */

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

const LOG_LEVELS: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// Default log level: 
// - SHOW everything (DEBUG) if NEXT_PUBLIC_LOG_LEVEL is set to DEBUG
// - Default to WARN to keep the terminal clean of "nonsense"
const CURRENT_LEVEL = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_LOG_LEVEL === 'DEBUG') 
  ? LOG_LEVELS.DEBUG 
  : LOG_LEVELS.WARN;

const logger = {
  debug: (...args: any[]) => {
    if (CURRENT_LEVEL <= LOG_LEVELS.DEBUG) {
      console.log(...args);
    }
  },
  info: (...args: any[]) => {
    if (CURRENT_LEVEL <= LOG_LEVELS.INFO) {
      console.log(...args);
    }
  },
  warn: (...args: any[]) => {
    if (CURRENT_LEVEL <= LOG_LEVELS.WARN) {
      console.warn(...args);
    }
  },
  error: (...args: any[]) => {
    if (CURRENT_LEVEL <= LOG_LEVELS.ERROR) {
      console.error(...args);
    }
  },
};

export default logger;
