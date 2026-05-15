const RevealCscape = (() => {
	let deck;
	let checkInterval;
	let checkInterval_seconds = 5; // Default to 5 seconds
	// State storage for vertical checks
	const all_parts = {}
	const not_yet_solved = {};
	let video_playing = false;

	let currently_checking = false;

	function getBackgroundVideo() {
		const bg = document.querySelector('.slide-background.present video');
		return bg || null;
	}

	function hasVerticalParent(slide) {
		if (!slide) return false;
		return slide.parentElement && slide.parentElement.closest('section');
	}

	function updateGameDataElements() {
		const slides = deck.getSlides();
		const currentIndex = deck.getState().indexh;
		const currentSlide = slides[currentIndex];
		currentSlide.querySelectorAll('[data-cscape-get]').forEach(element => {
			const key = element.dataset.cscapeGet;
			if (!key) return;

			fetch(`http://localhost:5000/game_data_store/${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(3000) })
				.then(response => {
					if (!response.ok) {
						throw new Error(`HTTP ${response.status}`);
					}
					return response.json();
				})
				.then(data => {
					if (data && data.value !== undefined) {
						element.textContent = data.value;
						console.info(`[CSCAPE] ${key}=${data.value}`)
					}
				})
				.catch(error => {
					console.error(`[CSCAPE] Error fetching game_data_store/${key}:`, error.message);
				});
		});
	}

	function checkAllVertical(slide, indexh) {
		const slideId = slide.id || `slide-${deck.getSlides().indexOf(slide)}`;
		const verticalSlides = slide.querySelectorAll('section');

		const checkName = slide.dataset.cscapeCheck;
		if (!checkName) return;

		if (!not_yet_solved[slideId]) {
			// All parts, e.g. ['this', 'that']
			all_parts[slideId] = Array.from(verticalSlides).map(slide => slide.getAttribute('data-cscape-check-part'));
			
			// Parts that are not solved yet, e.g. ['this', 'that']
			not_yet_solved[slideId] = new Set(all_parts[slideId]);
		}

		// if all parts solved => next horizontal slide
		if(not_yet_solved[slideId].size == 0) {
			deck.slide(indexh + 1);
			return;
		}

		currently_checking = true;

		console.debug("All parts: "+JSON.stringify(all_parts[slideId]));
		console.debug("Checking parts: "+JSON.stringify(Array.from(not_yet_solved[slideId])));

		const params = new URLSearchParams({ parts: Array.from(not_yet_solved[slideId]).join('|') });

		fetch(`http://localhost:5000/check/${checkName}?${params.toString()}`, { signal: AbortSignal.timeout(30000) })
			.then(response => response.json())
			.then(data => {
				if (data.solved === false) {
					console.log(`[CSCAPE] ${checkName} not solved yet`);
				} else {
					console.log(`[CSCAPE] ${checkName}/${data.solved} solved`);
					not_yet_solved[slideId].delete(data.solved);
					deck.slide(indexh, all_parts[slideId].indexOf(data.solved));
				}
			})
			.catch(error => {
				console.log(`[CSCAPE] Error checking ${checkName}:`, error.message);
			})
			.finally(() => {
				currently_checking = false;
			});

	}

	function checkSingle(nextSlide) {
		const checkName = nextSlide.dataset.cscapeCheck;
		if (!checkName) return;

		currently_checking = true;
		fetch(`http://localhost:5000/check/${checkName}`, { signal: AbortSignal.timeout(30000) })
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
			})
			.finally(() => {
				currently_checking = false;
			});
	}

	function check() {
		// Skip checking when video is playing
		if (video_playing) {
			return;
		}

		// Skip checking if we're already in the middle of a check to prevent overlapping checks
		if (currently_checking) {
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

		console.debug(`[CSCAPE] We're on slide ${currentIndex}`);

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
				fetch('http://localhost:5000/start', { signal: AbortSignal.timeout(3000) })
					.then(response => response.json())
					.then(data => {
						if (data.title) {
							document.title = data.title + " - CScape";
						}
						checkInterval_seconds = data.check_interval_seconds || 5; // Use backend value or default to 5 seconds
						updateGameDataElements(); // Initial load of game data elements
						const slide = deck.getSlides()[0];
						if (slide) {							
							// Show a hint if not in fullscreen
							const fsHint = document.createElement('div');
							fsHint.textContent = 'Press F to go fullscreen';
							fsHint.style.position = 'fixed';
							fsHint.style.left = '50%';
							fsHint.style.bottom = '16px';
							fsHint.style.transform = 'translateX(-50%)';
							fsHint.style.padding = '8px 12px';
							fsHint.style.background = 'rgba(0,0,0,0.75)';
							fsHint.style.color = '#fff';
							fsHint.style.fontSize = '16px';
							fsHint.style.borderRadius = '6px';
							fsHint.style.zIndex = '9999';
							fsHint.style.pointerEvents = 'none';
							fsHint.style.display = 'none';
							document.body.appendChild(fsHint);

							const updateFsHint = () => {
								const isFs = !!document.fullscreenElement;
								fsHint.style.display = isFs ? 'none' : 'block';
							};

							updateFsHint();
							document.addEventListener('fullscreenchange', updateFsHint);
							window.addEventListener('resize', updateFsHint);
						}
					})
					.catch(() => {
						const slide = deck.getSlides()[0];
						if (slide) {
							slide.innerHTML = `<p style="color:red;font-size:0.5em;">
								Backend not reachable at localhost:5000. Please start cscape.py.
							</p>`;
						}
					});
			});

			deck.on('slidechanged', () => {
				updateGameDataElements();

				// Hide background video when it ends so the slide turns black
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

			checkInterval = setInterval(check, checkInterval_seconds * 1000);

			document.addEventListener('keydown', (e) => {
				const video = getBackgroundVideo();
				if (!video) return;

				if (e.key === 'r' || e.key === 'R' || e.key === 'Enter') {
					// Replay
					video.style.display = '';
					video.currentTime = 0;
					video.play();
					video_playing = true;
				}
				else if (e.key === 's' || e.key === 'S') {
					// Stop: pause and reset to beginning
					video.pause();
					video.currentTime = 0;
					video_playing = false;
				}
				else if (e.key === 'p' || e.key === 'P') {
					// Toggle play/pause
					if (video.paused) {
						video.play();
						video_playing = true;
					} else {
						video.pause();
						video_playing = false;
					}
				}
			});
		}
	};
})();
