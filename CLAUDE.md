# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CSCape stands for Computer Science Escape Room and is an interactive video-based addon for the presentation framework reveal.js to run Escape Rooms. The presentation as well as the Python flask server runs on a Raspberry Pi which is connected to a presenter or TV. The Python service continuoulsy checks whether tasks are solved (e. g. the correct number of rows are within a database table, folders exist on a machine on the network, ...). If yes, the next slide is shown which typically shows a video.

## Architecture

- `index.html` — Main presentation file. All slides are defined here as `<section>` elements inside `div.slides`. Each slide is a level. Typically it shows a video and then the slide turns black.
- `reveal.js/` — reveal.js framework (vendored). Assets are referenced with the `reveal.js/` prefix (e.g. `reveal.js/dist/reveal.js`, `reveal.js/plugin/...`).
- `revealjs-cscape.js` - reveal.js plugin which continously checks whether a level is solved
- `cscape.py` - Web server that checks if levels are solved  

## Conventions

- All user-facing text, comments, and variable names must be in English.

## Serving Locally


## Plugins

