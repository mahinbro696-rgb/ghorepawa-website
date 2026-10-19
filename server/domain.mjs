export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const statuses = ['new','assigned','callback','confirmed','approved','unapproved','dispatched','delivered','cancelled'];
export const labels = {new:'নতুন',assigned:'বরাদ্দ দেওয়া',callback:'পুনরায় কল',confirmed:'চূড়ান্ত যাচাই বাকি',approved:'অনুমোদিত',unapproved:'অননুমোদিত',dispatched:'কুরিয়ারে পাঠানো',delivered:'ডেলিভারি সম্পন্ন',cancelled:'বাতিল'};
export function text(value, label, min = 1, max = 100) {
  if (typeof value !== 'string') throw new AppError(400, `${label} সঠিকভাবে লিখুন।`);
  const result = value.trim();
  if (result.length < min || result.length > max) throw new AppError(400, `${label} ${min}–${max} অক্ষরের মধ্যে লিখুন।`);
  return result;
}
export function username(value) {
  const result = text(value, 'ইউজার আইডি', 3, 40).toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(result)) throw new AppError(400, 'ইউজার আইডিতে ইংরেজি অক্ষর, সংখ্যা, ডট, ড্যাশ বা আন্ডারস্কোর ব্যবহার করুন।');
  return result;
}
export function password(value) { return text(value, 'পাসওয়ার্ড', 12, 128); }
export function phone(value) {
  const normalized = text(value, 'মোবাইল নম্বর', 8, 30).replace(/[০-৯]/g, x => String('০১২৩৪৫৬৭৮৯'.indexOf(x))).replace(/[\s()-]/g, '').replace(/^(?:\+88|88)/, '');
  if (!/^01[3-9][0-9]{8}$/.test(normalized)) throw new AppError(400, 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন।');
  return normalized;
}
export function uuid(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new AppError(400, 'অর্ডারের পরিচয় সঠিক নয়।');
  return value;
}
export function parseOrder(body) {
  const quantity = Number(body.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) throw new AppError(400, 'পরিমাণ ১ থেকে ১০ বোতলের মধ্যে দিন।');
  return {name:text(body.name,'নাম',2,100), phone:phone(body.phone),district:text(body.district,'জেলা',2,60),area:text(body.area,'থানা / উপজেলা',2,80),address:text(body.address,'ঠিকানা',5,500),quantity,unitPrice:399,total:quantity * 399};
}
export function transition(actor, order, next, note, callbackAt) {
  if (!statuses.includes(next)) throw new AppError(400, 'অর্ডারের অবস্থা সঠিক নয়।');
  if (actor.role === 'moderator') {
    if (order.assigned_to !== actor.id) throw new AppError(403, 'এই অর্ডারটি আপনার জন্য বরাদ্দ নেই।');
    if (!['assigned','callback'].includes(order.status) || !['callback','confirmed','unapproved'].includes(next)) throw new AppError(409, 'এই অর্ডারের অবস্থায় মডারেটর পরিবর্তন করতে পারবেন না।');
  } else {
    const allowed = {new:['cancelled'],assigned:['callback','confirmed','unapproved','cancelled'],callback:['callback','confirmed','unapproved','cancelled'],confirmed:['approved','unapproved'],approved:['dispatched','cancelled'],dispatched:['delivered','cancelled'],unapproved:['cancelled']};
    if (!allowed[order.status]?.includes(next)) throw new AppError(409, 'এই পরিবর্তনটি এখন করা যাবে না। বরাদ্দ পরিবর্তনের জন্য Assign ব্যবহার করুন।');
  }
  if (['unapproved','cancelled','callback'].includes(next) && !note?.trim()) throw new AppError(400, 'কারণ বা কলের নোট লিখুন।');
  if (next === 'callback' && (!callbackAt || !Number.isFinite(Date.parse(callbackAt)) || Date.parse(callbackAt) <= Date.now())) throw new AppError(400, 'পুনরায় কল করার ভবিষ্যৎ সময় নির্বাচন করুন।');
}
export function canAssign(order) { return ['new','assigned','callback','unapproved'].includes(order.status); }
