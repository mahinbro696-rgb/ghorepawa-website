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
