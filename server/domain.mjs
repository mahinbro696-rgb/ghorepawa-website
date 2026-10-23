export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const statuses = ['new','assigned','callback','confirmed','approved','unapproved','dispatched','delivered','cancelled'];
export const labels = {new:'New',assigned:'Assigned',callback:'Call Back Later',confirmed:'Confirmed',approved:'Approved for courier',unapproved:'Unapproved',dispatched:'Sent to courier',delivered:'Complete',cancelled:'Cancelled'};
export function text(value, label, min = 1, max = 100) {
  if (typeof value !== 'string') throw new AppError(400, `${label} must be entered correctly.`);
  const result = value.trim();
  if (result.length < min || result.length > max) throw new AppError(400, `${label} ${min}–${max} characters required.`);
  return result;
}
export function username(value) {
  const result = text(value, 'Username', 3, 40).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(result)) throw new AppError(400, 'Use English letters, numbers, dots, dashes or underscores in your username.');
  return result;
}
export function password(value) { return text(value, 'Password', 12, 128); }
export function phone(value) {
  const normalized = text(value, 'Phone number', 8, 30).replace(/[০-৯]/g, x => String('০১২৩৪৫৬৭৮৯'.indexOf(x))).replace(/[\s()-]/g, '').replace(/^(?:\+88|88)/, '');
  if (!/^01[3-9][0-9]{8}$/.test(normalized)) throw new AppError(400, 'Enter a valid Bangladesh phone number.');
  return normalized;
}
export function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new AppError(400, 'Invalid order identifier.');
  return value;
}
export function parseOrder(body) {
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new AppError(400, 'Quantity must be between 1 and 10 bottles.');
  return {name:text(body.name,'Name',2,100), phone:phone(body.phone),district:text(body.district,'District',2,60),area:text(body.area,'Area',2,80),address:text(body.address,'Address',5,500),quantity,unitPrice:399,total:quantity * 399};
}
// One transition policy drives both server validation and the UI's allowed choices.
export function allowedStatuses(actor, order) {
  if (actor.role === 'moderator') {
    return order.assigned_to === actor.id && ['assigned','callback'].includes(order.status)
      ? ['confirmed','callback','unapproved','cancelled'] : [];
  }
  if (actor.role !== 'admin') return [];
  const choices = {
    new:['confirmed','delivered','callback','cancelled'],
    assigned:['confirmed','delivered','callback','unapproved','cancelled'],
    callback:['confirmed','delivered','callback','unapproved','cancelled'],
    confirmed:['delivered','dispatched','approved','cancelled','unapproved'],
    approved:['delivered','dispatched','cancelled'],
    dispatched:['delivered','cancelled'],
    unapproved:['confirmed','delivered','callback','cancelled']
  };
  return choices[order.status] || [];
}
export function transition(actor, order, next, note, callbackAt) {
  if (!statuses.includes(next)) throw new AppError(400, 'Invalid order status.');
  if (actor.role === 'moderator' && order.assigned_to !== actor.id)
    throw new AppError(403, 'This order is not assigned to you.');
  if (!allowedStatuses(actor,order).includes(next))
    throw new AppError(409, 'This status change is not available. Reopen the order to see current actions.');
  if (['unapproved','cancelled','callback'].includes(next) && !note?.trim())
    throw new AppError(400, 'Enter a reason or call note.');
  if (next === 'callback' && (!callbackAt || !Number.isFinite(Date.parse(callbackAt)) || Date.parse(callbackAt) <= Date.now()))
    throw new AppError(400, 'Select a future callback time.');
}
export function canAssign(order) { return ['new','assigned','callback','unapproved'].includes(order.status); }
