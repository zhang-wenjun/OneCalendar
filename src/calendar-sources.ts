export interface CalendarSource {id:string;name:string;url:string;server:string;username:string;secretName:string;color:string;enabled:boolean;readOnly?:boolean}
export const calendarColors=['#2563eb','#0891b2','#16a34a','#d97706','#dc2626','#4f46e5'];
export const safeColor=(value:string|undefined)=>/^#[0-9a-f]{6}$/i.test(value??'')?value!:'#2563eb';
export function refreshMinutes(value:unknown){const n=Number(value);return Number.isFinite(n)&&n>=1&&n<=1440?Math.round(n):5;}
