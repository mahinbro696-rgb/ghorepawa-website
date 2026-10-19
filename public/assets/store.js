// Support older mobile browsers as well as current MediaQueryList APIs.
function onMediaChange(query, callback, options) {
  if (query.addEventListener) query.addEventListener('change', callback, options);
  else if (query.addListener) query.addListener(callback);
}
const currency = value => '৳' + new Intl.NumberFormat('bn-BD').format(value);
let quantity = 1;
const update = () => {
  document.querySelector('#form-status')?.replaceChildren();
  document.querySelector('#quantity').value = new Intl.NumberFormat('bn-BD').format(quantity);
  const summaryQuantity = document.querySelector('#summary-quantity');
  if (summaryQuantity) summaryQuantity.textContent = new Intl.NumberFormat('bn-BD').format(quantity);
  document.querySelector('#subtotal').textContent = currency(quantity * 399);
  document.querySelector('#total').textContent = currency(quantity * 399);
  document.querySelector('#minus').disabled = quantity <= 1;
  document.querySelector('#plus').disabled = quantity >= 10;
};
document.querySelector('#minus').addEventListener('click', () => {quantity = Math.max(1, quantity - 1); update();});
document.querySelector('#plus').addEventListener('click', () => {quantity = Math.min(10, quantity + 1); update();});
const orderForm = document.querySelector('#order-form');
const formStatus = document.querySelector('#form-status');
const textFields = [...orderForm.querySelectorAll('input:not([type="tel"]):not([name="website"]), textarea')];
function validateTextField(field) {
  field.setCustomValidity(field.value.trim() ? '' : 'অনুগ্রহ করে এই তথ্যটি লিখুন। শুধু স্পেস গ্রহণযোগ্য নয়।');
}
textFields.forEach(field => {
  field.addEventListener('input', () => validateTextField(field));
  field.addEventListener('blur', () => { field.value = field.value.trim(); validateTextField(field); });
});
orderForm.addEventListener('input', () => formStatus.replaceChildren());
let orderSubmitting = false;
let orderAttempt = null;
orderForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (orderSubmitting) return;
  textFields.forEach(field => { field.value = field.value.trim(); validateTextField(field); });
  if (!orderForm.reportValidity()) return;
  orderSubmitting = true;
  orderForm.querySelectorAll('input,textarea').forEach(field => { field.readOnly = true; });
  const submit = orderForm.querySelector('[type="submit"]');
  submit.disabled = true;
  submit.textContent = 'অর্ডার জমা হচ্ছে…';
  document.querySelector('#minus').disabled = true;
  document.querySelector('#plus').disabled = true;
  formStatus.textContent = 'অনুগ্রহ করে অপেক্ষা করুন…';
  try {
  const payload = {...Object.fromEntries(new FormData(orderForm)), quantity};
  const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload))))).map(n => n.toString(16).padStart(2, '0')).join('');
  try { orderAttempt = JSON.parse(sessionStorage.getItem('ever-strong-order-attempt') || 'null'); } catch {}
  if (!orderAttempt || orderAttempt.fingerprint !== fingerprint) orderAttempt = {key:crypto.randomUUID(), fingerprint};
  try { sessionStorage.setItem('ever-strong-order-attempt', JSON.stringify(orderAttempt)); } catch {}
    const response = await fetch('/api/orders', {
      method:'POST', headers:{'Content-Type':'application/json','Idempotency-Key':orderAttempt.key},
      body:JSON.stringify(payload), signal:typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(45000) : undefined
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'অর্ডার জমা হয়নি। আবার চেষ্টা করুন।');
    formStatus.textContent = 'আপনার অর্ডারের অনুরোধ জমা হয়েছে। অর্ডার নম্বর ES-' + result.reference + '। আমাদের প্রতিনিধি ফোন করে নিশ্চিত করবেন।';
    formStatus.dataset.state = 'success';
  } catch (error) {
    formStatus.textContent = error.name === 'TimeoutError' || error.name === 'TypeError'
      ? 'সংযোগের সমস্যা হচ্ছে। আবার চেষ্টা করুন—একই অনুরোধে দ্বিতীয় অর্ডার তৈরি হবে না।'
      : error.message;
    formStatus.dataset.state = 'error';
  } finally {
    orderSubmitting = false;
    orderForm.querySelectorAll('input,textarea').forEach(field => { field.readOnly = false; });
    submit.disabled = false;
    submit.textContent = 'অর্ডার জমা দিন →';
    document.querySelector('#minus').disabled = quantity <= 1;
    document.querySelector('#plus').disabled = quantity >= 10;
    formStatus.focus({preventScroll:true});
    formStatus.scrollIntoView({block:'center',behavior:'auto'});
  }
});
orderForm.querySelector('[type="submit"]').disabled = false;
update();

