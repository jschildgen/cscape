const RevealCscape = (() => {
	let deck;
	let checkInterval;

	function getBackgroundVideo() {
		const bg = document.querySelector('.slide-background.present video');
		return bg || null;
	}

	function check() {
		const slides = deck.getSlides();
		const currentIndex = deck.getState().indexh;
		const nextSlide = slides[currentIndex + 1];
		if (!nextSlide) return;

		const checkName = nextSlide.dataset.cscapeCheck;
		if (!checkName) return;

		fetch(`http://localhost:5000/check/${checkName}`, { signal: AbortSignal.timeout(3000) })
			.then(response => response.json())
			.then(data => {
				if (data.solved) {
					deck.next();
				}
			})
			.catch(() => {});
	}

	return {
		id: 'cscape',
		init: (reveal) => {
			deck = reveal;

			// Check if backend is running
			deck.on('ready', () => {
				fetch('http://localhost:5000/', { signal: AbortSignal.timeout(3000) })
					.catch(() => {
						const slide = deck.getSlides()[0];
						if (slide) {
							slide.innerHTML = '<p style="color:red;font-size:0.5em;">Backend not reachable at localhost:5000. Please start cscape.py.</p>';
						}
					});
			});

			// Hide background video when it ends so the slide turns black
			deck.on('ready', () => {
				document.querySelectorAll('.slide-background video').forEach(video => {
					video.addEventListener('ended', () => {
						video.style.display = 'none';
					});
				});
			});

			// Check every 5 seconds if localhost:5000 is reachable
			checkInterval = setInterval(check, 5000);

			// Press 'r' to replay the current slide's background video
			document.addEventListener('keydown', (e) => {
				if (e.key === 'r' || e.key === 'R') {
					const video = getBackgroundVideo();
					if (video) {
						video.style.display = '';
						video.currentTime = 0;
						video.play();
					}
				}
			});
		}
	};
})();
