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

// Explicitly labeled demonstration, not an actual offer deadline.
const countdownStart = Date.now();
const demoDuration = 1 * 3600 + 24 * 60 + 33;
const digits = value => new Intl.NumberFormat('bn-BD', {minimumIntegerDigits: 2, useGrouping: false}).format(value);
function updateDemoTimer() {
  const remaining = Math.max(0, demoDuration - Math.floor((Date.now() - countdownStart) / 1000));
  const values = {hours: Math.floor(remaining / 3600), minutes: Math.floor(remaining % 3600 / 60), seconds: remaining % 60};
  for (const [unit, value] of Object.entries(values)) {
    const element = document.querySelector('#timer-' + unit);
    if (element) element.textContent = digits(value);
  }
  if (remaining === 0) clearInterval(demoInterval);
}
const demoInterval = setInterval(updateDemoTimer, 1000);
updateDemoTimer();

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
  const pendingTimers = new Set();
  const activeAnimations = new Set();
  function later(callback, delay) {
    const id = setTimeout(() => { pendingTimers.delete(id); callback(); }, delay);
    pendingTimers.add(id);
  }
  function land(card) {
    if (motion.matches) return;
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
      const animation = card.animate([
        {opacity: 0, transform: 'translateX(-54px) scale(.96)', offset: 0},
        {opacity: 1, transform: 'translateX(5px) scale(1.015)', offset: .65},
        {opacity: 1, transform: 'translateX(-3px) scale(.995)', offset: .78},
        {opacity: 1, transform: 'translateX(2px) scale(1.005)', offset: .88},
        {opacity: 1, transform: 'translateX(0) scale(1)', offset: 1}
      ], {duration: 850, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'backwards'});
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
  if (reducedMotion.matches || !document.querySelector('.headline-banner')) return;
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