// Reveal content once; preserve full visibility without JavaScript or reduced motion.
if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    }
  }, {threshold: 0.08});
  document.querySelectorAll('.details, .care-heading, .care-cards article, .order-intro, .order-card, .faq > div').forEach(element => {
    element.classList.add('reveal-ready');
    observer.observe(element);
  });
}
// Pause decorative sections outside the viewport and in background tabs.
const animatedSections = document.querySelectorAll('.headline-banner, .hero-highlight-points, .hero-offer-card, .product-stage');
const syncBackgroundMotion = () => document.documentElement.classList.toggle('page-background', document.hidden);
document.addEventListener('visibilitychange', syncBackgroundMotion);
syncBackgroundMotion();
if ('IntersectionObserver' in window) {
  const motionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.target.classList.toggle('motion-offscreen', !entry.isIntersecting));
  }, {rootMargin: '80px'});
  animatedSections.forEach(section => motionObserver.observe(section));
}

// A session countdown restarts on reload and loops.
const sessionCountdownDuration = 1 * 3600 + 5 * 60 + 39;
const sessionCountdownStartedAt = Date.now();
function sessionCountdownRemaining(now) {
  const elapsed = Math.max(0, Math.floor((now - sessionCountdownStartedAt) / 1000));
  return sessionCountdownDuration - (elapsed % sessionCountdownDuration);
}
const digits = value => new Intl.NumberFormat('bn-BD', {minimumIntegerDigits: 2, useGrouping: false}).format(value);
const timerReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let countdownInView = true;
const countdownElement = document.querySelector('.countdown');
if (countdownElement && 'IntersectionObserver' in window) {
  const timerObserver = new IntersectionObserver(entries => {
    countdownInView = entries[0].isIntersecting;
  });
  timerObserver.observe(countdownElement);
}
function renderTimerValue(element, text) {
  let current = element.querySelector('.timer-value');
  if (!current) {
    current = document.createElement('span');
    current.className = 'timer-value';
    current.textContent = text;
    element.replaceChildren(current);
    return;
  }
  if (current.textContent === text) return;
  const previousText = current.textContent;
  current.textContent = text;
  element.querySelector('.timer-previous')?.remove();
  if (timerReducedMotion.matches || document.hidden || !countdownInView || !element.animate) return;
  const previous = document.createElement('span');
  previous.className = 'timer-previous';
  previous.setAttribute('aria-hidden', 'true');
  previous.textContent = previousText;
  element.append(previous);
  const options = {duration: 420, easing: 'cubic-bezier(.22,.7,.3,1)'};
  current.animate([{transform:'translateY(-105%)',opacity:.3},{transform:'translateY(0)',opacity:1}], options);
  const animation = previous.animate([{transform:'translateY(0)',opacity:1},{transform:'translateY(105%)',opacity:0}], options);
  animation.onfinish = animation.oncancel = () => previous.remove();
}
function updateSessionTimer() {
  const remaining = sessionCountdownRemaining(Date.now());
  const values = {hours: Math.floor(remaining / 3600), minutes: Math.floor(remaining % 3600 / 60), seconds: remaining % 60};
  for (const [unit, value] of Object.entries(values)) {
    const element = document.querySelector('#timer-' + unit);
    if (element) renderTimerValue(element, digits(value));
  }
}
updateSessionTimer();
setInterval(() => { if (!document.hidden) updateSessionTimer(); }, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) updateSessionTimer(); });

// Seamless left-to-right review motion with explicit pause and static fallback.
(() => {
  const track = document.querySelector('#reviews-track');
  const button = document.querySelector('#reviews-pause');
  const viewport = document.querySelector('.reviews-window');
  if (!track || !button || !viewport) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const originals = [...track.children];
  for (const card of originals) {
    const duplicate = card.cloneNode(true);
    duplicate.classList.add('review-duplicate');
    duplicate.setAttribute('aria-hidden', 'true');
    track.append(duplicate);
  }
  function syncMotion() {
    viewport.classList.toggle('is-moving', !reduced.matches);
    button.hidden = reduced.matches;
  }
  button.addEventListener('click', () => {
    const paused = viewport.classList.toggle('is-paused');
    if (!paused) track.scrollLeft = 0;
    button.setAttribute('aria-pressed', String(paused));
    button.textContent = paused ? 'অ্যানিমেশন চালু করুন' : 'অ্যানিমেশন থামান';
  });
  onMediaChange(reduced, syncMotion);
  syncMotion();
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      viewport.classList.toggle('is-offscreen', !entries[0].isIntersecting);
    });
    observer.observe(viewport);
  }
  document.addEventListener('visibilitychange', () => {
    viewport.classList.toggle('is-background', document.hidden);
  });
})();

