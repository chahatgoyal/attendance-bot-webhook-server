export function getNextBusinessDay() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day === 6)
        date.setDate(date.getDate() + 2); // Skip Saturday
    if (day === 0)
        date.setDate(date.getDate() + 1); // Skip Sunday
    return date.toISOString().split("T")[0];
}
export function formatDate(date) {
    return date.toISOString().split("T")[0];
}
export function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6; // 0 is Sunday, 6 is Saturday
}
