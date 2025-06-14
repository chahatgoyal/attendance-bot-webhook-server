// Store admin states
const adminStates = new Map();
const adminTempData = new Map();
function logStateChange(phoneNumber, oldState, newState, message) {
    console.log(`State change for ${phoneNumber}:`, {
        oldState,
        newState,
        message,
        timestamp: new Date().toISOString()
    });
}
function setAdminState(phoneNumber, newState, message = '') {
    const oldState = adminStates.get(phoneNumber);
    adminStates.set(phoneNumber, newState);
    logStateChange(phoneNumber, oldState, newState, message);
}
function getAdminState(phoneNumber) {
    return adminStates.get(phoneNumber);
}
function setAdminTempData(phoneNumber, data) {
    adminTempData.set(phoneNumber, data);
}
function getAdminTempData(phoneNumber) {
    return adminTempData.get(phoneNumber);
}
function clearAdminTempData(phoneNumber) {
    adminTempData.delete(phoneNumber);
}
export { adminStates, adminTempData, setAdminState, getAdminState, setAdminTempData, getAdminTempData, clearAdminTempData };
