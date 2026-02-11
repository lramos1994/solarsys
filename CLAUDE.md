# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SolarSys is a PHP application that generates animated SVG solar system visualizations. Planets orbit a sun along bezier curve paths using SVG `animateMotion`, with optional moons. No external PHP libraries are used.

## Build & Development Commands

```bash
# Install dependencies
npm install
composer install

# Build frontend assets (SCSS/JS via Laravel Mix + Webpack)
npx mix                  # Development build
npx mix --production     # Production build

# Docker environment (serves at http://localhost:8000)
docker-compose up -d     # Start PHP-FPM + Nginx containers
docker-compose down      # Stop containers
```

Assets compile from `resources/` to `dist/` (configured in `webpack.mix.js`).

## Architecture

**PHP Backend (src/, PSR-4 autoloaded as `SolarSystemSvg\`):**
- `SolarSystemSvg.php` — Main class. Manages canvas dimensions, sun rendering, coordinate calculations relative to center, and assembles the full SVG output by collecting orbits and planets.
- `Planet.php` — Represents a planet with size, orbital distance, unique ID, and optional moon. Generates SVG bezier orbit paths and animated circles with random duration (4-15s).

**Entry point:** `index.php` — Instantiates `SolarSystemSvg`, adds planets via `addPlanet()`, calls `render()` to output the SVG with the compiled CSS stylesheet.

**Frontend (resources/ → dist/):**
- `resources/styles/main.scss` — Sun glow effect styling
- `resources/scripts/main.js` — Minimal JS (placeholder)
- Laravel Mix compiles these to `dist/`

**Infrastructure:**
- Docker Compose: PHP 8.2-FPM container (`php-app`) + Nginx Alpine container (`php-nginx`)
- Nginx proxies `.php` to FPM on port 9000, exposed on host port 8000
