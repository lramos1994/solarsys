# SolarSys

A PHP application that generates animated SVG solar system visualizations. Planets orbit a sun along bezier curve paths using SVG `animateMotion`, with optional moons.

## Requirements

- PHP 8.2+
- Composer
- Node.js & npm
- Docker & Docker Compose (optional)

## Setup

```bash
# Install dependencies
composer install
npm install

# Build frontend assets
npx mix                  # Development
npx mix --production     # Production
```

## Running

```bash
# With Docker (serves at http://localhost:8000)
docker-compose up -d

# Or with PHP built-in server
php -S localhost:8000
```

## Usage

```php
<?php
use SolarSystemSvg\SolarSystemSvg;

require_once __DIR__ . '/vendor/autoload.php';

$system = new SolarSystemSvg(300, 300);

// addPlanet(size, distance, moon)
// distance: int (circular) or [left, top, right, bottom] (elliptical)
// moon: false or ['size' => int, 'distance' => int]
$system->addPlanet(10, [150, 60, 150, 60], ['size' => 2, 'distance' => 25]);
$system->addPlanet(5, 55, ['size' => 1, 'distance' => 10]);
$system->addPlanet(3, 35, false);

echo $system->render();
```

### Export to SVG file

```php
file_put_contents('solarsystem.svg', $system->render());
```

### Debug mode

Shows orbit paths and removes the starfield background:

```php
$system->debug = true;
```

## Architecture

- `src/SolarSystemSvg.php` - Main class: canvas, sun, background, and SVG assembly
- `src/Planet.php` - Planet rendering: orbit paths, styled planets/moons, animations
- `index.php` - Web entry point
- `export.php` - Standalone SVG export
- `resources/` - SCSS/JS sources (compiled to `dist/` via Laravel Mix)
