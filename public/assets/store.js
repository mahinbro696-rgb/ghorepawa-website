const currency = value => '৳' + new Intl.NumberFormat('bn-BD').format(value);
let quantity = 1;
const update = () => {
  document.querySelector('#quantity').value = quantity;
  document.querySelector('#subtotal').textContent = currency(quantity * 399);
  document.querySelector('#total').textContent = currency(quantity * 399);
  document.querySelector('#minus').disabled = quantity <= 1;
  document.querySelector('#plus').disabled = quantity >= 10;
};
document.querySelector('#minus').addEventListener('click', () => {quantity = Math.max(1, quantity - 1); update();});
document.querySelector('#plus').addEventListener('click', () => {quantity = Math.min(10, quantity + 1); update();});
document.querySelector('#order-form').addEventListener('submit', event => {
  event.preventDefault();
  document.querySelector('#form-status').textContent = 'ফর্মের প্রিভিউ পরীক্ষা হয়েছে। এটি বাস্তব অর্ডার নয়; আপনার তথ্য পাঠানো বা সংরক্ষণ করা হয়নি।';
});
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
// Pause decorative animation in background tabs.
document.addEventListener('visibilitychange', () => {
  document.querySelectorAll('.product-stage img, .orbit-one').forEach(element => {
    element.style.animationPlayState = document.hidden ? 'paused' : 'running';
  });
});

// Configure a single absolute offer deadline; never restart it on page load.
const offerCountdownBlock = document.querySelector('.countdown-block');
const configuredOfferEnd = offerCountdownBlock?.dataset.offerEndsAt || '';
const offerDeadline = configuredOfferEnd ? Date.parse(configuredOfferEnd) : NaN;
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
function updateOfferTimer() {
  const title = offerCountdownBlock?.querySelector('.countdown-title');
  if (!Number.isFinite(offerDeadline)) {
    if (countdownElement) countdownElement.hidden = true;
    if (title) title.textContent = 'অফার চলমান';
    return false;
  }
  const remaining = Math.max(0, Math.ceil((offerDeadline - Date.now()) / 1000));
  if (countdownElement) countdownElement.hidden = false;
  if (title) title.textContent = remaining > 0 ? 'অফারটি থাকবে আর মাত্র' : 'অফারের সময় শেষ';
  const values = {hours: Math.floor(remaining / 3600), minutes: Math.floor(remaining % 3600 / 60), seconds: remaining % 60};
  for (const [unit, value] of Object.entries(values)) {
    const element = document.querySelector('#timer-' + unit);
    if (element) renderTimerValue(element, digits(value));
  }
  if (remaining === 0) {
    const note = offerCountdownBlock?.querySelector('.countdown-note');
    if (note) note.textContent = 'পরবর্তী অফারের বিস্তারিত জানতে যোগাযোগ করুন';
  }
  return remaining > 0;
}
let offerTimerInterval;
if (updateOfferTimer()) {
  offerTimerInterval = setInterval(() => {
    if (!updateOfferTimer()) clearInterval(offerTimerInterval);
  }, 1000);
}

// Native horizontal scrolling supports swipe, trackpad, keyboard and buttons.
const reviewsTrack = document.querySelector('#reviews-track');
if (reviewsTrack) {
  for (const [id, direction] of [['#reviews-prev', -1], ['#reviews-next', 1]]) {
    document.querySelector(id)?.addEventListener('click', () => {
      const card = reviewsTrack.querySelector('.review-card');
      if (!card) return;
      const gap = parseFloat(getComputedStyle(reviewsTrack).gap) || 0;
      reviewsTrack.scrollBy({left: direction * (card.getBoundingClientRect().width + gap), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
    });
  }
}

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
  motion.addEventListener('change', () => {
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
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) { clearTimeout(timer); cleanup(); }
  }, {once:true});
})();