// Scroll-triggered highlight entrances with decorative landing smoke.
(() => {
  const list = document.querySelector('.hero-highlight-points');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!list || motion.matches || !('IntersectionObserver' in window) || !Element.prototype.animate) return;
  const cards = [...list.querySelectorAll('li')];
  const lightMotion = window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
  const pendingTimers = new Set();
  const activeAnimations = new Set();
  function later(callback, delay) {
    const id = setTimeout(() => { pendingTimers.delete(id); callback(); }, delay);
    pendingTimers.add(id);
  }
  function land(card) {
    if (motion.matches || lightMotion) return;
    const cloud = document.createElement('span');
    cloud.className = 'highlight-impact-cloud';
    cloud.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 6; i++) {
      const puff = document.createElement('i');
      puff.style.setProperty('--puff-x', (i - 2.5) * 22 + 'px');
      puff.style.setProperty('--puff-y', (i % 2 ? -24 : 17) + 'px');
      cloud.append(puff);
    }
    card.append(cloud);
    card.classList.add('highlight-hit');
    later(() => { cloud.remove(); card.classList.remove('highlight-hit'); }, 1000);
  }
  function enter(card, delay) {
    later(() => {
      card.classList.remove('highlight-pending');
      if (motion.matches) return;
      card.classList.add('highlight-entering');
      const frames = lightMotion ? [
        {opacity: 0, transform: 'translateX(-24px)'},
        {opacity: 1, transform: 'translateX(0)'}
      ] : [
        {opacity: 0, transform: 'translateX(-54px) scale(.96)', offset: 0},
        {opacity: 1, transform: 'translateX(5px) scale(1.015)', offset: .65},
        {opacity: 1, transform: 'translateX(-3px) scale(.995)', offset: .78},
        {opacity: 1, transform: 'translateX(2px) scale(1.005)', offset: .88},
        {opacity: 1, transform: 'translateX(0) scale(1)', offset: 1}
      ];
      const animation = card.animate(frames, {duration: lightMotion ? 480 : 850, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'backwards'});
      activeAnimations.add(animation);
      later(() => land(card), 550);
      animation.onfinish = animation.oncancel = () => {
        activeAnimations.delete(animation);
        card.classList.remove('highlight-entering');
      };
    }, delay);
  }
  const observer = new IntersectionObserver(entries => {
    let stagger = 0;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      enter(entry.target, stagger * 200);
      stagger++;
    }
  }, {threshold: .2, rootMargin: '0px 0px -6% 0px'});
  cards.forEach(card => { card.classList.add('highlight-pending'); observer.observe(card); });
  onMediaChange(motion, () => {
    if (!motion.matches) return;
    observer.disconnect();
    pendingTimers.forEach(clearTimeout);
    pendingTimers.clear();
    activeAnimations.forEach(animation => animation.cancel());
    cards.forEach(card => {
      card.classList.remove('highlight-pending', 'highlight-entering', 'highlight-hit');
      card.querySelector('.highlight-impact-cloud')?.remove();
    });
  });
})();

// Brief decorative haze for the headline arrival; never blocks interaction.
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reducedMotion.matches || window.matchMedia('(max-width: 900px), (pointer: coarse)').matches || !document.querySelector('.headline-banner')) return;
  const haze = document.createElement('div');
  haze.className = 'headline-arrival-haze';
  haze.setAttribute('aria-hidden', 'true');
  const directions = [[-40, 10], [40, 15], [-20, 40], [20, 50], [-50, 60], [50, 65]];
  for (const [x, y] of directions) {
    const cloud = document.createElement('i');
    cloud.style.setProperty('--haze-x', x + 'vw');
    cloud.style.setProperty('--haze-y', y + 'vh');
    haze.append(cloud);
  }
  document.body.append(haze);
  const cleanup = () => haze.remove();
  const timer = setTimeout(cleanup, 2200);
  onMediaChange(reducedMotion, () => {
    if (reducedMotion.matches) { clearTimeout(timer); cleanup(); }
  }, {once:true});
})();

// Accept Bengali digits and common spacing in Bangladeshi mobile numbers.
const customerPhone = document.querySelector('#customer-phone');
customerPhone?.addEventListener('input', () => {
  customerPhone.value = customerPhone.value.replace(/[০-৯]/g, digit => String('০১২৩৪৫৬৭৮৯'.indexOf(digit))).replace(/[\s()-]/g, '');
  customerPhone.setCustomValidity('');
});
customerPhone?.addEventListener('invalid', () => {
  customerPhone.setCustomValidity(customerPhone.validity.valueMissing ? 'আপনার মোবাইল নম্বর লিখুন।' : 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন, যেমন 01712345678।');
});
