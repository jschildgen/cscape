const RevealCscape = (() => {
	let deck;
	let checkInterval;
	// State storage for vertical checks
	const verticalCheckState = {};
	let video_playing = false;

	function getBackgroundVideo() {
		const bg = document.querySelector('.slide-background.present video');
		return bg || null;
	}

	function hasVerticalParent(slide) {
		if (!slide) return false;
		return slide.parentElement && slide.parentElement.closest('section');
	}

	function checkAllVertical(slide, indexh) {
		const slideId = slide.id || `slide-${deck.getSlides().indexOf(slide)}`;
		const verticalSlides = slide.querySelectorAll('section');
		
		// Initialize state if not present
		if (!verticalCheckState[slideId]) {
			verticalCheckState[slideId] = {
				total: verticalSlides.length,
				solved: new Set(),
			};
			console.log(`[CSCAPE] Vertical group ${slideId}: ${verticalSlides.length} slides to solve`);
		}

		const state = verticalCheckState[slideId];

		// Check if all are solved
		if (state.solved.size === state.total) {
			console.log(`[CSCAPE] All vertical slides solved! Next horizontal slide.`);
			deck.slide(indexh + 1);
		}

		// Check all vertical child slides
		verticalSlides.forEach((verticalSlide, index) => {
			const checkName = verticalSlide.dataset.cscapeCheck;
			if (checkName && !state.solved.has(checkName)) {
				fetch(`http://localhost:5000/check/${checkName}`, { signal: AbortSignal.timeout(3000) })
					.then(response => response.json())
					.then(data => {
						if (data.solved) {
							state.solved.add(checkName);
							
							// Jump to the solved slide
							deck.slide(indexh, index);
							console.log(`[CSCAPE] Showing solved vertical slide ${index} (${state.solved.size}/${state.total})`);
						} else {
							console.log(`[CSCAPE] ${checkName} not yet solved`);
						}
					})
					.catch(() => {
						// Error silently handled
					});
			}
		});
	}

	function checkSingle(nextSlide) {
		const checkName = nextSlide.dataset.cscapeCheck;
		if (!checkName) return;

		fetch(`http://localhost:5000/check/${checkName}`, { signal: AbortSignal.timeout(3000) })
			.then(response => response.json())
			.then(data => {
				if (data.solved) {
					console.log(`[CSCAPE] ${checkName} solved - moving to next slide`);
					deck.next();
				} else {
					console.log(`[CSCAPE] ${checkName} not solved yet`);
				}
			})
			.catch(error => {
				console.log(`[CSCAPE] Error checking ${checkName}:`, error.message);
			});
	}

	function check() {
		// Skip checking when video is playing
		if (video_playing) {
			return;
		}
		
		const slides = deck.getSlides();
		const currentIndex = deck.getState().indexh;
		const currentSlide = slides[currentIndex];
		const nextSlide = slides[currentIndex + 1];
		
		if (!nextSlide) {
			console.log(`[CSCAPE] Reached end of presentation - stopping checks`);
			clearInterval(checkInterval);
			return;
		}

		console.log(`[CSCAPE] We're on slide ${currentIndex}`);

		// Check if current slide has vertical children
		if (hasVerticalParent(currentSlide)) {
			// We're on a vertical slide, check the parent
			const parentSlide = currentSlide.parentElement.closest('section');
			checkAllVertical(parentSlide, deck.getState().indexh);
		} else if (hasVerticalParent(nextSlide)) {
			// Next slide is vertical, check its parent
			const parentSlide = nextSlide.parentElement.closest('section');
			checkAllVertical(parentSlide, deck.getState().indexh+1);
		} else {
			// Regular horizontal slide
			checkSingle(nextSlide);
		}
	}

	return {
		id: 'cscape',
		init: (reveal) => {
			deck = reveal;

			// Check if backend is running
			deck.on('ready', () => {
				fetch('http://localhost:5000/', { signal: AbortSignal.timeout(3000) })
					.then(response => response.json())
					.then(data => {
						if (data.title) {
							document.title = data.title + " - CScape";
						}
					})
					.catch(() => {
						const slide = deck.getSlides()[0];
						if (slide) {
							slide.innerHTML = '<p style="color:red;font-size:0.5em;">Backend not reachable at localhost:5000. Please start cscape.py.</p>';
						}
					});
			});

			// Hide background video when it ends so the slide turns black
			deck.on('slidechanged', () => {
				// Add event listeners to all existing videos
				document.querySelectorAll('.slide-background video').forEach(video => {
					video.addEventListener('play', () => {
						video_playing = true;
					});
					video.addEventListener('ended', () => {
						video.style.display = 'none';
						video_playing = false;
					});
					video.addEventListener('pause', () => {
						video_playing = false;
					});
				});
			});

			checkInterval = setInterval(check, 5000);

			// Press 'r' to replay the current slide's background video
			document.addEventListener('keydown', (e) => {
				if (e.key === 'r' || e.key === 'R') {
					const video = getBackgroundVideo();
					if (video) {
						video.style.display = '';
						video.currentTime = 0;
						video.play();
						video_playing = true;
					}
				}
			});
		}
	};
})();
