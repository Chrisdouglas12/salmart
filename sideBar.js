
const menuIcon = document.querySelector('.menu-icon');
const sideBar = document.querySelector('.side-bar');
const body = document.body;

menuIcon.addEventListener('click', () => {
  sideBar.style.display = sideBar.style.display === 'block' ? 'none' : 'block';
  body.classList.toggle('no-scroll');
});

document.body.addEventListener('click', (e) => {
  if (sideBar.style.display === 'block' && !sideBar.contains(e.target) && !menuIcon.contains(e.target)) {
    sideBar.style.display = 'none';
    body.classList.remove('no-scroll');
  }
});
