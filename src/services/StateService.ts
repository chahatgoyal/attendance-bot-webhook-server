import { AdminState, AdminTempData } from '../types/index.js';

// Store admin states
const adminStates = new Map<string, AdminState>();
const adminTempData = new Map<string, AdminTempData>();

function logStateChange(phoneNumber: string, oldState: AdminState | undefined, newState: AdminState, message: string): void {
  console.log(`State change for ${phoneNumber}:`, {
    oldState,
    newState,
    message,
    timestamp: new Date().toISOString()
  });
}

function setAdminState(phoneNumber: string, newState: AdminState, message: string = ''): void {
  const oldState = adminStates.get(phoneNumber);
  adminStates.set(phoneNumber, newState);
  logStateChange(phoneNumber, oldState, newState, message);
}

function getAdminState(phoneNumber: string): AdminState | undefined {
  return adminStates.get(phoneNumber);
}

function setAdminTempData(phoneNumber: string, data: AdminTempData): void {
  adminTempData.set(phoneNumber, data);
}

function getAdminTempData(phoneNumber: string): AdminTempData | undefined {
  return adminTempData.get(phoneNumber);
}

function clearAdminTempData(phoneNumber: string): void {
  adminTempData.delete(phoneNumber);
}

export {
  adminStates,
  adminTempData,
  setAdminState,
  getAdminState,
  setAdminTempData,
  getAdminTempData,
  clearAdminTempData
}; 